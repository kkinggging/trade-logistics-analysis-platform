import { DataDrivenAdvice } from '@/core/strategy/engine';
import { SourceEvidence } from './DataStatus';
import './DataAdviceCard.css';

const priorityClass = { 高: 'is-high', 中: 'is-medium', 低: 'is-low' } as const;

export function DataAdviceCard({ advice, compact = false }: { advice?: DataDrivenAdvice; compact?: boolean }) {
  if (!advice) return null;
  return (
    <aside className={`data-advice-card ${priorityClass[advice.priority]} ${compact ? 'is-compact' : ''}`}>
      <div className="data-advice-top">
        <span className="data-advice-kicker">数据建议 · {advice.category}</span>
        <span className="data-advice-priority">{advice.priority}优先</span>
      </div>
      <strong>{advice.title}</strong>
      <p>{advice.recommendation}</p>
      {!compact && <div className="data-advice-evidence"><span>触发依据 · 规则 {advice.ruleId}</span>{advice.evidence.slice(0, 2).map((item) => <small key={item}>{item}</small>)}</div>}
      {!compact && advice.evidenceMeta.slice(0, 1).map((meta) => <SourceEvidence key={meta.source} {...meta} />)}
    </aside>
  );
}

