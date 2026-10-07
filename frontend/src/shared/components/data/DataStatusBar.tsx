import { useId, useState, type ReactNode } from 'react';
import './DataStatusBar.css';

export type DataStatusBarState = 'fresh' | 'partial' | 'fallback' | 'unavailable' | 'loading';

const stateText: Record<DataStatusBarState, string> = {
  fresh: '数据已更新',
  partial: '部分数据待核验',
  fallback: '沿用上次成功快照',
  unavailable: '数据暂不可用',
  loading: '正在读取数据',
};

const stateShortText: Record<DataStatusBarState, string> = {
  fresh: '最新',
  partial: '部分',
  fallback: '快照',
  unavailable: '不可用',
  loading: '读取中',
};

function formatTime(value?: string | null) {
  if (!value) return '—';
  return value.replace('T', ' ').replace('Z', '').slice(0, 19);
}

export function latestDataTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value as string)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}

export interface DataStatusBarProps {
  state: DataStatusBarState;
  updatedAt?: string | null;
  source?: string | null;
  snapshot?: string | null;
  coverage?: string | null;
  scope?: string | null;
  details?: ReactNode;
  className?: string;
}

export function DataStatusBar({ state, updatedAt, source, snapshot, coverage, scope, details, className = '' }: DataStatusBarProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const snapshotText = snapshot || (state === 'fallback' ? '沿用上次成功快照' : state === 'loading' ? '正在确认' : '未沿用快照');
  const sourceText = source || '来源未提供';
  const coverageText = coverage || '覆盖口径未提供';
  const scopeText = scope || '当前页面业务口径';

  return (
    <section className={`data-status-bar data-status-bar-${state} ${className}`} aria-label="统一数据状态">
      <div className="data-status-bar-main">
        <div className="data-status-bar-state">
          <span className="data-status-bar-dot" aria-hidden="true" />
          <div>
            <span className="data-status-bar-label">数据状态</span>
            <strong>{stateText[state]}</strong>
          </div>
        </div>
        <div className="data-status-bar-item">
          <span>最后更新时间</span>
          <strong>{formatTime(updatedAt)}</strong>
        </div>
        <div className="data-status-bar-item data-status-bar-source">
          <span>来源</span>
          <strong title={sourceText}>{sourceText}</strong>
        </div>
        <div className="data-status-bar-item data-status-bar-snapshot">
          <span>快照状态</span>
          <strong>{snapshotText}</strong>
        </div>
        <button type="button" className="data-status-bar-toggle" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((current) => !current)}>
          <span>{open ? '收起口径' : '查看口径'}</span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      </div>
      {open && (
        <div className="data-status-bar-details" id={detailsId}>
          <div><span>状态</span><strong>{stateShortText[state]} · {stateText[state]}</strong></div>
          <div><span>覆盖范围</span><strong>{coverageText}</strong></div>
          <div><span>业务口径</span><strong>{scopeText}</strong></div>
          {details}
        </div>
      )}
    </section>
  );
}
