interface CostItem {
  component: string;
  value: number;
  perTon: number;
  percentage: number;
}

interface CostBreakdownProps {
  costs: CostItem[];
  totalCost: number;
  quantity: number;
}

export function CostBreakdown({ costs, totalCost, quantity }: CostBreakdownProps) {
  const formatCurrency = (value: number) => {
    return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="cost-breakdown">
      <h3 className="section-title">成本拆解</h3>

      <div className="breakdown-table">
        <div className="breakdown-header">
          <div className="breakdown-col">成本项目</div>
          <div className="breakdown-col">总额 (USD)</div>
          <div className="breakdown-col">单价 (USD/t)</div>
          <div className="breakdown-col">占比</div>
        </div>

        {costs.map((cost, index) => (
          <div key={index} className="breakdown-row">
            <div className="breakdown-col breakdown-label">{cost.component}</div>
            <div className="breakdown-col breakdown-value">${formatCurrency(cost.value)}</div>
            <div className="breakdown-col breakdown-per-ton">${formatCurrency(cost.perTon)}</div>
            <div className="breakdown-col breakdown-percentage">{cost.percentage.toFixed(1)}%</div>
          </div>
        ))}

        <div className="breakdown-row breakdown-total">
          <div className="breakdown-col breakdown-label">总成本</div>
          <div className="breakdown-col breakdown-value">${formatCurrency(totalCost)}</div>
          <div className="breakdown-col breakdown-per-ton">
            ${formatCurrency(totalCost / quantity)}
          </div>
          <div className="breakdown-col breakdown-percentage">100.0%</div>
        </div>
      </div>

      <div className="breakdown-note">
        <span className="note-icon">⚠️</span>
        <span className="note-text">
          <strong>重要提示：</strong>
          所有成本均为系统估算值，仅供参考。实际成本可能因市场波动、具体合同条款、运输路线等因素而有所不同。
          请务必与相关部门确认后再用于正式报价或决策。
        </span>
      </div>
    </div>
  );
}
