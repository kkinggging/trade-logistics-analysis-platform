import { DataSyncStatus } from '@/core/store/types';
import './DataStatus.css';

function formatTime(value?: string | null) {
  if (!value) return '—';
  return value.replace('T', ' ').replace('Z', '').slice(0, 19);
}

export function DataStatus({ status, compact = false }: { status: DataSyncStatus | null; compact?: boolean }) {
  const sources = Object.values(status?.sources || {});
  const hasFallback = sources.some((source) => source.state === 'fallback');
  const hasUnavailable = sources.some((source) => source.state === 'unavailable');
  const stateClass = hasFallback ? 'is-fallback' : hasUnavailable ? 'is-unavailable' : 'is-fresh';
  const stateText = hasFallback ? '部分沿用上次成功快照' : hasUnavailable ? '存在不可用数据源' : sources.length ? '外部数据已更新' : '同步状态待确认';

  return (
    <div className={`data-status ${stateClass} ${compact ? 'is-compact' : ''}`} aria-label="数据同步状态">
      <span className="data-status-dot" aria-hidden="true" />
      <strong>{stateText}</strong>
      {!compact && status && <small>最近尝试 {formatTime(status.generated_at)} · {status.schedule}</small>}
      {compact && status && <small>{formatTime(status.generated_at)}</small>}
    </div>
  );
}

export function SourceEvidence({ source, capturedAt, coverageEnd, state, snapshotHash }: {
  source: string;
  capturedAt?: string | null;
  coverageEnd?: string | null;
  state?: string;
  snapshotHash?: string | null;
}) {
  return (
    <div className="source-evidence">
      <span>{source}</span>
      <small>{coverageEnd ? `覆盖至 ${coverageEnd}` : '日期未提供'} · 抓取 {formatTime(capturedAt)}{state === 'fallback' ? ' · 沿用上次成功快照' : ''}{snapshotHash ? ` · ${snapshotHash.slice(0, 10)}` : ''}</small>
    </div>
  );
}

