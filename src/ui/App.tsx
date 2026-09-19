import { useMemo, useRef, useState } from 'react';
import {
  importTopology,
  baselineRows,
  runTrial,
  type WorkbenchState,
  type TrialState,
} from '../core/workbench';
import { VirtualTable, type Column } from './VirtualTable';

/**
 * 内置示例：两个环 + 一条跨环链路（双环图）。
 * 跨环链路是唯一脆弱链路，试接两环之间的备纤即可消除。
 * 另含一对平行链路，验证平行边合法且均非桥。
 */
const SAMPLE = JSON.stringify(
  {
    sites: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
    links: [
      { id: 'L1', source: 'S1', target: 'S2' },
      { id: 'L8', source: 'S1', target: 'S2' }, // 与 L1 平行
      { id: 'L2', source: 'S2', target: 'S3' },
      { id: 'L3', source: 'S3', target: 'S1' },
      { id: 'L4', source: 'S3', target: 'S4' }, // 跨环：唯一脆弱链路
      { id: 'L5', source: 'S4', target: 'S5' },
      { id: 'L6', source: 'S5', target: 'S6' },
      { id: 'L7', source: 'S6', target: 'S4' },
    ],
  },
  null,
  2,
);

const bridgeColumns: Column<{ edgeId: string; smallSide: number }>[] = [
  { key: 'edgeId', title: '脆弱链路编号', width: 260, render: (r) => r.edgeId },
  {
    key: 'smallSide',
    title: '断开后较小连通块站点数',
    width: 260,
    render: (r) => r.smallSide,
  },
];

const EMPTY_BASELINE: WorkbenchState = { graph: null, baseline: null, error: null };
const EMPTY_TRIAL: TrialState = { trial: null, error: null };

export function App() {
  const [text, setText] = useState('');
  const [wb, setWb] = useState<WorkbenchState>(EMPTY_BASELINE);
  const [busy, setBusy] = useState(false);
  const [trial, setTrial] = useState<TrialState>(EMPTY_TRIAL);
  const [runningTrial, setRunningTrial] = useState(false);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => baselineRows(wb), [wb]);

  const handleImport = () => {
    const input = text;
    setBusy(true);
    // 推迟到下一帧执行，先渲染忙碌状态，避免大文件导入时界面无响应
    setTimeout(() => {
      const next = importTopology(input, wb);
      setWb(next);
      if (next.error === null) setTrial(EMPTY_TRIAL); // 新基线生效，旧试接作废
      setBusy(false);
    }, 20);
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    const input = await file.text();
    setText(input);
    setTimeout(() => {
      const next = importTopology(input, wb);
      setWb(next);
      if (next.error === null) setTrial(EMPTY_TRIAL);
      setBusy(false);
    }, 20);
  };

  const handleTrial = () => {
    setRunningTrial(true);
    const s = source;
    const t = target;
    setTimeout(() => {
      // 非法试接时 runTrial 原样保留上次结果，仅刷新错误
      setTrial((prev) => runTrial(wb, s, t, prev));
      setRunningTrial(false);
    }, 20);
  };

  const siteSuggestions = useMemo(() => {
    if (!wb.graph) return [] as string[];
    return wb.graph.sites;
  }, [wb.graph]);

  return (
    <main className="page">
      <header>
        <h1>园区光纤环网拓扑工作台</h1>
        <p className="subtitle">
          找出单链路断开即隔离站点的脆弱段（桥），并试接一条虚拟备纤核对消险效果
        </p>
      </header>

      <section className="card">
        <h2>1. 拓扑导入</h2>
        <textarea
          aria-label="拓扑 JSON 输入"
          className="json-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"sites": ["S1", "S2"], "links": [{"id": "L1", "source": "S1", "target": "S2"}]}'
          spellCheck={false}
        />
        <div className="toolbar">
          <button onClick={handleImport} disabled={busy || text.length === 0}>
            {busy ? '解析中…' : '导入并分析基线'}
          </button>
          <button
            onClick={() => setText(SAMPLE)}
            disabled={busy}
            className="secondary"
          >
            填入示例（双环）
          </button>
          <button className="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            选择 JSON 文件
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              void handleFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          {wb.graph && !busy && (
            <span className="stat">
              当前有效拓扑：{wb.graph.sites.length} 个站点 / {wb.graph.edgeIds.length} 条链路
            </span>
          )}
        </div>
        {wb.error && (
          <div className="error" role="alert">
            导入被拒绝，已保留上一次有效拓扑：{wb.error}
          </div>
        )}
      </section>

      <section className="card">
        <h2>
          2. 基线：脆弱链路清单
          {wb.baseline && <span className="count-badge">共 {rows.length} 条</span>}
        </h2>
        {!wb.graph ? (
          <p className="hint">尚未导入有效拓扑。结果按链路编号的 UTF-8 字节序列排序。</p>
        ) : (
          <VirtualTable
            columns={bridgeColumns}
            rows={rows}
            emptyText="没有脆弱链路：任意单条链路断开，网络都保持连通（全图为双连通结构）。"
            height={300}
          />
        )}
        <p className="hint">说明：仅输出断开后较小连通块的站点数，不输出站点清单。</p>
      </section>

      <section className="card">
        <h2>3. 试接一条虚拟备纤</h2>
        <div className="trial-form">
          <label>
            端点 A
            <input
              list="site-list"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="现有站点编号"
              aria-label="备纤端点 A"
            />
          </label>
          <label>
            端点 B
            <input
              list="site-list"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="不同于 A 的现有站点"
              aria-label="备纤端点 B"
            />
          </label>
          <datalist id="site-list">
            {siteSuggestions.slice(0, 1000).map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          <button onClick={handleTrial} disabled={runningTrial || !wb.graph}>
            {runningTrial ? '试接分析中…' : '试接并对比基线'}
          </button>
        </div>
        <p className="hint">
          试接为虚拟操作，不改写基线；端点必须来自现有站点且互不相同；平行链路合法。
        </p>

        {trial.error && (
          <div className="error" role="alert">
            非法试接，已保留上次试接结果：{trial.error}
          </div>
        )}

        {trial.trial && (
          <div className="trial-result">
            <h3>
              备纤 {trial.trial.source} — {trial.trial.target} 的结论
            </h3>
            <div className="trial-grid">
              <div>
                <h4 className="remain">
                  仍脆弱（{trial.trial.remaining.length} 条）
                </h4>
                <VirtualTable
                  columns={bridgeColumns}
                  rows={trial.trial.remaining}
                  emptyText="无：基线脆弱链路已全部消除。"
                  height={240}
                />
              </div>
              <div>
                <h4 className="eliminated">
                  已消除（{trial.trial.eliminated.length} 条）
                </h4>
                <VirtualTable
                  columns={bridgeColumns}
                  rows={trial.trial.eliminated}
                  emptyText="无：该备纤未消除任何基线脆弱链路。"
                  height={240}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      <footer>
        算法：迭代式 Tarjan 桥检测 O(V+E)，零递归；重边按具体弧判定，平行链路精确处理。
      </footer>
    </main>
  );
}
