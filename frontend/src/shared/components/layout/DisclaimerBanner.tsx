import './DisclaimerBanner.css';

export function DisclaimerBanner() {
  return (
    <div className="disclaimer-banner">
      <div className="disclaimer-content">
        <span className="disclaimer-icon">⚠️</span>
        <span className="disclaimer-text">
          本系统所有输出仅供辅助决策参考，不构成自动决策依据。所有业务决策需人工审核确认。
        </span>
      </div>
    </div>
  );
}
