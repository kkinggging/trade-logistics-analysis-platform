import { NavLink, useLocation } from 'react-router-dom';
import './Sidebar.css';

interface NavItem {
  path: string;
  label: string;
}

const navItems: NavItem[] = [
  { path: '/', label: '晨报' },
  { path: '/analysis', label: '综合分析' },
  { path: '/cost-calculator', label: '成本计算器' },
  { path: '/shipping', label: '运输方案' },
  { path: '/strategy', label: '销售方案' },
];

export function Sidebar() {
  const location = useLocation();
  const unifiedAnalysisActive = ['/analysis', '/dashboard', '/overview', '/risk-center'].includes(location.pathname);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img className="sidebar-brand-mark sidebar-brand-logo" src={`${import.meta.env.BASE_URL}assets/logo.jpg`} alt="首钢国际" />
        <div className="sidebar-brand-copy">
          <h1 className="sidebar-title">首钢国际贸易物流一体化分析辅助平台</h1>
          <span className="sidebar-brand-caption">TRADE & LOGISTICS INTELLIGENCE</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `nav-item ${isActive || (item.path === '/analysis' && unifiedAnalysisActive) ? 'nav-item-active' : ''}`
            }
          >
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-status" aria-label="系统状态">
        <span className="sidebar-status-dot" aria-hidden="true" />
        <span>工作台运行中</span>
      </div>
    </aside>
  );
}
