import { FxScenario } from '@/core/store/types';

interface ScenarioComparisonProps {
  baselineCost: number;
  scenarios: FxScenario[];
}

export function ScenarioComparison({ baselineCost, scenarios }: ScenarioComparisonProps) {
  const formatCurrency = (value: number) => {
    return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const calculateScenarioCost = (scenario: FxScenario) => {
    const fxImpact = (scenario.scenario_rate - scenario.base_rate) / scenario.base_rate;
    return baselineCost * (1 + fxImpact * 0.3);
  };

  const scenariosWithCosts = scenarios.map(scenario => ({
    ...scenario,
    cost: calculateScenarioCost(scenario),
    delta: calculateScenarioCost(scenario) - baselineCost,
    deltaPct: ((calculateScenarioCost(scenario) - baselineCost) / baselineCost) * 100
  }));

  const sortedScenarios = [...scenariosWithCosts].sort((a, b) => a.scenario_pct - b.scenario_pct);

  return (
    <div className="scenario-comparison">
      <h3 className="section-title">情景对比</h3>

      <div className="scenario-table">
        <div className="scenario-header">
          <div className="scenario-col">情景</div>
          <div className="scenario-col">汇率</div>
          <div className="scenario-col">总成本 (USD)</div>
          <div className="scenario-col">差异</div>
        </div>

        {sortedScenarios.map((scenario, index) => {
          const isBaseline = scenario.scenario_pct === 0;
          const isDeltaPositive = scenario.delta > 0;

          return (
            <div key={index} className="scenario-row">
              <div className="scenario-col scenario-name">
                {scenario.scenario_name}
                {isBaseline && <span className="scenario-badge">当前</span>}
              </div>
              <div className="scenario-col scenario-rate">
                {scenario.scenario_rate.toFixed(4)}
                <span className={`scenario-change ${isDeltaPositive ? 'positive' : 'negative'}`}>
                  ({scenario.scenario_pct > 0 ? '+' : ''}{scenario.scenario_pct}%)
                </span>
              </div>
              <div className="scenario-col scenario-cost">
                ${formatCurrency(scenario.cost)}
              </div>
              <div className="scenario-col scenario-delta">
                {isBaseline ? (
                  <span className="delta-baseline">基准</span>
                ) : (
                  <div className={`delta-value ${isDeltaPositive ? 'delta-increase' : 'delta-decrease'}`}>
                    <span className="delta-amount">
                      {isDeltaPositive ? '+' : ''}${formatCurrency(Math.abs(scenario.delta))}
                    </span>
                    <span className="delta-percent">
                      ({isDeltaPositive ? '+' : ''}{scenario.deltaPct.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="scenario-note">
        <span className="note-icon">ℹ️</span>
        <span className="note-text">
          情景对比展示不同汇率假设下的成本变化。汇率波动对总成本的影响按30%权重计算（假设汇率敏感成本占比约30%）。
          实际影响因产品和成本结构而异。
        </span>
      </div>
    </div>
  );
}
