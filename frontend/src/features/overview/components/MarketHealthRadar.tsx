import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { RiskSignal, ProductCost } from '@/core/store/types';

interface MarketHealthRadarProps {
  riskSignals: RiskSignal[];
  productCosts: ProductCost[];
  loading: boolean;
}

export function MarketHealthRadar({ riskSignals, productCosts, loading }: MarketHealthRadarProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || loading || riskSignals.length === 0) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;

    const priceVolatility = riskSignals.find(s => s.factor === 'price_volatility');
    const freightCost = riskSignals.find(s => s.factor === 'freight_cost');
    const policyRisk = riskSignals.find(s => s.factor === 'policy_risk');
    const carbonCost = riskSignals.find(s => s.factor === 'carbon_cost');
    const fxRisk = riskSignals.find(s => s.factor === 'fx_risk');

    const normalizeScore = (signal: RiskSignal | undefined): number => {
      if (!signal) return 80;
      return Math.max(0, 100 - signal.score);
    };

    const data = [
      normalizeScore(priceVolatility),
      normalizeScore(freightCost),
      normalizeScore(policyRisk),
      normalizeScore(carbonCost),
      normalizeScore(fxRisk)
    ];

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      radar: {
        indicator: [
          { name: '价格稳定性', max: 100 },
          { name: '运费水平', max: 100 },
          { name: '政策环境', max: 100 },
          { name: '碳成本', max: 100 },
          { name: '汇率稳定性', max: 100 }
        ],
        shape: 'polygon',
        splitNumber: 4,
        axisName: {
          color: '#c0bfca',
          fontSize: 13
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(255,255,255,0.08)'
          }
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: [
              'rgba(56, 189, 248, 0.05)',
              'rgba(56, 189, 248, 0.1)',
              'rgba(56, 189, 248, 0.08)',
              'rgba(56, 189, 248, 0.03)'
            ]
          }
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(255,255,255,0.14)'
          }
        }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1d202b',
        borderColor: 'rgba(255,255,255,0.14)',
        textStyle: {
          color: '#f4f3f8'
        }
      },
      series: [
        {
          name: '市场健康度',
          type: 'radar',
          data: [
            {
              value: data,
              name: '当前状态',
              lineStyle: {
                color: '#a78bfa',
                width: 3
              },
              areaStyle: {
                color: {
                  type: 'radial',
                  x: 0.5,
                  y: 0.5,
                  r: 0.5,
                  colorStops: [
                    { offset: 0, color: 'rgba(167, 139, 250, 0.34)' },
                    { offset: 1, color: 'rgba(167, 139, 250, 0.08)' }
                  ]
                }
              },
              itemStyle: {
                color: '#a78bfa',
                borderColor: '#f4f3f8',
                borderWidth: 2
              }
            }
          ]
        }
      ]
    };

    chart.setOption(option);

    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [riskSignals, productCosts, loading]);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="market-health-radar">
        <h3 className="section-title">市场健康度</h3>
        <div className="chart-loading">加载中...</div>
      </div>
    );
  }

  if (riskSignals.length === 0) {
    return (
      <div className="market-health-radar">
        <h3 className="section-title">市场健康度</h3>
        <div className="chart-empty">暂无数据</div>
      </div>
    );
  }

  return (
    <div className="market-health-radar">
      <h3 className="section-title">市场健康度</h3>
      <div className="chart-container" ref={chartRef} style={{ width: '100%', height: '350px' }} />
      <div className="chart-note">
        <span className="note-icon">ℹ️</span>
        <span className="note-text">
          健康度评分基于风险信号反向计算，分值越高表示该维度风险越低。
        </span>
      </div>
    </div>
  );
}
