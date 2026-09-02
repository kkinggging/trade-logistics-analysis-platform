import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { ProductCost } from '@/core/store/types';

interface CostStructurePieProps {
  productCosts: ProductCost[];
  loading: boolean;
}

export function CostStructurePie({ productCosts, loading }: CostStructurePieProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || loading || productCosts.length === 0) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;

    const costByComponent = productCosts.reduce((acc, cost) => {
      if (!acc[cost.component_name]) {
        acc[cost.component_name] = 0;
      }
      acc[cost.component_name] += cost.value_per_ton;
      return acc;
    }, {} as Record<string, number>);

    const data = Object.entries(costByComponent).map(([name, value]) => ({
      name,
      value: parseFloat(value.toFixed(2))
    }));

    const total = data.reduce((sum, item) => sum + item.value, 0);

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1d202b',
        borderColor: 'rgba(255,255,255,0.14)',
        textStyle: {
          color: '#f4f3f8'
        },
        formatter: (params: any) => {
          const percent = ((params.value / total) * 100).toFixed(1);
          return `
            <div style="padding: 4px;">
              <div style="font-weight: 600; margin-bottom: 4px;">
                ${params.name}
              </div>
              <div style="color: #a78bfa; font-weight: 600;">
                $${params.value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/t
              </div>
              <div style="color: #c0bfca; font-size: 13px; margin-top: 2px;">
                占比: ${percent}%
              </div>
            </div>
          `;
        }
      },
      legend: {
        orient: 'vertical',
        right: '5%',
        top: 'center',
        textStyle: {
          color: '#c0bfca',
          fontSize: 14
        },
        formatter: (name: string) => {
          const item = data.find(d => d.name === name);
          const percent = item ? ((item.value / total) * 100).toFixed(0) : '0';
          return `${name} (${percent}%)`;
        }
      },
      series: [
        {
          name: '成本结构',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: '#171922',
            borderWidth: 3
          },
          label: {
            show: false
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold',
              color: '#f4f3f8',
              formatter: (params: any) => {
                const percent = ((params.value / total) * 100).toFixed(1);
                return `${params.name}\n${percent}%`;
              }
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          data: data,
          color: [
            '#a78bfa',
            '#5eead4',
            '#f6c76b',
            '#A78BFA',
            '#FB923C',
            '#EC4899'
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
  }, [productCosts, loading]);

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
      <div className="cost-structure-pie">
        <h3 className="section-title">成本结构</h3>
        <div className="chart-loading">加载中...</div>
      </div>
    );
  }

  if (productCosts.length === 0) {
    return (
      <div className="cost-structure-pie">
        <h3 className="section-title">成本结构</h3>
        <div className="chart-empty">暂无数据</div>
      </div>
    );
  }

  return (
    <div className="cost-structure-pie">
      <h3 className="section-title">成本结构</h3>
      <div className="chart-container" ref={chartRef} style={{ width: '100%', height: '350px' }} />
      <div className="chart-note">
        <span className="note-icon">ℹ️</span>
        <span className="note-text">
          成本占比基于所有产品的平均单位成本计算，实际占比因产品和路线而异。
        </span>
      </div>
    </div>
  );
}
