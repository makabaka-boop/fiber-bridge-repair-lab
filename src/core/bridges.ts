/**
 * 脆弱链路（桥 / bridge）检测。
 *
 * 一条链路断开后若站点集合分裂为两个连通块，它就是桥。
 * 平行链路（同端点多条）互为备份，因此都不是桥——判定依据是
 * 「进入某顶点的具体那条有向弧」而非邻接顶点，本实现据此处理重边。
 *
 * 算法：迭代式 Tarjan（tin / low + 显式栈），全程零递归，
 * 200k 点 / 400k 边规模不会撑爆浏览器调用栈。
 * 存储使用前向星（Int32Array 定长数组），时间 O(V+E)。
 */

import type { Graph } from './graph';

export interface BridgeResult {
  /** 按图中链路下标给出的桥标记，长度为 M。 */
  isBridge: Uint8Array;
  /**
   * 仅桥有效：断开后两个连通块中较小者的站点数。
   * 取 min(子树大小, n - 子树大小)，不输出站点清单。
   */
  smallSide: Int32Array;
}

interface ForwardStar {
  /** 2(M+K) 条有向弧：每条链路正反各一条，虚拟边追加在末尾。 */
  head: Int32Array;
  to: Int32Array;
  edge: Int32Array;
  next: Int32Array;
}

function buildStar(graph: Graph, extra: ReadonlyArray<readonly [number, number]>): ForwardStar {
  const m = graph.edgeIds.length;
  const arcCount = (m + extra.length) * 2;

  const head = new Int32Array(graph.sites.length).fill(-1);
  const to = new Int32Array(arcCount);
  const edge = new Int32Array(arcCount).fill(-1);
  const next = new Int32Array(arcCount);

  let arc = 0;
  const addArc = (u: number, v: number, e: number): void => {
    to[arc] = v;
    edge[arc] = e;
    next[arc] = head[u];
    head[u] = arc;
    arc++;
  };

  for (let e = 0; e < m; e++) {
    const u = graph.endpoints[e * 2];
    const v = graph.endpoints[e * 2 + 1];
    addArc(u, v, e);
    addArc(v, u, e);
  }
  for (let k = 0; k < extra.length; k++) {
    const [u, v] = extra[k];
    addArc(u, v, -1);
    addArc(v, u, -1);
  }

  return { head, to, edge, next };
}

/**
 * 迭代 Tarjan 求桥。
 *
 * @param graph 已通过校验的连通图
 * @param extra 额外追加的虚拟边（站点下标对），用于备纤试接；
 *              虚拟边不修改入参 graph，试接绝不影响基线
 */
export function analyzeBridges(
  graph: Graph,
  extra: ReadonlyArray<readonly [number, number]> = [],
): BridgeResult {
  const n = graph.sites.length;
  const m = graph.edgeIds.length;
  const fs = buildStar(graph, extra);

  const tin = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const subtree = new Int32Array(n).fill(1);
  /** 每个顶点是沿哪条有向弧被访问到的；根为 -1。 */
  const parentArc = new Int32Array(n).fill(-1);
  const isBridge = new Uint8Array(m);
  const smallSide = new Int32Array(m);

  // 显式 DFS 栈：栈帧只存顶点与当前待处理弧游标
  const stackV = new Int32Array(n);
  const stackIt = new Int32Array(n);
  let timer = 0;

  for (let root = 0; root < n; root++) {
    if (tin[root] !== -1) continue; // 输入契约保证连通，保留防御性遍历

    tin[root] = low[root] = timer++;
    let top = 0;
    stackV[0] = root;
    stackIt[0] = fs.head[root];

    while (top >= 0) {
      const u = stackV[top];
      const it = stackIt[top];

      if (it === -1) {
        // u 的所有弧处理完毕：退栈，把 low 与子树大小汇总给父节点
        const parArc = parentArc[u];
        if (parArc !== -1) {
          const p = fs.to[parArc ^ 1];
          if (low[u] < low[p]) low[p] = low[u];
          subtree[p] += subtree[u];

          const e = fs.edge[parArc];
          // 虚拟边（e === -1）不对应基线链路，不参与判定与统计
          if (e !== -1 && low[u] > tin[p]) {
            isBridge[e] = 1;
            const s = subtree[u];
            smallSide[e] = s < n - s ? s : n - s;
          }
        }
        top--;
        continue;
      }

      // 消费当前弧并推进游标；反向弧通过 arc ^ 1 精确跳过（重边安全）
      stackIt[top] = fs.next[it];
      if (parentArc[u] !== -1 && it === (parentArc[u] ^ 1)) continue;

      const v = fs.to[it];
      if (tin[v] === -1) {
        parentArc[v] = it;
        tin[v] = low[v] = timer++;
        top++;
        stackV[top] = v;
        stackIt[top] = fs.head[v];
      } else if (tin[v] < tin[u]) {
        // 指向祖先的回边（无向图需祖先判断，避免父子间重复更新）
        if (tin[v] < low[u]) low[u] = tin[v];
      }
    }
  }

  return { isBridge, smallSide };
}
