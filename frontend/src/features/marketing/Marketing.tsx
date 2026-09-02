import { useState } from 'react';
import { useAppContext } from '@/core/store/context';
import { ProductLine } from '@/core/store/types';
import {
  buildDataDrivenAdvice,
  buildDataDrivenSalesPlan,
  DataDrivenAdvice,
  DataDrivenSalesPlan,
  StrategyDataInputs,
} from '@/core/strategy/engine';
import { loadStrategyData } from '@/core/strategy/data';
import { DataStatus, SourceEvidence } from '@/shared/components/data/DataStatus';
import './Marketing.css';

type StrategyType = 'market_expansion' | 'pricing_adjustment' | 'timing_optimization' | 'risk_mitigation' | 'inventory_optimization';
type TargetRegion = 'global' | 'europe' | 'asia' | 'americas' | 'specific';
type CustomerSegment = 'automotive' | 'construction' | 'manufacturing' | 'distributors' | 'all';
type TimeHorizon = 'immediate' | 'short_term_3mo' | 'medium_term_6mo';
type Priority = 'high' | 'medium' | 'low';

interface StrategyInput {
  targetRegion: TargetRegion;
  specificCountry?: string;
  customerSegment: CustomerSegment;
  timeHorizon: TimeHorizon;
  focusProducts: ProductLine[];
}

interface StrategyCard {
  id: string;
  type: StrategyType;
  priority: Priority;
  title: string;
  description: string;
  triggerFacts: string[];
  impactAnalysis: {
    costRisk: 'low' | 'medium' | 'high';
    timeRisk: 'low' | 'medium' | 'high';
    opportunityCost: string;
  };
  recommendedActions: string[];
  constraints: string[];
  ruleId: string;
  sourceLabels: string[];
  asOf: string[];
  evidenceMeta: DataDrivenAdvice['evidenceMeta'];
  isUserModified: boolean;
  originalContent?: string;
  conflictsWith?: string[];
}

function adviceToCard(advice: DataDrivenAdvice, input: StrategyInput): StrategyCard {
  const type: StrategyType = advice.category === '市场'
    ? 'market_expansion'
    : advice.category === '定价' || advice.category === '汇率'
      ? 'pricing_adjustment'
      : advice.category === '物流'
        ? 'timing_optimization'
        : advice.category === '经营'
          ? 'inventory_optimization'
          : 'risk_mitigation';
  const risk = advice.category === '风险' || advice.priority === '高' ? 'high' : advice.priority === '中' ? 'medium' : 'low';
  return {
    id: advice.id,
    type,
    priority: advice.priority === '高' ? 'high' : advice.priority === '中' ? 'medium' : 'low',
    title: advice.title,
    description: advice.recommendation,
    triggerFacts: advice.evidence,
    impactAnalysis: { costRisk: advice.category === '配额' || advice.category === '风险' ? 'high' : risk, timeRisk: advice.category === '物流' ? 'high' : 'medium', opportunityCost: `适用范围：${input.targetRegion === 'global' ? '全球' : input.targetRegion} · ${input.customerSegment === 'all' ? '全部客户' : input.customerSegment}` },
    recommendedActions: [advice.recommendation],
    constraints: advice.category === '风险' || advice.category === '配额' ? ['必须完成对应数据与合规人工核验'] : ['成交前复核最新快照与客户条件'],
    ruleId: advice.ruleId,
    sourceLabels: advice.sourceLabels,
    asOf: advice.asOf,
    evidenceMeta: advice.evidenceMeta,
    isUserModified: false,
  };
}

const emptyStrategyData: StrategyDataInputs = {
  quotes: [],
  risks: [],
  policies: [],
  aggregates: [],
  costs: [],
  fxScenarios: [],
  shippingOptions: [],
  forex: null,
  taricQuota: null,
  steelExport: null,
  syncStatus: null,
};

