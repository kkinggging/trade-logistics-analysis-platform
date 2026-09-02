import { useEffect, useMemo, useState } from 'react';
import { loadStrategyData, StrategyDataBundle } from '@/core/strategy/data';
import { buildDataDrivenAdvice, buildDataDrivenSalesPlan, DataDrivenAdvice, DataDrivenSalesPlan } from '@/core/strategy/engine';
import { FastNewsItem, MarketQuote, PolicyEvent, RiskSignal } from '@/core/store/types';
import { SourceEvidence } from '@/shared/components/data/DataStatus';
import { getTraditionalCalendarText } from '@/shared/utils/traditionalCalendar';
import './MorningBrief.css';

interface BriefData {
  date: string;
  marketOverview: { steelPrice?: MarketQuote; freight?: MarketQuote; carbonPrice?: MarketQuote };
  riskAlerts: RiskSignal[];
  policyUpdates: PolicyEvent[];
  salesCompletion: number | null;
  advice: DataDrivenAdvice[];
  salesPlan: DataDrivenSalesPlan;
  syncStatus: StrategyDataBundle['syncStatus'];
  exportTop?: string;
  quotaText?: string;
  fastNews: FastNewsItem[];
  fastNewsSource: StrategyDataBundle['fastNews'];
}

interface BriefArchiveEntry { date: string; generated_at: string; data_state?: string; summary: string; actions: string[]; evidence: string[]; }
const factorLabel: Record<string, string> = { price_volatility: '价格波动', freight_cost: '运费成本', carbon_cost: '碳成本', policy_risk: '政策风险', demand_weakness: '需求走弱', fx_volatility: '汇率波动' };
const riskLabel: Record<RiskSignal['level'], string> = { critical: '严重', high_attention: '高度关注', attention: '关注', normal: '正常' };
interface WeatherState { location: string; temperature: number; high: number; low: number; weatherCode: number; windSpeed: number; updatedAt: string; }
const weatherLocation = { name: '北京', latitude: 39.9042, longitude: 116.4074 };
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()); }
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
function formatWeatherTime(value: string) { return value ? value.replace('T', ' ').slice(0, 16) : '—'; }
function formatBriefDate(value: string) { const date = new Date(`${value}T12:00:00+08:00`); return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Shanghai' }).format(date); }
function briefSyncText(status: StrategyDataBundle['syncStatus']) { const states = Object.values(status?.sources || {}).map((source) => source.state); if (states.includes('fallback')) return '部分内容沿用最近可用数据'; if (states.includes('unavailable')) return '部分数据待更新'; if (states.length && states.every((state) => state === 'fresh')) return '数据已更新'; return '数据状态待确认'; }
function currentQuote(quotes: MarketQuote[], matcher: (quote: MarketQuote) => boolean) { return [...quotes].filter(matcher).sort((a, b) => `${a.date}${a.publish_time}`.localeCompare(`${b.date}${b.publish_time}`)).pop(); }

function buildBrief(data: StrategyDataBundle, date = today()): BriefData {
  const advice = buildDataDrivenAdvice(data); const salesPlan = buildDataDrivenSalesPlan(data);
  const total = data.aggregates.reduce((sum, row) => sum + row.volume_t, 0); const target = data.aggregates.reduce((sum, row) => sum + (row.target_volume_t || 0), 0);
  const eu = data.taricQuota?.eu || (data.taricQuota ? { ...data.taricQuota.latest, history: data.taricQuota.history } : null); const top = data.steelExport?.default_view.partner[0];
  return { date, marketOverview: { steelPrice: currentQuote(data.quotes, (quote) => quote.indicator_code.startsWith('STEEL_')), freight: currentQuote(data.quotes, (quote) => quote.indicator_code.includes('FREIGHT')), carbonPrice: currentQuote(data.quotes, (quote) => quote.indicator_code.includes('CARBON')) }, riskAlerts: data.risks.filter((risk) => risk.review_status !== 'dismissed' && risk.level !== 'normal').sort((a, b) => b.score - a.score).slice(0, 4), policyUpdates: [...data.policies].sort((a, b) => b.publish_date.localeCompare(a.publish_date)).slice(0, 3), salesCompletion: target ? total / target * 100 : null, advice, salesPlan, syncStatus: data.syncStatus, exportTop: top ? `${top.name || top.label} · ${top.qty_t.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 吨` : undefined, quotaText: eu ? `EU 余额 ${eu.summary.balance_t.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 吨 · 剩余 ${eu.summary.remaining_pct?.toFixed(1) ?? '—'}%` : undefined, fastNews: data.fastNews?.items || [], fastNewsSource: data.fastNews };
}

function sourceLabel(item: FastNewsItem) { return item.products.map((product) => product.name).join('、') || item.category.name || '行业快讯'; }
function formatNewsTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(5, 16);
  const parts = new Intl.DateTimeFormat('en-GB', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function MorningBrief() {
  const [briefData, setBriefData] = useState<BriefData | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [history, setHistory] = useState<BriefArchiveEntry[]>([]); const [showHistory, setShowHistory] = useState(false); const [selectedDate, setSelectedDate] = useState(today()); const [calendarDate, setCalendarDate] = useState(today());
  const [currentDate, setCurrentDate] = useState(today()); const [weather, setWeather] = useState<WeatherState | null>(null);
  useEffect(() => { let active = true; Promise.all([loadStrategyData(), fetch(`${import.meta.env.BASE_URL}data/brief_history.json`).then((response) => response.ok ? response.json() : []).catch(() => [])]).then(([data, archives]) => { if (!active) return; setBriefData(buildBrief(data)); setHistory(Array.isArray(archives) ? archives : []); }).catch((err) => active && setError(err instanceof Error ? err.message : '加载晨报失败')).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);
  useEffect(() => { const timer = window.setInterval(() => setCurrentDate(today()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ latitude: String(weatherLocation.latitude), longitude: String(weatherLocation.longitude), current: 'temperature_2m,weather_code,wind_speed_10m', daily: 'temperature_2m_max,temperature_2m_min', forecast_days: '1', timezone: 'Asia/Shanghai' });
    fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error('weather-unavailable'))).then((payload: { current?: { time?: string; temperature_2m?: number; weather_code?: number; wind_speed_10m?: number }; daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] } }) => {
      if (!active || !payload.current || payload.current.temperature_2m == null || payload.current.weather_code == null) return;
      setWeather({ location: weatherLocation.name, temperature: payload.current.temperature_2m, high: payload.daily?.temperature_2m_max?.[0] ?? payload.current.temperature_2m, low: payload.daily?.temperature_2m_min?.[0] ?? payload.current.temperature_2m, weatherCode: payload.current.weather_code, windSpeed: payload.current.wind_speed_10m ?? 0, updatedAt: payload.current.time || '' });
    }).catch(() => { /* 天气为可选增强信息，失败时保持稳定空态，不伪造数据。 */ });
    return () => { active = false; controller.abort(); };
  }, [currentDate]);
  const latestNews = useMemo(() => briefData?.fastNews.slice().sort((a, b) => b.published_at_ms - a.published_at_ms).slice(0, 6) || [], [briefData]);
  const traditional = useMemo(() => getTraditionalCalendarText(calendarDate), [calendarDate]); const showWeather = selectedDate === currentDate;
  function viewArchive(entry: BriefArchiveEntry) { setSelectedDate(entry.date); setCalendarDate(entry.date); setShowHistory(false); setBriefData((current) => current ? { ...current, date: entry.date, salesPlan: { ...current.salesPlan, summary: entry.summary, actions: entry.actions, evidence: entry.evidence, generatedAt: entry.generated_at, dataState: entry.data_state === 'partial' ? 'partial' : current.salesPlan.dataState }, advice: [] } : current); }
  if (loading && !briefData) return <div className="morning-brief"><div className="brief-loading">正在整理当期晨报…</div></div>;
  return <div className="morning-brief">
    {error && <div className="error-banner"><span>⚠️</span><p>{error}</p></div>}
    {briefData && <div className="brief-paper">
      <section className="brief-cover" style={{ backgroundImage: `linear-gradient(110deg, rgba(11, 31, 50, .96) 0%, rgba(17, 51, 78, .82) 46%, rgba(19, 48, 72, .34) 100%), url('${import.meta.env.BASE_URL}assets/cover-building.jpg')` }}>
        <div className="cover-top"><div className="cover-brand"><img src={`${import.meta.env.BASE_URL}assets/logo.jpg`} alt="首钢国际" /><span>首钢国际</span></div><div className="cover-tools">{showWeather && weather && <div className="weather-chip" title={`天气更新于 ${formatWeatherTime(weather.updatedAt)}`}><span className="weather-glyph" aria-hidden="true">{weather.weatherCode === 0 ? '☀' : '◒'}</span><div><strong>{weather.location} {Math.round(weather.temperature)}°</strong><small>{formatWeather(weather.weatherCode)} · {Math.round(weather.low)}°—{Math.round(weather.high)}°</small></div></div>}<span className="cover-index">{formatBriefDate(selectedDate)} · DAILY INTELLIGENCE</span></div></div>
        <div className="cover-copy"><span className="cover-kicker">TRADE & LOGISTICS · MORNING BRIEF</span><h1>贸易物流一体化<br />行业晨报</h1><p>首钢国际贸易物流一体化分析辅助平台</p></div>
        <div className="cover-bottom"><div className="cover-traditional"><span>节气时序</span><strong>{traditional.term}</strong><small>{traditional.isTermDay ? '今日交节' : traditional.hou} · {traditional.dateLabel}</small></div><label className="calendar-input"><span>公历日期</span><input type="date" value={calendarDate} max={currentDate} onChange={(event) => setCalendarDate(event.currentTarget.value)} onInput={(event) => setCalendarDate(event.currentTarget.value)} aria-label="选择公历日期" /></label><div className="brief-sync-status" title={briefData.syncStatus?.generated_at ? `状态更新于 ${formatWeatherTime(briefData.syncStatus.generated_at)}` : undefined}><span aria-hidden="true" />{briefSyncText(briefData.syncStatus)}</div></div>
      </section>

      <section className="brief-section brief-lead-section"><div className="brief-section-heading"><div><span className="brief-section-kicker">01 · EXECUTIVE TAKEAWAY</span><h2>今日先看结论</h2></div><button onClick={() => setShowHistory((value) => !value)} className="btn-secondary">{showHistory ? '收起往期晨报' : '查看往期晨报'}</button></div><p className="brief-lead">{briefData.salesPlan.summary}</p><div className="brief-fact-row">{briefData.exportTop && <span>出口伙伴 Top1：<strong>{briefData.exportTop}</strong></span>}{briefData.quotaText && <span>{briefData.quotaText}</span>}{briefData.salesCompletion != null && <span>经营目标完成率：<strong>{briefData.salesCompletion.toFixed(1)}%</strong></span>}</div></section>

      <section className="brief-section"><div className="brief-section-heading"><div><span className="brief-section-kicker">02 · MARKET PULSE</span><h2>关键数据</h2></div><span className="section-note">只保留影响今日判断的指标</span></div><div className="market-pulse-layout"><div className="metrics-row">{([['钢材价格', briefData.marketOverview.steelPrice], ['运费指数', briefData.marketOverview.freight], ['碳价', briefData.marketOverview.carbonPrice]] as const).map(([label, quote]) => quote && <div className="metric-item" key={label}><div className="metric-label">{label}</div><div className="metric-value-large">{quote.value.toFixed(2)}<span className="metric-unit">{quote.unit}</span></div><small>{quote.indicator_name} · {quote.date}</small></div>)}</div><div className="brief-visual-card"><img src={`${import.meta.env.BASE_URL}assets/product-coil.png`} alt="钢材产品" /><div><span>钢材观察</span><strong>行情、运费与成本联动</strong><small>用于今日销售判断的核心背景</small></div></div></div></section>

      <section className="brief-section brief-news-section"><div className="brief-section-heading"><div><span className="brief-section-kicker">03 · MYSTEEL FAST COMMENT</span><h2>我的钢铁 · 行业快讯</h2></div><span className="section-note">行业动态 · 时间倒序 · 产品归类</span></div>{briefData.fastNewsSource ? <><div className="news-source-line"><img src={`${import.meta.env.BASE_URL}assets/cover-vessel.jpg`} alt="" /><div><strong>我的钢铁网 · 今日快讯</strong><span>覆盖至 {briefData.fastNewsSource.source.coverage_end} · 精选 {latestNews.length} 条</span></div></div><div className="news-list">{latestNews.map((news) => <article className="news-item" key={news.news_id}><time>{formatNewsTime(news.published_at)}</time><div className="news-body"><div className="news-tags"><span>{sourceLabel(news)}</span>{news.section.name && <span>{news.section.name}</span>}</div><p>{news.content_text}</p>{news.source_url && <div className="news-meta"><a href={news.source_url} target="_blank" rel="noreferrer">查看原文 ↗</a></div>}</div></article>)}</div></> : <div className="empty-state">暂无今日行业快讯</div>}</section>

      <section className="brief-section brief-actions-section"><div className="brief-section-heading"><div><span className="brief-section-kicker">04 · SALES PLAYBOOK</span><h2>今日销售动作</h2></div><span className="section-note">建议均来自已接入数据</span></div><div className="brief-action-list">{briefData.salesPlan.actions.length ? briefData.salesPlan.actions.slice(0, 4).map((action, index) => <div className="brief-action-item" key={`${action}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{action}</p></div>) : <div className="empty-state">当前没有足够数据依据生成销售动作。</div>}</div><div className="brief-evidence-block"><strong>关键依据</strong>{briefData.advice.slice(0, 3).map((advice) => <div key={advice.id}><span>{advice.title}</span><small>{advice.evidence.slice(0, 1).join('；')}</small>{advice.evidenceMeta.slice(0, 1).map((meta) => <SourceEvidence key={meta.source} {...meta} />)}</div>)}</div></section>

      <section className="brief-section brief-columns"><div><div className="brief-section-heading"><div><span className="brief-section-kicker">05 · RISK GATE</span><h2>风险闸门</h2></div></div>{briefData.riskAlerts.length ? <div className="risk-list-brief">{briefData.riskAlerts.map((risk) => <div className="risk-item-brief" key={risk.signal_id}><span className={`risk-badge risk-badge-${risk.level}`}>{riskLabel[risk.level]}</span><strong>{factorLabel[risk.factor] || risk.factor}</strong><small>{risk.metric} · {risk.as_of.slice(0, 10)}</small></div>)}</div> : <div className="empty-state">暂无未处理风险信号</div>}</div><div className="policy-column"><div className="brief-section-heading"><div><span className="brief-section-kicker">POLICY WATCH</span><h2>政策动态</h2></div></div>{briefData.policyUpdates.length ? <div className="policy-list-brief">{briefData.policyUpdates.map((policy) => <div className="policy-item-brief" key={policy.event_id}><strong>{policy.title}</strong><small>{policy.country_region} · {policy.publish_date}</small></div>)}</div> : <div className="empty-state">暂无政策记录</div>}<img className="policy-visual" src={`${import.meta.env.BASE_URL}assets/cover-port.jpg`} alt="港口夜景" /></div></section>
    </div>}
    {showHistory && <section className="history-section"><div className="history-heading"><div><div className="brief-eyebrow">ARCHIVE</div><h2>往期晨报</h2></div><span className="history-count">已保存 {history.length} 期</span></div>{history.length ? <div className="history-list">{history.map((entry) => <button key={`${entry.date}-${entry.generated_at}`} className={`history-item ${entry.date === selectedDate ? 'history-item-active' : ''}`} onClick={() => viewArchive(entry)}><span className="history-date">{entry.date}</span><span className="history-view-label">查看内容</span></button>)}</div> : <div className="empty-state">暂无已保存的历史晨报快照；同步任务成功运行后将从下一期开始归档。</div>}</section>}
  </div>;
}
