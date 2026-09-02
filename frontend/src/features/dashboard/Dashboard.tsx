import { useEffect, useState } from 'react';
import { useAppContext } from '@/core/store/context';
import { dataProvider } from '@/core/data/provider';
import { MarketQuote } from '@/core/store/types';
import './Dashboard.css';

interface MetricCardProps {
  title: string;
  value: string;
  unit: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  loading?: boolean;
}

function MetricCard({ title, value, unit, change, changeType = 'neutral', loading }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-title">{title}</span>
      </div>
      {loading ? (
        <div className="metric-loading">加载中...</div>
      ) : (
        <>
          <div className="metric-value">
            <span className="metric-number">{value}</span>
            <span className="metric-unit">{unit}</span>
          </div>
          {change && (
            <div className={`metric-change metric-change-${changeType}`}>
              {change}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Dashboard() {
  const { state, dispatch } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<{
    steelPrice?: MarketQuote;
    freight?: MarketQuote;
    carbonPrice?: MarketQuote;
    fxRate?: MarketQuote;
  }>({});

  useEffect(() => {
    loadDashboardData();
  }, [state.productLine, state.region]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [quotes, policies, risks] = await Promise.all([
        dataProvider.getMarketQuotes({
          productLine: state.productLine,
          region: state.region,
          limit: 20
        }),
        dataProvider.getPolicyEvents({
          limit: 5
        }),
        dataProvider.getRiskSignals({
          limit: 10
        })
      ]);

      const latest = (predicate: (quote: MarketQuote) => boolean) => quotes
        .filter(predicate)
        .sort((a, b) => `${b.date}${b.publish_time}`.localeCompare(`${a.date}${a.publish_time}`))[0];
      const steelPrice = latest(q => q.indicator_code.startsWith('STEEL_') && q.indicator_code.includes('HR')) ||
        latest(q => q.indicator_code.startsWith('STEEL_'));
      const freight = latest(q => q.indicator_code.includes('FREIGHT'));
      const carbonPrice = latest(q => q.indicator_code.includes('CARBON'));
      const fxRate = latest(q => q.indicator_code.includes('FX') || q.indicator_name.toLowerCase().includes('exchange'));

      setMetrics({ steelPrice, freight, carbonPrice, fxRate });

      dispatch({ type: 'SET_MARKET_DATA', payload: quotes });
      dispatch({ type: 'SET_POLICY_EVENTS', payload: policies });
      dispatch({ type: 'SET_RISK_SIGNALS', payload: risks });
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: number | undefined) => {
    if (value === undefined) return '--';
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  };

  const calculateChange = (quote: MarketQuote | undefined) => {
    if (!quote) return undefined;
    const sameIndicator = [...state.marketData, ...(quote ? [quote] : [])]
      .filter(q => q.indicator_code === quote.indicator_code && q.date < quote.date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!sameIndicator || sameIndicator.value === 0) return undefined;
    const change = ((quote.value - sameIndicator.value) / sameIndicator.value) * 100;
    return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
  };

  const getChangeType = (quote: MarketQuote | undefined): 'positive' | 'negative' | 'neutral' => {
    if (!quote) return 'neutral';
    const sameIndicator = [...state.marketData, ...(quote ? [quote] : [])]
      .filter(q => q.indicator_code === quote.indicator_code && q.date < quote.date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!sameIndicator || sameIndicator.value === 0) return 'neutral';
    const change = ((quote.value - sameIndicator.value) / sameIndicator.value) * 100;
    return change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral';
  };

  if (error) {
    return (
      <div className="dashboard-error">
        <h3>加载失败</h3>
        <p>{error}</p>
        <button onClick={loadDashboardData} className="retry-button">
          重试
        </button>
      </div>
    );
  }

  return (
      <div className="dashboard">
      <div className="dashboard-header">
        <button onClick={loadDashboardData} className="refresh-button" disabled={loading}>
          🔄 刷新
        </button>
      </div>

      <div className="metrics-grid">
        <MetricCard
          title="钢材价格"
          value={formatValue(metrics.steelPrice?.value)}
          unit={metrics.steelPrice?.unit || 'USD/t'}
          change={calculateChange(metrics.steelPrice)}
          changeType={getChangeType(metrics.steelPrice)}
          loading={loading}
        />
        <MetricCard
          title="运费指数"
          value={formatValue(metrics.freight?.value)}
          unit={metrics.freight?.unit || 'BDI'}
          change={calculateChange(metrics.freight)}
          changeType={getChangeType(metrics.freight)}
          loading={loading}
        />
        <MetricCard
          title="碳价"
          value={formatValue(metrics.carbonPrice?.value)}
          unit={metrics.carbonPrice?.unit || 'EUR/t'}
          change={calculateChange(metrics.carbonPrice)}
          changeType={getChangeType(metrics.carbonPrice)}
          loading={loading}
        />
        <MetricCard
          title="汇率"
          value={formatValue(metrics.fxRate?.value)}
          unit={metrics.fxRate?.unit || 'CNY/USD'}
          change={calculateChange(metrics.fxRate)}
          changeType={getChangeType(metrics.fxRate)}
          loading={loading}
        />
      </div>

      <div className="dashboard-content">
        <section className="dashboard-section">
          <h3 className="section-title">价格趋势</h3>
          <div className="chart-placeholder">
            <div className="chart-placeholder-content">
              <span>📈</span>
              <p>{state.marketData.length ? '价格趋势数据已加载，可在接入真实行情后展示完整曲线' : '暂无价格趋势数据'}</p>
            </div>
          </div>
        </section>

        <div className="dashboard-grid">
          <section className="dashboard-section">
            <h3 className="section-title">最新政策事件</h3>
            {loading ? (
              <div className="section-loading">加载中...</div>
            ) : state.policyEvents.length === 0 ? (
              <div className="section-empty">暂无政策事件</div>
            ) : (
              <div className="policy-list">
                {state.policyEvents.slice(0, 5).map((event) => (
                  <div key={event.event_id} className="policy-item">
                    <div className="policy-header">
                      <span className={`policy-badge policy-badge-${event.event_type}`}>
                        {event.event_type}
                      </span>
                      <span className="policy-date">{event.publish_date}</span>
                    </div>
                    <h4 className="policy-title">{event.title}</h4>
                    <p className="policy-summary">{event.summary}</p>
                    <div className="policy-meta">
                      <span className="policy-issuer">{event.issuer}</span>
                      <span className="policy-region">{event.country_region}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-section">
            <h3 className="section-title">风险信号摘要</h3>
            {loading ? (
              <div className="section-loading">加载中...</div>
            ) : state.riskSignals.length === 0 ? (
              <div className="section-empty">暂无风险信号</div>
            ) : (
              <div className="risk-list">
                {state.riskSignals.slice(0, 8).map((signal) => (
                  <div key={signal.signal_id} className="risk-item">
                    <div className="risk-header">
                      <span className={`risk-level risk-level-${signal.level}`}>
                        {signal.level === 'critical' ? '严重' :
                         signal.level === 'high_attention' ? '高度关注' :
                         signal.level === 'attention' ? '关注' : '正常'}
                      </span>
                      <span className="risk-score">{signal.score.toFixed(1)}</span>
                    </div>
                    <div className="risk-content">
                      <span className="risk-factor">{signal.factor}</span>
                      <span className="risk-metric">{signal.metric}</span>
                    </div>
                    {signal.delta_pct !== undefined && (
                      <div className="risk-delta">
                        变化: {signal.delta_pct > 0 ? '+' : ''}{signal.delta_pct.toFixed(1)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
