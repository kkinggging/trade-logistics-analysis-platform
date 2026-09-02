import { RiskSignal, PolicyEvent } from '@/core/store/types';

interface EvidencePanelProps {
  signal: RiskSignal;
  policyEvents: PolicyEvent[];
  onClose: () => void;
  onUpdateStatus: (signalId: string, status: 'pending' | 'confirmed' | 'dismissed') => void;
}

export function EvidencePanel({ signal, policyEvents, onClose, onUpdateStatus }: EvidencePanelProps) {
  const getLevelLabel = (level: string) => {
    const labels: Record<string, string> = {
      critical: '严重',
      high_attention: '高度关注',
      attention: '关注',
      normal: '正常'
    };
    return labels[level] || level;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: '待审核',
      confirmed: '已确认',
      dismissed: '已忽略'
    };
    return labels[status] || status;
  };

  const formatValue = (value: number) => {
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  };

  const relatedPolicies = policyEvents.filter(policy =>
    signal.evidence_ref?.some(ref => policy.event_id === ref)
  );

  return (
    <div className="evidence-panel">
      <div className="evidence-header">
        <h3>风险信号详情</h3>
        <button className="close-button" onClick={onClose}>✕</button>
      </div>

      <div className="evidence-content">
        <div className="evidence-section">
          <h4 className="evidence-section-title">基本信息</h4>
          <div className="evidence-info">
            <div className="info-item">
              <span className="info-label">信号ID:</span>
              <span className="info-value">{signal.signal_id}</span>
            </div>
            <div className="info-item">
              <span className="info-label">因子:</span>
              <span className="info-value">{signal.factor}</span>
            </div>
            <div className="info-item">
              <span className="info-label">指标:</span>
              <span className="info-value">{signal.metric}</span>
            </div>
            <div className="info-item">
              <span className="info-label">级别:</span>
              <span className={`level-badge level-${signal.level}`}>
                {getLevelLabel(signal.level)}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">评分:</span>
              <span className="info-value">{signal.score}</span>
            </div>
            <div className="info-item">
              <span className="info-label">审核状态:</span>
              <span className={`status-badge status-${signal.review_status}`}>
                {getStatusLabel(signal.review_status)}
              </span>
            </div>
          </div>
        </div>

        <div className="evidence-section">
          <h4 className="evidence-section-title">数值信息</h4>
          <div className="evidence-metrics">
            <div className="metric-card">
              <span className="metric-card-label">当前值</span>
              <span className="metric-card-value">{formatValue(signal.value)}</span>
            </div>
            {signal.baseline !== undefined && (
              <div className="metric-card">
                <span className="metric-card-label">基线</span>
                <span className="metric-card-value">{formatValue(signal.baseline)}</span>
              </div>
            )}
            {signal.delta_pct !== undefined && (
              <div className="metric-card">
                <span className="metric-card-label">变化幅度</span>
                <span className={`metric-card-value ${signal.delta_pct >= 0 ? 'positive' : 'negative'}`}>
                  {signal.delta_pct >= 0 ? '+' : ''}{signal.delta_pct.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {signal.evidence_ref && signal.evidence_ref.length > 0 && (
          <div className="evidence-section">
            <h4 className="evidence-section-title">证据引用</h4>
            <div className="evidence-refs">
              {signal.evidence_ref.map((ref, index) => (
                <div key={index} className="evidence-ref-item">
                  <span className="ref-icon">📄</span>
                  <span className="ref-id">{ref}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {relatedPolicies.length > 0 && (
          <div className="evidence-section">
            <h4 className="evidence-section-title">关联政策事件</h4>
            <div className="related-policies">
              {relatedPolicies.map((policy) => (
                <div key={policy.event_id} className="policy-card">
                  <div className="policy-card-header">
                    <span className={`policy-type type-${policy.event_type}`}>
                      {policy.event_type}
                    </span>
                    <span className="policy-date">{policy.publish_date}</span>
                  </div>
                  <h5 className="policy-card-title">{policy.title}</h5>
                  <p className="policy-card-summary">{policy.summary}</p>
                  <div className="policy-card-meta">
                    <span className="policy-issuer">{policy.issuer}</span>
                    <span className="policy-region">{policy.country_region}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="evidence-section">
          <h4 className="evidence-section-title">元数据</h4>
          <div className="evidence-info">
            <div className="info-item">
              <span className="info-label">时间戳:</span>
              <span className="info-value">{signal.as_of}</span>
            </div>
            <div className="info-item">
              <span className="info-label">数据新鲜度:</span>
              <span className="info-value">{signal.freshness}</span>
            </div>
            {signal.rule_id && (
              <div className="info-item">
                <span className="info-label">规则ID:</span>
                <span className="info-value">{signal.rule_id}</span>
              </div>
            )}
          </div>
        </div>

        <div className="evidence-actions">
          <button
            className="action-button action-confirm-full"
            onClick={() => onUpdateStatus(signal.signal_id, 'confirmed')}
            disabled={signal.review_status === 'confirmed'}
          >
            确认风险
          </button>
          <button
            className="action-button action-dismiss-full"
            onClick={() => onUpdateStatus(signal.signal_id, 'dismissed')}
            disabled={signal.review_status === 'dismissed'}
          >
            忽略风险
          </button>
          <button
            className="action-button action-reset"
            onClick={() => onUpdateStatus(signal.signal_id, 'pending')}
            disabled={signal.review_status === 'pending'}
          >
            重置状态
          </button>
        </div>
      </div>
    </div>
  );
}
