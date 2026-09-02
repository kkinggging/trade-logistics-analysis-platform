import { useEffect, useState } from 'react';
import { useAppContext } from '@/core/store/context';
import { ProductLine, Region } from '@/core/store/types';
import './Header.css';

const productLineOptions = [
  { value: 'hot-rolled', label: '热轧卷板' },
  { value: 'cold-rolled', label: '冷轧卷板' },
];

const regionOptions = [
  { value: 'global', label: '全球' },
  { value: 'asia', label: '亚洲' },
  { value: 'europe', label: '欧洲' },
  { value: 'americas', label: '美洲' },
  { value: 'africa', label: '非洲' },
];

export function Header() {
  const { state, dispatch } = useAppContext();
  const [theme, setTheme] = useState<'dark' | 'steel-blue'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem('trade-platform-theme') === 'steel-blue' ? 'steel-blue' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('trade-platform-theme', theme);
  }, [theme]);

  const handleProductLineChange = (e: { target: { value: string } }) => {
    dispatch({ type: 'SET_PRODUCT_LINE', payload: e.target.value as ProductLine });
  };

  const handleRegionChange = (e: { target: { value: string } }) => {
    dispatch({ type: 'SET_REGION', payload: e.target.value as Region });
  };

  const currentDate = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <header className="header">
      <div className="header-left">
            <span className="header-date">{currentDate}</span>
      </div>
      <div className="header-right">
        <div className="header-control">
          <label htmlFor="product-line">产品线</label>
          <select
            id="product-line"
            value={state.productLine}
            onChange={handleProductLineChange}
            className="header-select"
          >
            {productLineOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="header-control">
          <label htmlFor="region">区域</label>
          <select
            id="region"
            value={state.region}
            onChange={handleRegionChange}
            className="header-select"
          >
            {regionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="theme-switcher" role="group" aria-label="切换平台色调">
          <span className="theme-switcher-label">色调</span>
          <button
            type="button"
            className={`theme-button ${theme === 'dark' ? 'is-active' : ''}`}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
          >
            暗色
          </button>
          <button
            type="button"
            className={`theme-button ${theme === 'steel-blue' ? 'is-active' : ''}`}
            aria-pressed={theme === 'steel-blue'}
            onClick={() => setTheme('steel-blue')}
          >
            明色钢蓝
          </button>
        </div>
      </div>
    </header>
  );
}
