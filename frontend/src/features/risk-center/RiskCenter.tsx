import { useState, useEffect } from 'react';
import { useAppContext } from '@/core/store/context';
import { dataProvider } from '@/core/data/provider';
import { RiskSignal, PolicyEvent } from '@/core/store/types';
import { RiskDashboard } from './components/RiskDashboard';
import { TrendAnalysis } from './components/TrendAnalysis';
import { EvidencePanel } from './components/EvidencePanel';
import './RiskCenter.css';

export function RiskCenter() {
  const { state, dispatch } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riskSignals, setRiskSignals] = useState<RiskSignal[]>([]);
  const [policyEvents, setPolicyEvents] = useState<PolicyEvent[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<RiskSignal | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>('all');

  useEffect(() => {
    loadRiskData();
  }, [state.productLine, state.region, state.dateRange]);

  const loadRiskData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [signals, policies] = await Promise.all([
        dataProvider.getRiskSignals({
          productLine: state.productLine,
          region: state.region
        }),
        dataProvider.getPolicyEvents({
          productLine: state.productLine
        })
      ]);

      setRiskSignals(signals);
      setPolicyEvents(policies);
      dispatch({ type: 'SET_RISK_SIGNALS', payload: signals });
      dispatch({ type: 'SET_POLICY_EVENTS', payload: policies });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载风险数据失败');
    } finally {
      setLoading(false);
    }
  };

  const updateReviewStatus = async (
    signalId: string,
    status: 'pending' | 'confirmed' | 'dismissed'
  ) => {
    setRiskSignals(signals =>
      signals.map(signal =>
        signal.signal_id === signalId
          ? { ...signal, review_status: status }
          : signal
      )
    );
  };

  const getFilteredSignals = () => {
    if (filterLevel === 'all') return riskSignals;
    return riskSignals.filter(signal => signal.level === filterLevel);
  };

  const getLevelCounts = () => {
    return {
      critical: riskSignals.filter(s => s.level === 'critical').length,
      high_attention: riskSignals.filter(s => s.level === 'high_attention').length,
      attention: riskSignals.filter(s => s.level === 'attention').length,
      normal: riskSignals.filter(s => s.level === 'normal').length
    };
  };

  if (error) {
    return (
      <div className="risk-center-error">
        <h3>加载失败</h3>
        <p>{error}</p>
        <button onClick={loadRiskData} className="retry-button">
          重试
        </button>
      </div>
    );
  }

  const levelCounts = getLevelCounts();
  const filteredSignals = getFilteredSignals();

  return (
    <div className="risk-center">
      <div className="risk-center-header">
        <div className="header-actions">
          <button onClick={loadRiskData} className="refresh-button" disabled={loading}>
            🔄 刷新
          </button>
        </div>
      </div>

      <div className="risk-stats">
        <div
          className={`risk-stat-card stat-critical ${filterLevel === 'critical' ? 'active' : ''}`}
          onClick={() => setFilterLevel(filterLevel === 'critical' ? 'all' : 'critical')}
        >
          <div className="stat-label">严重风险</div>
          <div className="stat-value">{levelCounts.critical}</div>
        </div>
        <div
          className={`risk-stat-card stat-high ${filterLevel === 'high_attention' ? 'active' : ''}`}
          onClick={() => setFilterLevel(filterLevel === 'high_attention' ? 'all' : 'high_attention')}
        >
          <div className="stat-label">高度关注</div>
          <div className="stat-value">{levelCounts.high_attention}</div>
        </div>
        <div
          className={`risk-stat-card stat-attention ${filterLevel === 'attention' ? 'active' : ''}`}
          onClick={() => setFilterLevel(filterLevel === 'attention' ? 'all' : 'attention')}
        >
          <div className="stat-label">关注</div>
          <div className="stat-value">{levelCounts.attention}</div>
        </div>
        <div
          className={`risk-stat-card stat-normal ${filterLevel === 'normal' ? 'active' : ''}`}
          onClick={() => setFilterLevel(filterLevel === 'normal' ? 'all' : 'normal')}
        >
          <div className="stat-label">正常</div>
          <div className="stat-value">{levelCounts.normal}</div>
        </div>
      </div>

      <div className="risk-content">
        <div className="risk-main">
          <RiskDashboard
            signals={filteredSignals}
            loading={loading}
            onSelectSignal={setSelectedSignal}
            onUpdateStatus={updateReviewStatus}
          />

          <TrendAnalysis signals={riskSignals} loading={loading} />
        </div>

        {selectedSignal && (
          <div className="risk-sidebar">
            <EvidencePanel
              signal={selectedSignal}
              policyEvents={policyEvents}
              onClose={() => setSelectedSignal(null)}
              onUpdateStatus={updateReviewStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}
