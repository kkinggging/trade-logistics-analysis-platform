import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { RiskSignal } from '@/core/store/types';

interface TrendAnalysisProps {
  signals: RiskSignal[];
  loading: boolean;
}

export function TrendAnalysis({ signals, loading }: TrendAnalysisProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || loading || signals.length === 0) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;

    const signalsByDate = signals.reduce((acc, signal) => {
      const date = signal.as_of;
      if (!acc[date]) {
        acc[date] = { critical: 0, high_attention: 0, attention: 0, normal: 0 };
      }
      acc[date][signal.level]++;
      return acc;
    }, {} as Record<string, Record<string, number>>);

    const dates = Object.keys(signalsByDate).sort();
    const criticalData = dates.map(date => signalsByDate[date].critical || 0);
    const highData = dates.map(date => signalsByDate[date].high_attention || 0);
    const attentionData = dates.map(date => signalsByDate[date].attention || 0);
    const normalData = dates.map(date => signalsByDate[date].normal || 0);

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '15%',
        containLabel: true
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1d202b',
        borderColor: 'rgba(255,255,255,0.14)',
        textStyle: {
          color: '#f4f3f8'
        },
        axisPointer: {
          type: 'cross',
          label: {
          backgroundColor: '#262a38'
          }
        }
      },
      legend: {
        data: ['严重', '高度关注', '关注', '正常'],
        top: '0%',
        textStyle: {
          color: '#c0bfca'
        }
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: {
          lineStyle: {
            color: 'rgba(255,255,255,0.14)'
          }
        },
        axisLabel: {
          color: '#c0bfca',
          fontSize: 11
        }
      },
      yAxis: {
        type: 'value',
        name: '信号数量',
        nameTextStyle: {
          color: 'var(--text-secondary)',
          fontSize: 12
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(255,255,255,0.14)'
          }
        },
        axisLabel: {
          color: '#c0bfca',
          fontSize: 11
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
          name: '严重',
          type: 'line',
          stack: 'total',
          data: criticalData,
          smooth: true,
          lineStyle: {
            color: '#fb7185',
            width: 2
          },
          itemStyle: {
            color: '#fb7185'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(248, 113, 113, 0.4)' },
                { offset: 1, color: 'rgba(248, 113, 113, 0.1)' }
              ]
            }
          }
        },
        {
          name: '高度关注',
          type: 'line',
          stack: 'total',
          data: highData,
          smooth: true,
          lineStyle: {
            color: '#f6c76b',
            width: 2
          },
          itemStyle: {
            color: '#f6c76b'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(251, 191, 36, 0.4)' },
                { offset: 1, color: 'rgba(251, 191, 36, 0.1)' }
              ]
            }
          }
        },
        {
          name: '关注',
          type: 'line',
          stack: 'total',
          data: attentionData,
          smooth: true,
          lineStyle: {
            color: '#a78bfa',
            width: 2
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
                { offset: 0, color: 'rgba(56, 189, 248, 0.4)' },
                { offset: 1, color: 'rgba(56, 189, 248, 0.1)' }
              ]
            }
          }
        },
        {
          name: '正常',
          type: 'line',
          stack: 'total',
          data: normalData,
          smooth: true,
          lineStyle: {
            color: '#5eead4',
            width: 2
          },
          itemStyle: {
            color: '#5eead4'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(110, 231, 183, 0.4)' },
                { offset: 1, color: 'rgba(110, 231, 183, 0.1)' }
              ]
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
  }, [signals, loading]);

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
      <div className="trend-analysis">
        <h3 className="section-title">趋势分析</h3>
        <div className="trend-loading">加载中...</div>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="trend-analysis">
        <h3 className="section-title">趋势分析</h3>
        <div className="trend-empty">暂无数据</div>
      </div>
    );
  }

  return (
    <div className="trend-analysis">
      <h3 className="section-title">风险信号趋势</h3>
      <div className="chart-container" ref={chartRef} style={{ width: '100%', height: '350px' }} />
    </div>
  );
}
