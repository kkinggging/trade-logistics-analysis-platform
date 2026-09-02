import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '@/core/store/context';
import { dataProvider } from '@/core/data/provider';
import { RiskSignal, PolicyEvent, InternalAggregate, ProductCost } from '@/core/store/types';
import { KPICards } from './components/KPICards';
import { MarketHealthRadar } from './components/MarketHealthRadar';
import { CostStructurePie } from './components/CostStructurePie';
import { RiskMatrix } from './components/RiskMatrix';
import './Overview.css';

export function Overview() {
  const { state } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [riskSignals, setRiskSignals] = useState<RiskSignal[]>([]);
  const [policyEvents, setPolicyEvents] = useState<PolicyEvent[]>([]);
  const [aggregates, setAggregates] = useState<InternalAggregate[]>([]);
  const [productCosts, setProductCosts] = useState<ProductCost[]>([]);

  useEffect(() => {
    loadOverviewData();
  }, [state.productLine, state.region, state.dateRange]);

  const loadOverviewData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [signals, policies, aggs, costs] = await Promise.all([
        dataProvider.getRiskSignals({
          productLine: state.productLine,
          region: state.region
        }),
        dataProvider.getPolicyEvents(),
        dataProvider.getInternalAggregates({
          productLine: state.productLine,
          region: state.region
        }),
        dataProvider.getProductCosts()
      ]);

      setRiskSignals(signals);
      setPolicyEvents(policies);
      setAggregates(aggs);
      setProductCosts(costs);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const calculateKPIs = () => {
    const totalVolume = aggregates.reduce((sum, agg) => sum + agg.volume_t, 0);
    const totalTarget = aggregates.reduce((sum, agg) => sum + (agg.target_volume_t || 0), 0);
    const completionRate = totalTarget > 0 ? (totalVolume / totalTarget) * 100 : 0;

    const latestCostDate = productCosts.reduce((latest, cost) => cost.effective_date > latest ? cost.effective_date : latest, '');
    const latestCosts = productCosts.filter(cost => cost.effective_date === latestCostDate);
    const previousDates = [...new Set(productCosts.map(cost => cost.effective_date))].filter(date => date < latestCostDate).sort().reverse();
    const previousCosts = previousDates[0] ? productCosts.filter(cost => cost.effective_date === previousDates[0]) : [];
    const avgCost = latestCosts.length > 0 ? latestCosts.reduce((sum, cost) => sum + cost.value_per_ton, 0) / latestCosts.length : 0;
    const previousAvgCost = previousCosts.length > 0 ? previousCosts.reduce((sum, cost) => sum + cost.value_per_ton, 0) / previousCosts.length : 0;
    const costChange = previousAvgCost > 0 ? ((avgCost - previousAvgCost) / previousAvgCost) * 100 : 0;

    const activeRisks = riskSignals.filter(
      s => s.level === 'critical' || s.level === 'high_attention'
    ).length;

    const pendingPolicies = policyEvents.filter(
      p => p.verify_status === 'pending'
    ).length;

    return {
      completionRate: completionRate.toFixed(1),
      costChange: costChange.toFixed(1),
      activeRisks,
      pendingPolicies
    };
  };

  if (error) {
    return (
      <div className="overview-error">
        <h3>加载失败</h3>
        <p>{error}</p>
        <button onClick={loadOverviewData} className="retry-button">
          重试
        </button>
      </div>
    );
  }

  const kpis = calculateKPIs();

  return (
    <div className="overview">
      <div className="overview-header">
        <button onClick={loadOverviewData} className="refresh-button" disabled={loading}>
          🔄 刷新
        </button>
      </div>

      <KPICards kpis={kpis} loading={loading} />

      <div className="overview-grid">
        <MarketHealthRadar
          riskSignals={riskSignals}
          productCosts={productCosts}
          loading={loading}
        />

        <CostStructurePie
          productCosts={productCosts}
          loading={loading}
        />
      </div>

      <RiskMatrix
        riskSignals={riskSignals}
        loading={loading}
      />

      <div className="quick-nav">
        <h3 className="section-title">快速导航</h3>
        <div className="nav-grid">
          <Link to="/cost-calculator" className="nav-card">
            <div className="nav-icon">💰</div>
            <h4 className="nav-title">成本计算器</h4>
            <p className="nav-description">产品成本估算与敏感性分析</p>
          </Link>
          <Link to="/risk-center" className="nav-card">
            <div className="nav-icon">⚠️</div>
            <h4 className="nav-title">风险中心</h4>
            <p className="nav-description">风险信号监控与趋势分析</p>
          </Link>
          <Link to="/dashboard" className="nav-card">
            <div className="nav-icon">📊</div>
            <h4 className="nav-title">市场仪表盘</h4>
            <p className="nav-description">市场行情与政策事件追踪</p>
          </Link>
          <Link to="/morning-brief" className="nav-card">
            <div className="nav-icon">📰</div>
            <h4 className="nav-title">晨报</h4>
            <p className="nav-description">每日市场洞察与决策建议</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
