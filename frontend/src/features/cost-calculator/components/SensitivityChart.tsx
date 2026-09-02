import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { FxScenario } from '@/core/store/types';

interface SensitivityChartProps {
  baseCost: number;
  fxScenarios: FxScenario[];
}

export function SensitivityChart({ baseCost, fxScenarios }: SensitivityChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;

    const sortedScenarios = [...fxScenarios].sort((a, b) => a.scenario_pct - b.scenario_pct);

    const xData = sortedScenarios.map(s => `${s.scenario_pct > 0 ? '+' : ''}${s.scenario_pct}%`);
    const yData = sortedScenarios.map(s => {
      const fxImpact = (s.scenario_rate - s.base_rate) / s.base_rate;
      const adjustedCost = baseCost * (1 + fxImpact * 0.3);
      return adjustedCost.toFixed(2);
    });

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '10%',
        containLabel: true
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1d202b',
        borderColor: 'rgba(255,255,255,0.14)',
        textStyle: {
          color: '#f4f3f8'
        },
        formatter: (params: any) => {
          const param = params[0];
          const scenario = sortedScenarios[param.dataIndex];
          return `
            <div style="padding: 4px;">
              <div style="font-weight: 600; margin-bottom: 8px;">
                ${scenario.scenario_name}
              </div>
              <div style="color: #c0bfca;">
                汇率变化: ${scenario.scenario_pct > 0 ? '+' : ''}${scenario.scenario_pct}%
              </div>
              <div style="color: #c0bfca;">
                汇率: ${scenario.scenario_rate.toFixed(4)}
              </div>
              <div style="color: #a78bfa; font-weight: 600; margin-top: 4px;">
                总成本: $${parseFloat(param.value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          `;
        }
      },
      xAxis: {
        type: 'category',
        data: xData,
        axisLine: {
          lineStyle: {
            color: 'rgba(255,255,255,0.14)'
          }
        },
        axisLabel: {
          color: '#c0bfca',
          fontSize: 12
        }
      },
      yAxis: {
        type: 'value',
        name: '总成本 (USD)',
        nameTextStyle: {
          color: '#c0bfca',
          fontSize: 12
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(255,255,255,0.14)'
          }
        },
        axisLabel: {
            color: '#c0bfca',
          fontSize: 12,
          formatter: (value: number) => {
            return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
          }
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(255,255,255,0.08)',
            type: 'dashed'
          }
        }
      },
      series: [
        {
          name: '总成本',
          type: 'line',
          data: yData,
          smooth: true,
          lineStyle: {
            color: '#a78bfa',
            width: 3
          },
          itemStyle: {
            color: '#a78bfa'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(56, 189, 248, 0.3)' },
                { offset: 1, color: 'rgba(56, 189, 248, 0.05)' }
              ]
            }
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              color: '#a78bfa',
              borderColor: '#f4f3f8',
              borderWidth: 2
            }
          }
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
  }, [baseCost, fxScenarios]);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="sensitivity-chart">
      <h3 className="section-title">敏感性分析</h3>
      <div className="chart-container" ref={chartRef} style={{ width: '100%', height: '400px' }} />
      <div className="chart-note">
        <span className="note-icon">ℹ️</span>
        <span className="note-text">
          敏感性分析展示汇率变化对总成本的影响。曲线越陡峭，说明成本对汇率变化越敏感。
        </span>
      </div>
    </div>
  );
}
