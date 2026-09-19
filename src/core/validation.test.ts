import { describe, it, expect } from 'vitest';
import { parseTopology } from './validation';

const ok = (text: string) => {
  const r = parseTopology(text);
  if (!r.ok) throw new Error(`期望合法却被拒绝: ${r.error}`);
  return r.graph;
};

const bad = (text: string): string => {
  const r = parseTopology(text);
  if (r.ok) throw new Error('期望拒绝却被接受');
  return r.error;
};

describe('parseTopology — 合法输入', () => {
  it('最小合法图：2 站点 1 链路', () => {
    const g = ok(JSON.stringify({ sites: ['a', 'b'], links: [{ id: 'l1', source: 'a', target: 'b' }] }));
    expect(g.sites).toEqual(['a', 'b']);
    expect(g.edgeIds).toEqual(['l1']);
  });

  it('站点接受数字编号与 {id} 对象写法，链路端点用数字', () => {
    const g = ok(
      JSON.stringify({
        sites: [1, 2, { id: 3 }],
        links: [{ id: 10, source: 1, target: 2 }, { id: 11, source: 2, target: 3 }],
      }),
    );
    expect(g.sites).toEqual(['1', '2', '3']);
    expect(g.edgeIds).toEqual(['10', '11']);
  });

  it('平行链路合法：同端点多条不同编号', () => {
    const g = ok(
      JSON.stringify({
        sites: ['a', 'b'],
        links: [
          { id: 'l1', source: 'a', target: 'b' },
          { id: 'l2', source: 'b', target: 'a' },
        ],
      }),
    );
    expect(g.edgeIds).toHaveLength(2);
  });

  it('额外未知字段被忽略', () => {
    const g = ok(
      JSON.stringify({
        meta: { vendor: 'x' },
        sites: ['a', 'b'],
        links: [{ id: 'l', source: 'a', target: 'b', note: 'ok' }],
      }),
    );
    expect(g.sites).toHaveLength(2);
  });

  it('端点下标映射正确', () => {
    const g = ok(
      JSON.stringify({
        sites: ['x', 'y', 'z'],
        links: [
          { id: 'l1', source: 'z', target: 'x' },
          { id: 'l2', source: 'y', target: 'z' },
        ],
      }),
    );
    expect(Array.from(g.endpoints)).toEqual([2, 0, 1, 2]);
  });
});

describe('parseTopology — 非法输入', () => {
  it('非 JSON / 顶层结构错误', () => {
    expect(bad('{')).toMatch(/JSON/);
    expect(bad('[1,2]')).toMatch(/顶层/);
    expect(bad('null')).toMatch(/顶层/);
    expect(bad('{}')).toMatch(/sites/);
    expect(bad(JSON.stringify({ sites: [] }))).toMatch(/links/);
  });

  it('站点数量越界', () => {
    expect(bad(JSON.stringify({ sites: ['only'], links: [] }))).toMatch(/至少/);
    const huge = { sites: Array.from({ length: 200001 }, (_, i) => `s${i}`), links: [] };
    expect(bad(JSON.stringify(huge))).toMatch(/上限/);
  });

  it('链路数量越界', () => {
    const g = { sites: ['a', 'b'], links: Array.from({ length: 400001 }, (_, i) => ({ id: `l${i}`, source: 'a', target: 'b' })) };
    expect(bad(JSON.stringify(g))).toMatch(/链路数/);
  });

  it('站点编号为空或重复', () => {
    expect(bad(JSON.stringify({ sites: ['', 'b'], links: [] }))).toMatch(/不能为空/);
    expect(bad(JSON.stringify({ sites: ['a', 'a'], links: [] }))).toMatch(/重复/);
    expect(bad(JSON.stringify({ sites: [1, '1'], links: [] }))).toMatch(/重复/);
  });

  it('非法编号类型', () => {
    expect(() => parseTopology(JSON.stringify({ sites: [true, 'b'], links: [] }))).not.toThrow();
    const boolIdError = bad(JSON.stringify({ sites: [true, 'b'], links: [] }));
    expect(boolIdError).toMatch(/编号/);
    expect(
      bad(JSON.stringify({ sites: ['a', 'b'], links: [{ id: null, source: 'a', target: 'b' }] })),
    ).toMatch(/编号/);
  });

  it('链路编号重复', () => {
    const text = JSON.stringify({
      sites: ['a', 'b'],
      links: [
        { id: 'l', source: 'a', target: 'b' },
        { id: 'l', source: 'a', target: 'b' },
      ],
    });
    expect(bad(text)).toMatch(/链路编号重复/);
  });

  it('端点不存在', () => {
    expect(
      bad(JSON.stringify({ sites: ['a', 'b'], links: [{ id: 'l', source: 'a', target: 'c' }] })),
    ).toMatch(/不在 sites/);
  });

  it('禁止自环', () => {
    expect(
      bad(JSON.stringify({ sites: ['a', 'b'], links: [{ id: 'l', source: 'a', target: 'a' }] })),
    ).toMatch(/自环/);
  });

  it('缺字段、链路非对象', () => {
    expect(bad(JSON.stringify({ sites: ['a', 'b'], links: [{ source: 'a', target: 'b' }] }))).toMatch(/缺少 id/);
    expect(bad(JSON.stringify({ sites: ['a', 'b'], links: [{ id: 'l', target: 'b' }] }))).toMatch(/缺少 source/);
    expect(bad(JSON.stringify({ sites: ['a', 'b'], links: [{ id: 'l', source: 'a' }] }))).toMatch(/缺少 target/);
    expect(bad(JSON.stringify({ sites: ['a', 'b'], links: [5] }))).toMatch(/必须是对象/);
  });

  it('原图不连通被拒绝', () => {
    const text = JSON.stringify({
      sites: ['a', 'b', 'c', 'd'],
      links: [
        { id: 'l1', source: 'a', target: 'b' },
        { id: 'l2', source: 'c', target: 'd' },
      ],
    });
    expect(bad(text)).toMatch(/连通/);
  });
});
