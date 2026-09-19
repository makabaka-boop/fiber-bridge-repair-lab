/**
 * 工作台状态机：纯函数，便于 Vitest 直接验证 UI 不变量。
 *
 * - 非法导入保留上次有效拓扑（及其基线分析），仅更新错误信息；
 * - 非法试接保留上次试接结果并给出明确错误，基线永不被改写；
 * - 合法试接重新对「原图 + 一条虚拟边」求桥，与基线差集对比。
 */

import { analyzeBridges, type BridgeResult } from './bridges';
import type { Graph } from './graph';
import { compareUtf8 } from './ids';
import { parseTopology } from './validation';

export interface WorkbenchState {
  graph: Graph | null;
  baseline: BridgeResult | null;
  error: string | null;
}

/** 一行基线结果：链路编号 + 断开后较小连通块站点数。 */
export interface BridgeRow {
  edgeId: string;
  smallSide: number;
}

/** 一次合法试接的独立结论。 */
export interface TrialView {
  source: string;
  target: string;
  /** 试接后仍然脆弱的基线链路（断开仍会隔离站点）。 */
  remaining: BridgeRow[];
  /** 相对基线已消除风险的链路。 */
  eliminated: BridgeRow[];
}

export interface TrialState {
  trial: TrialView | null;
  error: string | null;
}

export const EMPTY_TRIAL: TrialState = { trial: null, error: null };

/** 处理一次导入；非法文本保留旧状态（基线不变）。 */
export function importTopology(text: string, previous: WorkbenchState): WorkbenchState {
  const parsed = parseTopology(text);
  if (!parsed.ok) {
    return { ...previous, error: parsed.error };
  }
  const baseline = analyzeBridges(parsed.graph, []);
  return { graph: parsed.graph, baseline, error: null };
}

/** 基线脆弱链路按链路编号的 UTF-8 字节序列排序（认证口径）。 */
export function baselineRows(state: WorkbenchState): BridgeRow[] {
  const { graph, baseline } = state;
  if (!graph || !baseline) return [];
  const rows: BridgeRow[] = [];
  for (let e = 0; e < graph.edgeIds.length; e++) {
    if (baseline.isBridge[e]) {
      rows.push({ edgeId: graph.edgeIds[e], smallSide: baseline.smallSide[e] });
    }
  }
  rows.sort((a, b) => compareUtf8(a.edgeId, b.edgeId));
  return rows;
}

function toRows(graph: Graph, result: BridgeResult, indexes: number[]): BridgeRow[] {
  const rows = indexes.map((e) => ({
    edgeId: graph.edgeIds[e],
    smallSide: result.smallSide[e],
  }));
  rows.sort((a, b) => compareUtf8(a.edgeId, b.edgeId));
  return rows;
}

/**
 * 在两个现有站点间试接一条虚拟备纤。
 * 非法试接（编号不存在 / 相同端点 / 尚无基线）原样返回 previous。
 * 试接结果由对原图副本追加虚拟边后重新求桥得到，基线对象不被触碰。
 */
export function runTrial(
  state: WorkbenchState,
  sourceRaw: string,
  targetRaw: string,
  previous: TrialState,
): TrialState {
  if (!state.graph || !state.baseline) {
    return { ...previous, error: '请先成功导入一份有效拓扑' };
  }
  const source = sourceRaw.trim();
  const target = targetRaw.trim();
  if (source.length === 0 || target.length === 0) {
    return { ...previous, error: '请填写备纤的两个端点站点编号' };
  }

  const indexById = new Map<string, number>();
  state.graph.sites.forEach((id, i) => indexById.set(id, i));
  const u = indexById.get(source);
  if (u === undefined) {
    return { ...previous, error: `试接端点不存在："${source}" 不在当前站点列表中` };
  }
  const v = indexById.get(target);
  if (v === undefined) {
    return { ...previous, error: `试接端点不存在："${target}" 不在当前站点列表中` };
  }
  if (u === v) {
    return { ...previous, error: '备纤的两个端点必须是不同的站点，不能接在同一站点上' };
  }

  // 虚拟边仅作为 analyzeBridges 的入参追加，graph 本体不做任何修改
  const after = analyzeBridges(state.graph, [[u, v]]);

  const remainingIdx: number[] = [];
  const eliminatedIdx: number[] = [];
  for (let e = 0; e < state.graph.edgeIds.length; e++) {
    if (!state.baseline.isBridge[e]) continue; // 只关注基线脆弱链路
    if (after.isBridge[e]) remainingIdx.push(e);
    else eliminatedIdx.push(e);
  }

  return {
    trial: {
      source,
      target,
      remaining: toRows(state.graph, state.baseline, remainingIdx),
      eliminated: toRows(state.graph, state.baseline, eliminatedIdx),
    },
    error: null,
  };
}