function evidenceStateLabel(state: DataDrivenAdvice['evidenceMeta'][number]['state']) {
  return state === 'fresh'
    ? '最新快照'
    : state === 'fallback'
      ? 'fallback · 沿用上次成功快照'
      : state === 'unavailable'
        ? '当前不可用'
        : '状态待确认';
}

function planStateLabel(state: DataDrivenSalesPlan['dataState']) {
  return state === 'ready' ? '数据可用' : state === 'partial' ? '部分数据 · 需复核' : '无可用数据';
}

function effectivePlanState(
  plan: DataDrivenSalesPlan,
  status: Awaited<ReturnType<typeof loadStrategyData>>['syncStatus'],
): DataDrivenSalesPlan['dataState'] {
  if (plan.dataState === 'unavailable') return 'unavailable';
  const sourceStates = Object.values(status?.sources || {}).map((source) => source.state);
  return sourceStates.some((state) => state === 'fallback' || state === 'unavailable') ? 'partial' : plan.dataState;
}

function formatScope(values: string[]) {
  return values.length ? values.join('、') : '日期未提供';
}

function formatTimestamp(value?: string | null) {
  if (!value) return '—';
  return value.replace('T', ' ').replace('Z', '').slice(0, 19);
}

export function Marketing() {
  const { state } = useAppContext();
  const [strategyInput, setStrategyInput] = useState<StrategyInput>({
    targetRegion: state.region,
    customerSegment: 'all',
    timeHorizon: 'short_term_3mo',
    focusProducts: [state.productLine]
  });
  const [strategies, setStrategies] = useState<StrategyCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingStrategy, setEditingStrategy] = useState<string | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<string | null>(null);
  const [salesPlan, setSalesPlan] = useState<DataDrivenSalesPlan | null>(null);
  const [syncStatus, setSyncStatus] = useState<Awaited<ReturnType<typeof loadStrategyData>>['syncStatus']>(null);

  async function generateStrategies() {
    try {
      setLoading(true);
      setError(null);

      const data = await loadStrategyData({ productLine: state.productLine, region: state.region, dateRange: state.dateRange });
      const plan = buildDataDrivenSalesPlan(data);
      setSyncStatus(data.syncStatus);
      const planWithState = { ...plan, dataState: effectivePlanState(plan, data.syncStatus) };
      setSalesPlan(planWithState);
      const generatedStrategies = buildDataDrivenAdvice(data).map((advice) => adviceToCard(advice, strategyInput));
      detectConflicts(generatedStrategies);
      setStrategies(generatedStrategies);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成策略失败');
      // 加载失败时不制造静态建议；已有成功结果继续保留，首次失败明确呈现不可用状态。
      if (!strategies.length) {
        setSalesPlan(buildDataDrivenSalesPlan(emptyStrategyData));
        setSyncStatus(null);
        setStrategies([]);
      }
    } finally {
      setLoading(false);
    }
  }

  function detectConflicts(strategies: StrategyCard[]) {
    // 只标记同一批数据驱动建议中真实存在的“高风险闸门 / 高优先级动作”冲突。
    strategies.forEach((strategy) => { strategy.conflictsWith = []; });
    const blockingStrategies = strategies.filter((strategy) => strategy.type === 'risk_mitigation' && strategy.priority === 'high');
    const highPriorityActions = strategies.filter((strategy) => strategy.type !== 'risk_mitigation' && strategy.priority === 'high');
    blockingStrategies.forEach((blocking) => {
      highPriorityActions.forEach((action) => {
        blocking.conflictsWith?.push(action.id);
        action.conflictsWith = action.conflictsWith || [];
        action.conflictsWith.push(blocking.id);
      });
    });
  }

  function toggleProductFocus(product: ProductLine) {
    setStrategyInput(prev => ({
      ...prev,
      focusProducts: prev.focusProducts.includes(product)
        ? prev.focusProducts.filter(p => p !== product)
        : [...prev.focusProducts, product]
    }));
  }

  function getStrategyTypeLabel(type: StrategyType): string {
    const labels: Record<StrategyType, string> = {
      market_expansion: '市场拓展',
      pricing_adjustment: '定价调整',
      timing_optimization: '时机优化',
      risk_mitigation: '风险缓解',
      inventory_optimization: '库存优化'
    };
    return labels[type];
  }

  function getPriorityColor(priority: Priority): string {
    const colors: Record<Priority, string> = {
      high: 'priority-high',
      medium: 'priority-medium',
      low: 'priority-low'
    };
    return colors[priority];
  }

  function getRiskColor(risk: 'low' | 'medium' | 'high'): string {
    const colors = {
      low: 'risk-low',
      medium: 'risk-medium',
      high: 'risk-high'
    };
    return colors[risk];
  }

  function editStrategy(strategyId: string, field: keyof StrategyCard, value: any) {
    setStrategies(prev => prev.map(s => {
      if (s.id === strategyId) {
        if (!s.isUserModified) {
          s.originalContent = JSON.stringify(s);
        }
        return { ...s, [field]: value, isUserModified: true };
      }
      return s;
    }));
  }

  function recordFeedback(strategyId: string, effectiveness: number) {
    console.log(`策略 ${strategyId} 有效性评分: ${effectiveness}/5`);
    setFeedbackMode(null);
    // 在实际应用中，这里会将反馈发送到后端
  }

  return (
    <div className="marketing-strategy">
      <div className="strategy-header">
      </div>

      <div className="strategy-input-section">
        <h2>策略参数</h2>
        <div className="input-grid-marketing">
          <div className="input-group">
            <label>目标区域</label>
            <select
              value={strategyInput.targetRegion}
              onChange={(e) => setStrategyInput({ ...strategyInput, targetRegion: e.target.value as TargetRegion })}
              className="input-field"
            >
              <option value="global">全球</option>
              <option value="europe">欧洲</option>
              <option value="asia">亚洲</option>
              <option value="americas">美洲</option>
              <option value="specific">特定国家</option>
            </select>
          </div>

          {strategyInput.targetRegion === 'specific' && (
            <div className="input-group">
              <label>指定国家</label>
              <input
                type="text"
                value={strategyInput.specificCountry || ''}
                onChange={(e) => setStrategyInput({ ...strategyInput, specificCountry: e.target.value })}
                className="input-field"
                placeholder="例如: 德国"
              />
            </div>
          )}

          <div className="input-group">
            <label>客户细分</label>
            <select
              value={strategyInput.customerSegment}
              onChange={(e) => setStrategyInput({ ...strategyInput, customerSegment: e.target.value as CustomerSegment })}
              className="input-field"
            >
              <option value="all">全部客户</option>
              <option value="automotive">汽车行业</option>
              <option value="construction">建筑行业</option>
              <option value="manufacturing">制造业</option>
              <option value="distributors">分销商</option>
            </select>
          </div>

          <div className="input-group">
            <label>时间视野</label>
            <select
              value={strategyInput.timeHorizon}
              onChange={(e) => setStrategyInput({ ...strategyInput, timeHorizon: e.target.value as TimeHorizon })}
              className="input-field"
            >
              <option value="immediate">立即行动</option>
              <option value="short_term_3mo">短期 (3个月)</option>
              <option value="medium_term_6mo">中期 (6个月)</option>
            </select>
          </div>
        </div>

        <div className="product-focus-section">
          <label>关注产品</label>
          <div className="product-checkboxes">
            {(['hot-rolled', 'cold-rolled', 'silicon-steel'] as ProductLine[]).map(product => (
              <label key={product} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={strategyInput.focusProducts.includes(product)}
                  onChange={() => toggleProductFocus(product)}
                />
                <span>
                  {product === 'hot-rolled' ? '热轧卷板' :
                   product === 'cold-rolled' ? '冷轧卷板' : '硅钢'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <button onClick={generateStrategies} disabled={loading} className="btn-primary-large">
          {loading ? '生成中...' : '生成策略建议'}
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {salesPlan && (
        <section className={`sales-plan-panel sales-plan-${salesPlan.dataState}`}>
          <div className="sales-plan-head">
            <div>
              <span className="plan-kicker">DATA-DRIVEN OUTPUT</span>
              <h2>{salesPlan.title}</h2>
            </div>
            <div className="sales-plan-status">
              <span className={`plan-state plan-state-${salesPlan.dataState}`}>{planStateLabel(salesPlan.dataState)}</span>
              {syncStatus ? <DataStatus status={syncStatus} /> : <span className="sync-status-unconfirmed">快照状态待确认</span>}
            </div>
          </div>
          <p className="sales-plan-summary">{salesPlan.summary}</p>
          {salesPlan.actions.length ? <ol className="sales-plan-actions">{salesPlan.actions.map((action, index) => <li key={`${action}-${index}`}>{action}</li>)}</ol> : <div className="sales-plan-empty">无可用数据依据，暂不生成销售方案。</div>}
          {salesPlan.guardrails.length > 0 && <div className="sales-plan-guardrails"><strong>成交前置条件</strong>{salesPlan.guardrails.map((item) => <span key={item}>{item}</span>)}</div>}
          <div className="sales-plan-evidence">
            <strong>方案依据</strong>
            {salesPlan.advice.length ? salesPlan.advice.slice(0, 6).map((advice) => (
              <div key={advice.id} className="plan-evidence-item">
                <div className="plan-evidence-title">{advice.title} · 规则 {advice.ruleId}</div>
                <ul className="plan-evidence-facts">
                  {advice.evidence.slice(0, 3).map((fact) => <li key={fact}>{fact}</li>)}
                </ul>
                <div className="evidence-meta-list">
                  {advice.evidenceMeta.map((meta) => (
                    <div key={`${advice.id}-${meta.source}-${meta.coverageEnd || 'unknown'}`} className="evidence-meta-row">
                      <SourceEvidence {...meta} />
                      <span className={`evidence-state evidence-state-${meta.state}`}>
                        {evidenceStateLabel(meta.state)} · 抓取 {formatTimestamp(meta.capturedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )) : <span className="sales-plan-empty-detail">没有可展示的方案依据。</span>}
          </div>
        </section>
      )}

      {strategies.length > 0 && (
        <div className="strategies-section">
          <div className="strategies-header">
            <h2>策略建议 ({strategies.length}条)</h2>
            <div className="strategies-summary">
              <span className="summary-item">
                高优先级: {strategies.filter(s => s.priority === 'high').length}
              </span>
              <span className="summary-item">
                存在冲突: {strategies.filter(s => s.conflictsWith && s.conflictsWith.length > 0).length}
              </span>
            </div>
          </div>

          <div className="strategies-list">
            {strategies.map(strategy => (
              <div key={strategy.id} className="strategy-card">
                <div className="strategy-card-header">
                  <div className="strategy-title-row">
                    <span className={`strategy-type-badge ${getStrategyTypeLabel(strategy.type)}`}>
                      {getStrategyTypeLabel(strategy.type)}
                    </span>
                    <span className={`priority-badge ${getPriorityColor(strategy.priority)}`}>
                      {strategy.priority === 'high' ? '高优先级' :
                       strategy.priority === 'medium' ? '中优先级' : '低优先级'}
                    </span>
                    {strategy.isUserModified && (
                      <span className="user-modified-badge">用户修改</span>
                    )}
                  </div>
                  {editingStrategy === strategy.id ? (
                    <input
                      type="text"
                      value={strategy.title}
                      onChange={(e) => editStrategy(strategy.id, 'title', e.target.value)}
                      className="strategy-title-input"
                      onBlur={() => setEditingStrategy(null)}
                      autoFocus
                    />
                  ) : (
                    <h3
                      className="strategy-title"
                      onClick={() => setEditingStrategy(strategy.id)}
                    >
                      {strategy.title}
                    </h3>
                  )}
                </div>

                <p className="strategy-description">{strategy.description}</p>

                {strategy.conflictsWith && strategy.conflictsWith.length > 0 && (
                  <div className="conflict-warning">
                    ⚠️ 该策略与其他{strategy.conflictsWith.length}条策略存在冲突，需权衡优先级
                  </div>
                )}

                <div className="strategy-section">
                  <h4>触发事实</h4>
                  <ul className="trigger-facts-list">
                    {strategy.triggerFacts.map((fact, idx) => (
                      <li key={idx}>{fact}</li>
                    ))}
                  </ul>
                </div>

                <div className="strategy-section strategy-evidence-section">
                  <div className="strategy-section-heading">
                    <h4>数据依据</h4>
                    <span className="rule-chip">规则 {strategy.ruleId}</span>
                  </div>
                  <div className="evidence-labels">
                    <span>来源：{strategy.sourceLabels.length ? strategy.sourceLabels.join('、') : '未提供'}</span>
                    <span>覆盖日期：{formatScope(strategy.asOf)}</span>
                  </div>
                  <div className="evidence-meta-list">
                    {strategy.evidenceMeta.length ? strategy.evidenceMeta.map((meta) => (
                      <div key={`${strategy.id}-${meta.source}-${meta.coverageEnd || 'unknown'}`} className="evidence-meta-row">
                        <SourceEvidence {...meta} />
                        <span className={`evidence-state evidence-state-${meta.state}`}>
                          {evidenceStateLabel(meta.state)} · 抓取 {formatTimestamp(meta.capturedAt)}
                        </span>
                      </div>
                    )) : <span className="evidence-missing">暂无快照元数据，需人工核验数据来源。</span>}
                  </div>
                </div>

                <div className="strategy-section">
                  <h4>影响分析</h4>
                  <div className="impact-grid">
                    <div className="impact-item">
                      <span className="impact-label">成本风险</span>
                      <span className={`impact-badge ${getRiskColor(strategy.impactAnalysis.costRisk)}`}>
                        {strategy.impactAnalysis.costRisk === 'low' ? '低' :
                         strategy.impactAnalysis.costRisk === 'medium' ? '中' : '高'}
                      </span>
                    </div>
                    <div className="impact-item">
                      <span className="impact-label">时间风险</span>
                      <span className={`impact-badge ${getRiskColor(strategy.impactAnalysis.timeRisk)}`}>
                        {strategy.impactAnalysis.timeRisk === 'low' ? '低' :
                         strategy.impactAnalysis.timeRisk === 'medium' ? '中' : '高'}
                      </span>
                    </div>
                  </div>
                  <div className="opportunity-cost">
                    <strong>机会成本:</strong> {strategy.impactAnalysis.opportunityCost}
                  </div>
                </div>

                <div className="strategy-section">
                  <h4>推荐行动</h4>
                  <ol className="actions-list">
                    {strategy.recommendedActions.map((action, idx) => (
                      <li key={idx}>{action}</li>
                    ))}
                  </ol>
                </div>

                <div className="strategy-section">
                  <h4>约束与风险</h4>
                  <ul className="constraints-list">
                    {strategy.constraints.map((constraint, idx) => (
                      <li key={idx}>{constraint}</li>
                    ))}
                  </ul>
                </div>

                {feedbackMode === strategy.id ? (
                  <div className="feedback-section">
                    <p>策略执行后有效性评分:</p>
                    <div className="feedback-buttons">
                      {[1, 2, 3, 4, 5].map(score => (
                        <button
                          key={score}
                          onClick={() => recordFeedback(strategy.id, score)}
                          className="feedback-btn"
                        >
                          {score}⭐
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setFeedbackMode(strategy.id)}
                    className="btn-feedback"
                  >
                    记录执行反馈
                  </button>
                )}
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
