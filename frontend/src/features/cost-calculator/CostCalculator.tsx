import { useState, useEffect } from 'react';
import { dataProvider } from '@/core/data/provider';
import { ProductCost, FxScenario, TradeTerm } from '@/core/store/types';
import { CostBreakdown } from './components/CostBreakdown';
import { ScenarioComparison } from './components/ScenarioComparison';
import { SensitivityChart } from './components/SensitivityChart';
import './CostCalculator.css';

interface CostInput {
  productCode: string;
  spec: string;
  quantity: number;
  tradeTerm: TradeTerm;
  origin: string;
  destination: string;
}

interface CostResult {
  baseSteel: number;
  inlandFreight: number;
  oceanFreight: number;
  insurance: number;
  tariff: number;
  cbam: number;
  total: number;
}

export function CostCalculator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [input, setInput] = useState<CostInput>({
    productCode: 'HR-Q235B-3.0',
    spec: '3.0mm x 1250mm',
    quantity: 100,
    tradeTerm: 'CFR',
    origin: 'CN-Shanghai',
    destination: 'DE-Hamburg'
  });

  const [productCosts, setProductCosts] = useState<ProductCost[]>([]);
  const [fxScenarios, setFxScenarios] = useState<FxScenario[]>([]);
  const [costResult, setCostResult] = useState<CostResult | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [costs, scenarios] = await Promise.all([
        dataProvider.getProductCosts(),
        dataProvider.getFxScenarios()
      ]);

      setProductCosts(costs);
      setFxScenarios(scenarios);

      const baseScenario = scenarios.find(s => s.scenario_name === 'Current Rate');
      if (baseScenario) {
        setSelectedScenario(baseScenario.scenario_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const calculateCost = () => {
    const relevantCosts = productCosts.filter(
      c => c.product_code === input.productCode &&
           c.trade_term === input.tradeTerm &&
           c.origin === input.origin &&
           c.destination === input.destination
    );

    const getComponent = (code: string): number => {
      const cost = relevantCosts.find(c => c.component_code === code || (code === 'TARIFF' && c.component_code === 'CUSTOMS_DUTY'));
      return cost ? cost.value_per_ton : 0;
    };

    if (relevantCosts.length === 0) {
      setCostResult(null);
      setError('没有找到匹配的成本数据，请检查产品代码、贸易条款、起运地和目的地。');
      return;
    }

    const baseSteel = getComponent('BASE_STEEL');
    const inlandFreight = getComponent('INLAND_FREIGHT');
    const oceanFreight = getComponent('OCEAN_FREIGHT');
    const insurance = getComponent('INSURANCE');
    const tariff = getComponent('TARIFF');
    const cbam = getComponent('CBAM');

    const result: CostResult = {
      baseSteel: baseSteel * input.quantity,
      inlandFreight: inlandFreight * input.quantity,
      oceanFreight: oceanFreight * input.quantity,
      insurance: insurance * input.quantity,
      tariff: tariff * input.quantity,
      cbam: cbam * input.quantity,
      total: 0
    };

    result.total = result.baseSteel + result.inlandFreight + result.oceanFreight +
                   result.insurance + result.tariff + result.cbam;

    setError(null);
    setCostResult(result);
  };

  const handleCalculate = () => {
    if (input.quantity <= 0) {
      setError('数量必须大于0');
      return;
    }
    calculateCost();
  };

  if (error && !costResult) {
    return (
      <div className="cost-calculator-error">
        <h3>加载失败</h3>
        <p>{error}</p>
        <button onClick={loadData} className="retry-button">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="cost-calculator">
      <div className="cost-calculator-header">
      </div>

      <div className="cost-calculator-content">
        <div className="input-section">
          <h3 className="section-title">输入参数</h3>

          <div className="input-grid">
            <div className="input-group">
              <label htmlFor="productCode">产品代码</label>
              <input
                id="productCode"
                type="text"
                value={input.productCode}
                onChange={(e) => setInput({ ...input, productCode: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label htmlFor="spec">规格</label>
              <input
                id="spec"
                type="text"
                value={input.spec}
                onChange={(e) => setInput({ ...input, spec: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label htmlFor="quantity">数量 (吨)</label>
              <input
                id="quantity"
                type="number"
                min="0"
                step="0.01"
                value={input.quantity}
                onChange={(e) => setInput({ ...input, quantity: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="input-group">
              <label htmlFor="tradeTerm">贸易条款</label>
              <select
                id="tradeTerm"
                value={input.tradeTerm}
                onChange={(e) => setInput({ ...input, tradeTerm: e.target.value as TradeTerm })}
              >
                <option value="FOB">FOB</option>
                <option value="CFR">CFR</option>
                <option value="CIF">CIF</option>
                <option value="DDP">DDP</option>
              </select>
            </div>

            <div className="input-group">
              <label htmlFor="origin">起运地</label>
              <input
                id="origin"
                type="text"
                value={input.origin}
                onChange={(e) => setInput({ ...input, origin: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label htmlFor="destination">目的地</label>
              <input
                id="destination"
                type="text"
                value={input.destination}
                onChange={(e) => setInput({ ...input, destination: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label htmlFor="fxScenario">汇率情景</label>
              <select
                id="fxScenario"
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
              >
                {fxScenarios
                  .filter(s => s.quote_currency === 'CNY')
                  .map(s => (
                    <option key={s.scenario_id} value={s.scenario_id}>
                      {s.scenario_name} ({s.scenario_rate.toFixed(2)})
                    </option>
                  ))}
              </select>
            </div>

            <div className="input-group calculate-button-group">
              <button
                className="calculate-button"
                onClick={handleCalculate}
                disabled={loading}
              >
                {loading ? '计算中...' : '计算成本'}
              </button>
            </div>
          </div>
        </div>

        {costResult && (
          <>
            <CostBreakdown
              costs={[
                {
                  component: '基础钢价',
                  value: costResult.baseSteel,
                  perTon: costResult.baseSteel / input.quantity,
                  percentage: costResult.total > 0 ? (costResult.baseSteel / costResult.total) * 100 : 0
                },
                {
                  component: '内陆运费',
                  value: costResult.inlandFreight,
                  perTon: costResult.inlandFreight / input.quantity,
                  percentage: costResult.total > 0 ? (costResult.inlandFreight / costResult.total) * 100 : 0
                },
                {
                  component: '海运费',
                  value: costResult.oceanFreight,
                  perTon: costResult.oceanFreight / input.quantity,
                  percentage: costResult.total > 0 ? (costResult.oceanFreight / costResult.total) * 100 : 0
                },
                {
                  component: '保险费',
                  value: costResult.insurance,
                  perTon: costResult.insurance / input.quantity,
                  percentage: costResult.total > 0 ? (costResult.insurance / costResult.total) * 100 : 0
                },
                {
                  component: '关税',
                  value: costResult.tariff,
                  perTon: costResult.tariff / input.quantity,
                  percentage: costResult.total > 0 ? (costResult.tariff / costResult.total) * 100 : 0
                },
                {
                  component: 'CBAM碳成本',
                  value: costResult.cbam,
                  perTon: costResult.cbam / input.quantity,
                  percentage: costResult.total > 0 ? (costResult.cbam / costResult.total) * 100 : 0
                }
              ]}
              totalCost={costResult.total}
              quantity={input.quantity}
            />
            <ScenarioComparison
              baselineCost={costResult.total}
              scenarios={fxScenarios.filter(s => s.quote_currency === 'CNY')}
            />
            <SensitivityChart
              baseCost={costResult.total}
              fxScenarios={fxScenarios.filter(s => s.quote_currency === 'CNY')}
            />
          </>
        )}

      </div>
    </div>
  );
}
