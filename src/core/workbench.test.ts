import { describe, it, expect } from 'vitest';
import {
  importTopology,
  baselineRows,
  runTrial,
  EMPTY_TRIAL,
  type WorkbenchState,
} from './workbench';

const FIGURE_EIGHT = JSON.stringify({
  sites: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
  links: [
    { id: 'L1', source: 'S1', target: 'S2' },
    { id: 'L8', source: 'S1', target: 'S2' },
    { id: 'L2', source: 'S2', target: 'S3' },
    { id: 'L3', source: 'S3', target: 'S1' },
    { id: 'L4', source: 'S3', target: 'S4' },
    { id: 'L5', source: 'S4', target: 'S5' },
    { id: 'L6', source: 'S5', target: 'S6' },
    { id: 'L7', source: 'S6', target: 'S4' },
  ],
});

const CHAIN = JSON.stringify({
  sites: ['a', 'b', 'c', 'd'],
  links: [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
    { id: 'e3', source: 'c', target: 'd' },
  ],
});

describe('importTopology — 非法导入保留上次有效拓扑', () => {
  it('第一次导入非法：无有效拓扑且返回错误', () => {
    const next = importTopology('not json', { graph: null, baseline: null, error: null });
    expect(next.graph).toBeNull();
    expect(next.error).toBeTruthy();
  });

  it('合法导入后再次非法：图与基线不变，只更新错误', () => {
    const first = importTopology(FIGURE_EIGHT, { graph: null, baseline: null, error: null });
    expect(first.graph).not.toBeNull();
    const rowsBefore = baselineRows(first);

    const second = importTopology('{"sites":["x"],"links":[]}', first);
    expect(second.graph).toBe(first.graph);
    expect(second.baseline).toBe(first.baseline);
    expect(second.error).toMatch(/至少/);
    expect(baselineRows(second)).toEqual(rowsBefore);
  });

  it('合法导入后再次合法：基线随新图更新且错误清空', () => {
    const first = importTopology(FIGURE_EIGHT, { graph: null, baseline: null, error: '旧错误' });
    const second = importTopology(CHAIN, first);
    expect(second.error).toBeNull();
    expect(baselineRows(second).map((r) => r.edgeId)).toEqual(['e1', 'e2', 'e3']);
  });
});

describe('基线认证清单', () => {
  it('双环：唯一脆弱链路 L4，断开后较小块 3 个站点', () => {
    const wb = importTopology(FIGURE_EIGHT, { graph: null, baseline: null, error: null });
    const rows = baselineRows(wb);
    expect(rows).toEqual([{ edgeId: 'L4', smallSide: 3 }]);
  });

  it('长链：三桥按编号 UTF-8 字节序输出，较小块分别为 1/2/1', () => {
    const wb = importTopology(CHAIN, { graph: null, baseline: null, error: null });
    expect(baselineRows(wb)).toEqual([
      { edgeId: 'e1', smallSide: 1 },
      { edgeId: 'e2', smallSide: 2 },
      { edgeId: 'e3', smallSide: 1 },
    ]);
  });

  it('无桥图（大环）输出空清单', () => {
    const cycle = JSON.stringify({
      sites: ['a', 'b', 'c', 'd'],
      links: [
        { id: '1', source: 'a', target: 'b' },
        { id: '2', source: 'b', target: 'c' },
        { id: '3', source: 'c', target: 'd' },
        { id: '4', source: 'd', target: 'a' },
      ],
    });
    const wb = importTopology(cycle, { graph: null, baseline: null, error: null });
    expect(baselineRows(wb)).toEqual([]);
  });
});

describe('runTrial — 虚拟备纤', () => {
  const load = (): WorkbenchState =>
    importTopology(FIGURE_EIGHT, { graph: null, baseline: null, error: null });

  it('跨环备纤消除唯一脆弱链路，基线不被改写', () => {
    const wb = load();
    const baselineSnapshot = baselineRows(wb);

    const result = runTrial(wb, 'S1', 'S5', EMPTY_TRIAL);
    expect(result.error).toBeNull();
    expect(result.trial).not.toBeNull();
    expect(result.trial?.eliminated).toEqual([{ edgeId: 'L4', smallSide: 3 }]);
    expect(result.trial?.remaining).toEqual([]);

    // 试接是虚拟的：基线清单原样可复核
    expect(baselineRows(wb)).toEqual(baselineSnapshot);
  });

  it('环内备纤不改变桥：L4 仍然脆弱', () => {
    const wb = load();
    const result = runTrial(wb, 'S1', 'S2', EMPTY_TRIAL);
    expect(result.trial?.remaining).toEqual([{ edgeId: 'L4', smallSide: 3 }]);
    expect(result.trial?.eliminated).toEqual([]);
  });

  it('长链：一条备纤只能消除跨越的桥', () => {
    const wb = importTopology(CHAIN, { graph: null, baseline: null, error: null });
    // 备纤 a-d 形成大环：三桥全部消除
    const all = runTrial(wb, 'a', 'd', EMPTY_TRIAL);
    expect(all.trial?.eliminated.map((r) => r.edgeId)).toEqual(['e1', 'e2', 'e3']);
    expect(all.trial?.remaining).toEqual([]);

    // 备纤 a-c：只消除 e1、e2，e3 仍是桥（d 被隔离时只剩 1 站）
    const partial = runTrial(wb, 'a', 'c', EMPTY_TRIAL);
    expect(partial.trial?.eliminated.map((r) => r.edgeId)).toEqual(['e1', 'e2']);
    expect(partial.trial?.remaining).toEqual([{ edgeId: 'e3', smallSide: 1 }]);
  });

  it('端点不存在：保留上次试接结果并给出明确错误', () => {
    const wb = load();
    const good = runTrial(wb, 'S1', 'S5', EMPTY_TRIAL);
    const bad1 = runTrial(wb, 'S1', 'NOPE', good);
    expect(bad1.error).toMatch(/不在当前站点/);
    expect(bad1.trial).toBe(good.trial);

    const bad2 = runTrial(wb, '  ', 'S2', good);
    expect(bad2.error).toMatch(/两个端点/);
    expect(bad2.trial).toBe(good.trial);
  });

  it('相同端点：保留上次结果并报错', () => {
    const wb = load();
    const good = runTrial(wb, 'S1', 'S5', EMPTY_TRIAL);
    const bad = runTrial(wb, 's2', 'S2', good); // 大小写不同视为不存在
    expect(bad.error).toMatch(/不在当前站点/);
    expect(bad.trial).toBe(good.trial);

    const same = runTrial(wb, 'S2', 'S2', good);
    expect(same.error).toMatch(/不同的站点/);
    expect(same.trial).toBe(good.trial);
  });

  it('无基线时试接被拒绝', () => {
    const result = runTrial({ graph: null, baseline: null, error: null }, 'a', 'b', EMPTY_TRIAL);
    expect(result.error).toMatch(/先成功导入/);
    expect(result.trial).toBeNull();
  });
});
