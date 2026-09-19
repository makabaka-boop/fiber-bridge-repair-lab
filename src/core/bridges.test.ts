import { describe, it, expect } from 'vitest';
import { analyzeBridges } from './bridges';
import { parseTopology } from './validation';
import type { Graph } from './graph';

/** 构造可直接喂给 analyzeBridges 的下标图（链路编号 e0..e{m-1}）。 */
export function makeGraph(siteIds: Array<string | number>, pairs: Array<[number, number]>): Graph {
  return {
    sites: siteIds.map(String),
    edgeIds: pairs.map((_, i) => `e${i}`),
    endpoints: Int32Array.from(pairs.flatMap(([u, v]) => [u, v])),
  };
}

/**
 * 删边预言机（朴素、显然正确的参考实现）：
 * 逐一对每条链路做删除，BFS 数连通分量；删除后不连通即为桥，
 * 较小连通块站点数 = min(可达数, n - 可达数)。
 * 平行链路只删其中一条（按弧上的链路编号跳过），天然正确处理重边。
 */
export function deletionOracle(
  n: number,
  pairs: ReadonlyArray<readonly [number, number]>,
  extra: ReadonlyArray<readonly [number, number]> = [],
): Map<number, number> {
  const bridges = new Map<number, number>();
  const all = [
    ...pairs.map((p, i) => [p[0], p[1], i] as const),
    ...extra.map((p) => [p[0], p[1], -1] as const),
  ];

  for (let skip = 0; skip < pairs.length; skip++) {
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const [u, v, e] of all) {
      if (e === skip) continue;
      adj[u].push(v);
      adj[v].push(u);
    }
    const seen = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    queue[tail++] = 0;
    seen[0] = 1;
    while (head < tail) {
      const u = queue[head++];
      for (const v of adj[u]) {
        if (!seen[v]) {
          seen[v] = 1;
          queue[tail++] = v;
        }
      }
    }
    if (tail < n) bridges.set(skip, Math.min(tail, n - tail));
  }
  return bridges;
}

export function expectMatchesOracle(
  graph: Graph,
  pairs: ReadonlyArray<readonly [number, number]>,
  extra: ReadonlyArray<readonly [number, number]> = [],
): void {
  const result = analyzeBridges(graph, extra);
  const expected = deletionOracle(graph.sites.length, pairs, extra);

  for (let e = 0; e < pairs.length; e++) {
    if (expected.has(e)) {
      expect(result.isBridge[e], `链路 e${e} 应为桥`).toBe(1);
      expect(result.smallSide[e], `链路 e${e} 的较小块站点数`).toBe(expected.get(e));
    } else {
      expect(result.isBridge[e], `链路 e${e} 不应为桥`).toBe(0);
    }
  }
}

/** 确定性伪随机数（mulberry32），保证随机测试可复现、不依赖偶发结果。 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 生成随机连通多重图（先随机生成树保证连通，再随机加边，含平行边）。 */
export function randomConnectedGraph(
  rand: () => number,
  n: number,
): { input: { sites: Array<string | number>; links: Array<{ id: string; source: string | number; target: string | number }> }; pairs: Array<[number, number]> } {
  const sites: Array<string | number> = [];
  for (let i = 0; i < n; i++) sites.push(i % 3 === 0 ? i : `n${i}`);

  const pairs: Array<[number, number]> = [];
  const links: Array<{ id: string; source: string | number; target: string | number }> = [];
  const addLink = (u: number, v: number, id: string) => {
    pairs.push([u, v]);
    links.push({ id, source: sites[u], target: sites[v] });
  };

  // 随机生成树
  for (let v = 1; v < n; v++) {
    addLink(Math.floor(rand() * v), v, `t${v}`);
  }
  // 随机附加边（允许制造平行链路）
  const extra = Math.floor(rand() * (n + 1));
  for (let k = 0; k < extra; k++) {
    let u = Math.floor(rand() * n);
    let v = Math.floor(rand() * n);
    let guard = 0;
    while (u === v && guard++ < 10) v = Math.floor(rand() * n);
    if (u === v) continue; // 禁止自环
    addLink(u, v, `x${k}`);
  }
  return { input: { sites, links }, pairs };
}

