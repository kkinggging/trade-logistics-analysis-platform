interface KPICardsProps {
  kpis: {
    completionRate: string;
    costChange: string;
    activeRisks: number;
    pendingPolicies: number;
  };
  loading: boolean;
}

export function KPICards({ kpis, loading }: KPICardsProps) {
  const cards = [
    {
      title: '本月销量完成率',
      value: `${kpis.completionRate}%`,
      icon: '📈',
      trend: parseFloat(kpis.completionRate) >= 100 ? 'positive' : 'negative',
      subtitle: '目标达成进度'
    },
    {
      title: '平均成本变化',
      value: `${kpis.costChange}%`,
      icon: '💵',
      trend: parseFloat(kpis.costChange) > 0 ? 'negative' : 'positive',
      subtitle: '较上期对比'
    },
    {
      title: '活跃风险信号',
      value: kpis.activeRisks.toString(),
      icon: '⚠️',
      trend: kpis.activeRisks > 5 ? 'negative' : kpis.activeRisks > 2 ? 'neutral' : 'positive',
      subtitle: '严重 + 高度关注'
    },
    {
      title: '待处理政策事件',
      value: kpis.pendingPolicies.toString(),
      icon: '📋',
      trend: kpis.pendingPolicies > 10 ? 'negative' : kpis.pendingPolicies > 5 ? 'neutral' : 'positive',
      subtitle: '需要审核确认'
    }
  ];

  return (
    <div className="kpi-cards">
      {cards.map((card, index) => (
        <div key={index} className={`kpi-card kpi-trend-${card.trend}`}>
          {loading ? (
            <div className="kpi-loading">加载中...</div>
          ) : (
            <>
              <div className="kpi-header">
                <span className="kpi-icon">{card.icon}</span>
                <span className="kpi-title">{card.title}</span>
              </div>
              <div className="kpi-value">{card.value}</div>
              <div className="kpi-subtitle">{card.subtitle}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
