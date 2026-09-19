/**
 * 规范化后的拓扑：纯数据、可序列化、与导入文本无关。
 *
 * 站点与链路在解析阶段完成去重与存在性校验，端点以站点数组下标表示；
 * 算法层只接触下标与定长类型数组，不在热路径上做字符串/Map 操作。
 */

export interface Graph {
  /** 按首次出现顺序保存的站点编号（同时承担「下标 → 编号」映射）。 */
  sites: string[];
  /** 按首次出现顺序保存的链路编号。 */
  edgeIds: string[];
  /** 每条链路的两个端点，长度为 2 * M。 */
  endpoints: Int32Array;
}

/** 并查集：迭代式路径压缩 + 按大小合并，无递归。 */
export class DSU {
  parent: Int32Array;
  size: Int32Array;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.size = new Int32Array(n).fill(1);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== x) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(a: number, b: number): boolean {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.size[ra] < this.size[rb]) {
      const t = ra;
      ra = rb;
      rb = t;
    }
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
    return true;
  }
}