describe('analyzeBridges — 手构造图', () => {
  it('树：每条链路都是桥，较小块为子树大小', () => {
    // 0-1-2-3
    const pairs: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    expectMatchesOracle(makeGraph(['a', 'b', 'c', 'd'], pairs), pairs);
  });

  it('环：没有桥', () => {
    const pairs: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ];
    expectMatchesOracle(makeGraph(['a', 'b', 'c', 'd'], pairs), pairs);
  });

  it('平行链路：同端点多条均不是桥', () => {
    const pairs: Array<[number, number]> = [
      [0, 1],
      [1, 0],
      [0, 1],
    ];
    const g = makeGraph(['a', 'b'], pairs);
    const r = analyzeBridges(g);
    expect(Array.from(r.isBridge)).toEqual([0, 0, 0]);
  });

  it('双环（8 字形）：唯一连接链路是桥，两侧各 3 个站点', () => {
    // 环一 0-1-2-0；环二 3-4-5-3；桥 2-3
    const pairs: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 0],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 3],
    ];
    const g = makeGraph(['S1', 'S2', 'S3', 'S4', 'S5', 'S6'], pairs);
    const r = analyzeBridges(g);
    expect(r.isBridge[3]).toBe(1);
    expect(r.smallSide[3]).toBe(3);
    for (const e of [0, 1, 2, 4, 5, 6]) expect(r.isBridge[e]).toBe(0);
  });

  it('带平行边的双环：平行边替换不改变桥判定', () => {
    const pairs: Array<[number, number]> = [
      [0, 1],
      [0, 1], // 与 e0 平行
      [1, 2],
      [2, 0],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 3],
      [5, 3], // 平行
    ];
    expectMatchesOracle(makeGraph(Array.from({ length: 6 }, (_, i) => i + 1), pairs), pairs);
  });
});

describe('analyzeBridges — 删边预言机核对随机小图', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed * 7919 + 13);
    const n = 2 + Math.floor(rand() * 39); // 2..40 个站点
    const { input, pairs } = randomConnectedGraph(rand, n);
    const parsed = parseTopology(JSON.stringify(input));
    if (!parsed.ok) throw new Error(`seed=${seed} 随机图被拒绝: ${parsed.error}`);

    it(`随机连通多重图 seed=${seed} (n=${n}, m=${pairs.length}) 基线与预言机一致`, () => {
      expectMatchesOracle(parsed.graph, pairs);
    });

    // 每个图再随机试接一条虚拟备纤，追加边后仍与预言机一致
    const u = Math.floor(rand() * n);
    let v = Math.floor(rand() * n);
    if (v === u) v = (v + 1) % n;
    it(`随机连通多重图 seed=${seed} 试接 (${u},${v}) 后与预言机一致`, () => {
      expectMatchesOracle(parsed.graph, pairs, [[u, v]]);
    });
  }
});

describe('analyzeBridges — 规模、性能与调用栈', () => {
  it('20 万站点长链：199999 条桥，5 秒内完成，不依赖递归', () => {
    const n = 200_000;
    const pairs: Array<[number, number]> = [];
    for (let i = 1; i < n; i++) pairs.push([i - 1, i]);
    const g = makeGraph(
      Array.from({ length: n }, (_, i) => i),
      pairs,
    );

    const t0 = performance.now();
    const r = analyzeBridges(g);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(5000);
    let bridges = 0;
    for (let e = 0; e < pairs.length; e++) if (r.isBridge[e]) bridges++;
    expect(bridges).toBe(n - 1);
    // 长链正中断开：两侧各 100000
    expect(r.smallSide[99999]).toBe(100000);
    // 末端链路断开：较小块只有 1 个站点
    expect(r.smallSide[0]).toBe(1);
    expect(r.smallSide[pairs.length - 1]).toBe(1);
  });

  it('40 万边近满图在 5 秒内完成', () => {
    const n = 200_000;
    const m = 400_000;
    const pairs: Array<[number, number]> = [];
    for (let i = 1; i < n; i++) pairs.push([i - 1, i]); // 199999 条树边
    // 追加跳跃边（步长取素数避免自环）
    let u = 0;
    while (pairs.length < m) {
      const v = (u + 7919) % n;
      if (u !== v) pairs.push([u, v]);
      u = (u + 104729) % n;
    }
    const g = makeGraph(
      Array.from({ length: n }, (_, i) => i),
      pairs.slice(0, m),
    );
    const t0 = performance.now();
    const r = analyzeBridges(g);
    expect(performance.now() - t0).toBeLessThan(5000);
    // 每条树边都存在一条跨越它的环时无桥；这里只断言类型数组长度正确
    expect(r.isBridge.length).toBe(m);
  }, 20000);

  it('20 万节点大环：没有桥且 5 秒内完成', () => {
    const n = 200_000;
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) pairs.push([i, (i + 1) % n]);
    const g = makeGraph(
      Array.from({ length: n }, (_, i) => i),
      pairs,
    );
    const t0 = performance.now();
    const r = analyzeBridges(g);
    expect(performance.now() - t0).toBeLessThan(5000);
    let bridges = 0;
    for (let e = 0; e < pairs.length; e++) if (r.isBridge[e]) bridges++;
    expect(bridges).toBe(0);
  }, 20000);
});
