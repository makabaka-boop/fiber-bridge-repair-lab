import { useState, useRef, useCallback } from 'react';

export interface Column<T> {
  key: string;
  title: string;
  width: number;
  render: (row: T, index: number) => string | number;
}

interface VirtualTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  emptyText: string;
  height?: number;
}

const ROW_HEIGHT = 30;
const OVERSCAN = 12;

/**
 * 极简虚拟滚动表格：只渲染视口附近的行，
 * 脆弱链路多达 20 万条时也不会创建海量 DOM。
 */
export function VirtualTable<T>({ columns, rows, emptyText, height = 320 }: VirtualTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = rows.length * ROW_HEIGHT;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visible = Math.ceil(height / ROW_HEIGHT) + OVERSCAN * 2;
  const end = Math.min(rows.length, start + visible);

  const visibleRows: T[] = [];
  for (let i = start; i < end; i++) visibleRows.push(rows[i]);

  return (
    <div className="vtable" ref={bodyRef} onScroll={onScroll} style={{ height }}>
      <div className="vtable-header" role="row">
        {columns.map((c) => (
          <div role="columnheader" key={c.key} style={{ width: c.width }}>
            {c.title}
          </div>
        ))}
      </div>
      <div className="vtable-spacer" style={{ height: totalHeight }}>
        {rows.length === 0 ? (
          <div className="vtable-empty" style={{ top: 8 }}>
            {emptyText}
          </div>
        ) : (
          visibleRows.map((row, k) => {
            const i = start + k;
            return (
              <div
                className="vtable-row"
                role="row"
                key={i}
                style={{ transform: `translateY(${i * ROW_HEIGHT}px)` }}
              >
                {columns.map((c) => (
                  <div role="cell" key={c.key} style={{ width: c.width }} title={String(c.render(row, i))}>
                    {c.render(row, i)}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
