import { useEffect, useState } from 'react';
import { getTraditionalCalendarText } from '@/shared/utils/traditionalCalendar';
import { readCachedBeijingWeather, requestBeijingWeather } from '@/shared/utils/weather';
import type { BeijingWeather } from '@/shared/utils/weather';
import './Header.css';

type WeatherStatus = 'loading' | 'ready' | 'unavailable';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function formatWeather(code: number) {
  if (code === 0) return '晴';
  if ([1, 2].includes(code)) return '少云';
  if (code === 3) return '阴';
  if ([45, 48].includes(code)) return '雾';
  if ([51, 53, 55, 56, 57].includes(code)) return '毛毛雨';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '降雨';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '降雪';
  if ([95, 96, 99].includes(code)) return '雷雨';
  return '天气';
}

export function Header() {
  const [currentDateKey, setCurrentDateKey] = useState(today);
  const [weather, setWeather] = useState<BeijingWeather | null>(() => readCachedBeijingWeather());
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>(() => readCachedBeijingWeather() ? 'ready' : 'loading');
  useEffect(() => {
    // 平台统一使用明色钢蓝；3D 地球组件内部保留独立深色舞台。
    document.documentElement.dataset.theme = 'steel-blue';
    window.localStorage.setItem('trade-platform-theme', 'steel-blue');
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDateKey(today()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const refreshWeather = () => requestBeijingWeather()
      .then((nextWeather) => { if (active) { setWeather(nextWeather); setWeatherStatus('ready'); } })
      .catch(() => { if (active) setWeatherStatus((current) => current === 'ready' ? 'ready' : 'unavailable'); });
    refreshWeather();
    const timer = window.setInterval(refreshWeather, 30 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const currentDate = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(`${currentDateKey}T12:00:00+08:00`));
  const traditional = getTraditionalCalendarText(currentDateKey);

  return (
    <header className="header">
      <div className="header-left">
        <span className="header-date">{currentDate}</span>
        <div className="header-traditional" aria-label="今日节气">
          <strong>{traditional.term}</strong>
          <span>{traditional.isTermDay ? '今日交节' : traditional.hou}</span>
        </div>
        <div className={`header-weather header-weather-${weatherStatus}`} title={weather?.updatedAt ? `天气更新于 ${weather.updatedAt.replace('T', ' ').slice(0, 16)}` : '天气数据暂不可用'}>
          <span className="header-weather-glyph" aria-hidden="true">{weatherStatus === 'ready' && weather ? (weather.weatherCode === 0 ? '☀' : '◒') : '气'}</span>
          <div><strong>{weatherStatus === 'ready' && weather ? `${weather.location} ${Math.round(weather.temperature)}°` : '北京天气'}</strong><span>{weatherStatus === 'ready' && weather ? `${formatWeather(weather.weatherCode)} · ${Math.round(weather.low)}°—${Math.round(weather.high)}°` : weatherStatus === 'loading' ? '正在更新' : '暂不可用 · 不影响其他数据'}</span></div>
        </div>
      </div>
    </header>
  );
}
