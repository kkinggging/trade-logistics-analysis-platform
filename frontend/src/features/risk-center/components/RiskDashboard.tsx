import { RiskSignal } from '@/core/store/types';

interface RiskDashboardProps {
  signals: RiskSignal[];
  loading: boolean;
  onSelectSignal: (signal: RiskSignal) => void;
  onUpdateStatus: (signalId: string, status: 'pending' | 'confirmed' | 'dismissed') => void;
}

export function RiskDashboard({ signals, loading, onSelectSignal, onUpdateStatus }: RiskDashboardProps) {
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

  const formatDelta = (delta: number | undefined) => {
    if (delta === undefined) return '--';
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="risk-dashboard">
        <h3 className="section-title">风险信号仪表盘</h3>
        <div className="risk-loading">加载中...</div>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="risk-dashboard">
        <h3 className="section-title">风险信号仪表盘</h3>
        <div className="risk-empty">暂无风险信号</div>
      </div>
    );
  }

  return (
    <div className="risk-dashboard">
      <h3 className="section-title">风险信号仪表盘</h3>

      <div className="risk-list">
        {signals.map((signal) => (
          <div
            key={signal.signal_id}
            className={`risk-card risk-level-${signal.level}`}
            onClick={() => onSelectSignal(signal)}
          >
            <div className="risk-card-header">
              <div className="risk-card-title">
                <span className={`risk-level-badge level-${signal.level}`}>
                  {getLevelLabel(signal.level)}
                </span>
                <span className="risk-score">评分: {signal.score}</span>
              </div>
              <div className={`risk-status status-${signal.review_status}`}>
                {getStatusLabel(signal.review_status)}
              </div>
            </div>

            <div className="risk-card-body">
              <div className="risk-info-row">
                <span className="info-label">因子:</span>
                <span className="info-value">{signal.factor}</span>
              </div>
              <div className="risk-info-row">
                <span className="info-label">指标:</span>
                <span className="info-value">{signal.metric}</span>
              </div>
              <div className="risk-metrics-row">
                <div className="metric-item">
                  <span className="metric-label">当前值</span>
                  <span className="metric-value">{formatValue(signal.value)}</span>
                </div>
                {signal.baseline !== undefined && (
                  <div className="metric-item">
                    <span className="metric-label">基线</span>
                    <span className="metric-value">{formatValue(signal.baseline)}</span>
                  </div>
                )}
                {signal.delta_pct !== undefined && (
                  <div className="metric-item">
                    <span className="metric-label">变化</span>
                    <span className={`metric-value ${signal.delta_pct >= 0 ? 'delta-positive' : 'delta-negative'}`}>
                      {formatDelta(signal.delta_pct)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="risk-card-footer">
              <span className="risk-freshness">数据新鲜度: {signal.freshness}</span>
              <div className="risk-actions">
                <button
                  className="action-button action-confirm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStatus(signal.signal_id, 'confirmed');
                  }}
                  disabled={signal.review_status === 'confirmed'}
                >
                  确认
                </button>
                <button
                  className="action-button action-dismiss"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStatus(signal.signal_id, 'dismissed');
                  }}
                  disabled={signal.review_status === 'dismissed'}
                >
                  忽略
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
