import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { RiskSignal } from '@/core/store/types';

interface RiskMatrixProps {
  riskSignals: RiskSignal[];
  loading: boolean;
}

export function RiskMatrix({ riskSignals, loading }: RiskMatrixProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const hasDimensions = riskSignals.some(signal => {
    const scoped = signal as RiskSignal & { product_line?: string; region?: string };
    return Boolean(scoped.product_line && scoped.region);
  });

  useEffect(() => {
    if (!chartRef.current || loading || riskSignals.length === 0 || !hasDimensions) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;

    const productLines = ['hot-rolled', 'cold-rolled', 'silicon-steel'];
    const regions = ['europe', 'asia', 'americas'];

    const matrix: number[][] = [];
    productLines.forEach(productLine => {
      const row: number[] = [];
      regions.forEach(region => {
        const scopedSignals = riskSignals.filter(s => (s.level === 'critical' || s.level === 'high_attention'));
        const riskCount = scopedSignals.length === 0 ? 0 : scopedSignals.filter(
          s => {
            const scoped = s as RiskSignal & { product_line?: string; region?: string };
            return (!scoped.product_line || scoped.product_line === productLine) && (!scoped.region || scoped.region === region);
          }
        ).length;
        row.push(riskCount);
      });
      matrix.push(row);
    });

    const data: Array<[number, number, number]> = [];
    matrix.forEach((row, i) => {
      row.forEach((value, j) => {
        data.push([j, i, value]);
      });
    });

    const maxValue = Math.max(1, ...data.map(d => d[2]));

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top',
        backgroundColor: '#1d202b',
        borderColor: 'rgba(255,255,255,0.14)',
        textStyle: {
          color: '#f4f3f8'
        },
        formatter: (params: any) => {
          return `
            <div style="padding: 4px;">
              <div style="font-weight: 600; margin-bottom: 4px;">
                ${productLines[params.data[1]]} - ${regions[params.data[0]]}
              </div>
              <div style="color: var(--accent-danger); font-weight: 600;">
                风险数: ${params.data[2]}
              </div>
            </div>
          `;
        }
      },
      grid: {
        top: '10%',
        left: '15%',
        right: '10%',
        bottom: '15%'
      },
      xAxis: {
        type: 'category',
        data: regions,
        splitArea: {
          show: true,
          areaStyle: {
            color: ['#111319', '#171922']
          }
        },
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
        type: 'category',
        data: productLines,
        splitArea: {
          show: true,
          areaStyle: {
            color: ['#111319', '#171922']
          }
        },
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
      visualMap: {
        min: 0,
        max: maxValue,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        textStyle: {
          color: '#c0bfca'
        },
        inRange: {
          color: [
            'rgba(110, 231, 183, 0.3)',
            'rgba(56, 189, 248, 0.5)',
            'rgba(251, 191, 36, 0.7)',
            'rgba(248, 113, 113, 0.9)'
          ]
        }
      },
      series: [
        {
          name: '风险分布',
          type: 'heatmap',
          data: data,
          label: {
            show: true,
            color: '#f4f3f8',
            fontSize: 14,
            fontWeight: 'bold'
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
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
  }, [riskSignals, loading, hasDimensions]);

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
      <div className="risk-matrix">
        <h3 className="section-title">风险分布矩阵</h3>
        <div className="chart-loading">加载中...</div>
      </div>
    );
  }

  if (riskSignals.length === 0 || !hasDimensions) {
    return (
      <div className="risk-matrix">
        <h3 className="section-title">风险分布矩阵</h3>
        <div className="chart-empty">暂无产品线/区域维度数据，当前仅有总体风险信号</div>
      </div>
    );
  }

  return (
    <div className="risk-matrix">
      <h3 className="section-title">风险分布矩阵</h3>
      <div className="chart-container" ref={chartRef} style={{ width: '100%', height: '400px' }} />
      <div className="chart-note">
        <span className="note-icon">ℹ️</span>
        <span className="note-text">
          热力图展示各产品线和区域的高风险信号数量分布。颜色越深表示风险信号越多。
        </span>
      </div>
    </div>
  );
}
