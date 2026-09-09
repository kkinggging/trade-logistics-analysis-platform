import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { loadStrategyData } from '@/core/strategy/data';
import { buildMorningBrief, type BriefMetric, type MorningBriefModel } from '@/core/strategy/morningBrief';
import { FastNewsItem, RiskSignal } from '@/core/store/types';
import { getTraditionalCalendarText } from '@/shared/utils/traditionalCalendar';
import { readCachedBeijingWeather, requestBeijingWeather } from '@/shared/utils/weather';
import type { BeijingWeather } from '@/shared/utils/weather';
import './MorningBrief.css';
import { useAppContext } from '@/core/store/context';
import { TideBrief } from './TideBrief';

gsap.registerPlugin(useGSAP);

interface BriefArchiveEntry { date: string; generated_at: string; data_state?: string; summary: string; actions: string[]; evidence: string[]; }
const factorLabel: Record<string, string> = { price_volatility: '价格波动', freight_cost: '运费成本', carbon_cost: '碳成本', policy_risk: '政策风险', demand_weakness: '需求走弱', fx_volatility: '汇率波动' };
const riskLabel: Record<RiskSignal['level'], string> = { critical: '严重', high_attention: '高度关注', attention: '关注', normal: '正常' };
type WeatherStatus = 'loading' | 'ready' | 'unavailable';
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
function fixed(value: number | null | undefined, digits = 1) { return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits); }
function briefSyncText(model: MorningBriefModel) {
  if (model.dataState === 'unavailable') return '关键数据暂不可用';
  if (model.fallbackSources.length) return '部分沿用最近成功数据';
  if (model.degradedSources.some((source) => source.startsWith('mysteel-fast-news'))) return '已更新 · 部分范围需复核';
  if (model.dataState === 'partial') return '部分数据待核验';
  return '数据链路正常';
}
function briefSourceState(model: MorningBriefModel) {
  if (model.dataState === 'unavailable') return '不可用';
  if (model.fallbackSources.length) return '部分沿用快照';
  if (model.degradedSources.some((source) => source.startsWith('mysteel-fast-news'))) return '已更新 · 需复核范围';
  return '已更新';
}
function newsArticleUrl(news: FastNewsItem) { return news.source_url || news.in_article_url || news.out_article_url || null; }
function newsQualityText(model: MorningBriefModel) {
  const source = model.newsSource;
  if (!source) return '';
  const quality = source.quality;
  const parts = [`抓取 ${formatWeatherTime(source.source.captured_at)}`, `覆盖 ${source.source.coverage_end || '—'}`];
  if (source.source.truncation_detected && source.source.reported_total != null) parts.push(`已采集 ${quality.accepted_count.toLocaleString('zh-CN')} 条 · 业务筛选展示 ${model.news.length} 条 / 源站报告 ${source.source.reported_total.toLocaleString('zh-CN')} 条`);
  else parts.push(`有效 ${quality.accepted_count.toLocaleString('zh-CN')} 条`);
  if (quality.missing_source_link_count) parts.push(`${quality.missing_source_link_count} 条无原文入口，按品类归档`);
  return parts.join(' · ');
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
  const [briefMode, setBriefMode] = useState<'trade' | 'tide'>('trade');
  const [briefData, setBriefData] = useState<MorningBriefModel | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [history, setHistory] = useState<BriefArchiveEntry[]>([]); const [showHistory, setShowHistory] = useState(false); const [selectedArchive, setSelectedArchive] = useState<BriefArchiveEntry | null>(null); const [selectedDate, setSelectedDate] = useState(today()); const [calendarDate, setCalendarDate] = useState(today());
  const [currentDate, setCurrentDate] = useState(today()); const [weather, setWeather] = useState<BeijingWeather | null>(() => readCachedBeijingWeather()); const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>(() => readCachedBeijingWeather() ? 'ready' : 'loading');
  const briefRef = useRef<HTMLDivElement>(null);
  const { state } = useAppContext();
  useEffect(() => { let active = true; Promise.all([loadStrategyData({ productLine: state.productLine, region: state.region }), fetch(`${import.meta.env.BASE_URL}data/brief_history.json`).then((response) => response.ok ? response.json() : []).catch(() => [])]).then(([data, archives]) => { if (!active) return; setBriefData(buildMorningBrief(data)); setHistory(Array.isArray(archives) ? archives : []); }).catch((err) => active && setError(err instanceof Error ? err.message : '加载晨报失败')).finally(() => active && setLoading(false)); return () => { active = false; }; }, [state.productLine, state.region]);
  useEffect(() => { const timer = window.setInterval(() => setCurrentDate(today()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    const loadWeather = () => requestBeijingWeather()
      .then((nextWeather) => { if (active) { setWeather(nextWeather); setWeatherStatus('ready'); } })
      .catch(() => { if (active) setWeatherStatus((current) => current === 'ready' ? 'ready' : 'unavailable'); });
    loadWeather();
    const timer = window.setInterval(loadWeather, 30 * 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const traditional = useMemo(() => getTraditionalCalendarText(calendarDate), [calendarDate]); const showWeather = selectedDate === currentDate;
  useGSAP((_, contextSafe) => {
    if (!briefData || !briefRef.current?.querySelector('.brief-reveal')) return;
    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out', overwrite: 'auto' } });
      timeline
        .fromTo('.brief-cover', { y: 6, autoAlpha: 0, clipPath: 'inset(0 0 3% 0)' }, { y: 0, autoAlpha: 1, clipPath: 'inset(0 0 0% 0)', duration: .2 })
        .fromTo('.cover-brand, .cover-tools', { y: 4, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .11, stagger: .015 }, '-=.13')
        .fromTo('.cover-kicker', { y: 3, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .1 }, '-=.09')
        .fromTo('.cover-motion-line span', { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: .2, ease: 'power2.out' }, '-=.06')
        .fromTo('.cover-copy h1', { y: 6, clipPath: 'inset(0 0 100% 0)' }, { y: 0, clipPath: 'inset(0 0 0% 0)', duration: .18 }, '-=.13')
        .fromTo('.cover-copy p, .cover-bottom', { y: 4, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .11, stagger: .015 }, '-=.1')
        .fromTo('.brief-command', { y: 6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .15 }, '-=.08')
        .fromTo('.command-conclusion-item', { x: -4, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .11, stagger: .012 }, '-=.1')
        .fromTo('.brief-metric', { y: 4, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .1, stagger: .01 }, '-=.08')
        .fromTo('.pulse-row', { y: 3, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .1 }, '-=.07');
      const pulseLine = briefRef.current?.querySelector<SVGPolylineElement>('.pulse-chart polyline');
      if (pulseLine) {
        const length = pulseLine.getTotalLength();
        timeline.fromTo(pulseLine, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: .35, ease: 'power2.out' }, '-=.08');
      }
      const details = Array.from(briefRef.current?.querySelectorAll<HTMLDetailsElement>('details') || []);
      const revealDetail = (event: Event) => {
        const detail = event.currentTarget as HTMLDetailsElement;
        if (!detail.open) return;
        const content = Array.from(detail.children).find((child) => child.tagName !== 'SUMMARY') as HTMLElement | undefined;
        if (content) gsap.fromTo(content, { y: 4, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .22, ease: 'power2.out', clearProps: 'transform' });
      };
      const safeRevealDetail = contextSafe ? contextSafe(revealDetail) : revealDetail;
      details.forEach((detail) => detail.addEventListener('toggle', safeRevealDetail));
      return () => { details.forEach((detail) => detail.removeEventListener('toggle', safeRevealDetail)); timeline.kill(); };
    }, briefRef);
    return () => motion.revert();
  }, { scope: briefRef, dependencies: [briefData?.generatedAt], revertOnUpdate: true });
  function viewArchive(entry: BriefArchiveEntry) { setSelectedDate(entry.date); setCalendarDate(entry.date); setSelectedArchive(entry); setShowHistory(true); }
  function handleCalendarChange(value: string) { setCalendarDate(value); setSelectedDate(value); setSelectedArchive(null); }
  if (briefMode === 'tide') return <div className="morning-brief morning-brief-shell morning-brief-tide"><BriefModeSwitch mode={briefMode} onChange={setBriefMode} /><TideBrief /></div>;
  if (loading && !briefData) return <div className="morning-brief morning-brief-shell"><BriefModeSwitch mode={briefMode} onChange={setBriefMode} /><div className="brief-loading" role="status">正在整理当期晨报…</div></div>;
  const model = briefData;
  return <div className="morning-brief morning-brief-shell" ref={briefRef}>
    <BriefModeSwitch mode={briefMode} onChange={setBriefMode} />
    {error && <div className="error-banner" role="alert"><span className="error-mark" aria-hidden="true">!</span><p>{error}</p></div>}
    {model && <div className="brief-paper">
      <section className="brief-cover brief-reveal" style={{ backgroundImage: `linear-gradient(110deg, rgba(11, 31, 50, .96) 0%, rgba(17, 51, 78, .82) 46%, rgba(19, 48, 72, .34) 100%), url('${import.meta.env.BASE_URL}assets/cover-building.jpg')` }}>
        <div className="cover-top"><div className="cover-brand"><img src={`${import.meta.env.BASE_URL}assets/logo.jpg`} alt="首钢国际" /><span>首钢国际 · 贸易物流一体化分析辅助平台</span></div><div className="cover-tools">{showWeather && <div className={`weather-chip weather-chip-${weatherStatus}`} title={weather?.updatedAt ? `天气更新于 ${formatWeatherTime(weather.updatedAt)}` : '天气数据暂不可用'}><span className="weather-glyph" aria-hidden="true">{weatherStatus === 'ready' ? '天气' : '气'}</span><div><strong>{weatherStatus === 'ready' && weather ? `${weather.location} ${Math.round(weather.temperature)}°` : '北京天气'}</strong><small>{weatherStatus === 'ready' && weather ? `${formatWeather(weather.weatherCode)} · ${Math.round(weather.low)}°—${Math.round(weather.high)}°` : weatherStatus === 'loading' ? '正在更新' : '暂不可用 · 不影响晨报'}</small></div></div>}</div></div>
        <div className="cover-copy"><span className="cover-kicker">TRADE & LOGISTICS · MORNING BRIEF</span><div className="cover-motion-line" aria-hidden="true"><span /></div><h1>贸易物流一体化行业晨报</h1><p>用事实筛出今天真正需要先看的事项</p></div>
        <div className="cover-bottom"><div className="cover-traditional"><span>节气时序</span><strong>{traditional.term}</strong><small>{traditional.isTermDay ? '今日交节' : traditional.hou} · {traditional.dateLabel}</small></div><div className="cover-bottom-tools"><label className="calendar-input" title="查看指定日期节气"><span aria-hidden="true">日</span><input type="date" value={calendarDate} max={currentDate} onChange={(event) => handleCalendarChange(event.currentTarget.value)} onInput={(event) => handleCalendarChange(event.currentTarget.value)} aria-label="查看指定日期节气" /></label><button type="button" className="archive-button" onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory} aria-controls="brief-history">{showHistory ? '收起往期晨报' : '查看往期晨报'}</button><div className={`brief-sync-status brief-sync-${model.dataState}`} title={`数据同步于 ${formatWeatherTime(model.dataSyncGeneratedAt || '')}；本页生成于 ${formatWeatherTime(model.generatedAt)}`}><span aria-hidden="true" />{briefSyncText(model)}</div></div></div>
      </section>

      <section className="brief-section brief-command brief-reveal" aria-labelledby="brief-command-title"><div className="brief-section-heading"><div><span className="section-mark">今天先看</span><h2 id="brief-command-title">今日先看结论</h2></div><span className="section-note">结论、精华数据与风险同源生成</span></div><div className="command-layout"><div className="command-copy"><div className="conclusion-list" aria-label="今日核心判断">{model.conclusionItems.map((item) => <article className={`command-conclusion-item conclusion-${item.tone}`} key={item.id}><span className="conclusion-dot" aria-hidden="true" /><div><strong>{item.label}</strong><p>{item.text}</p></div></article>)}</div><div className="command-facts"><span>价差 <strong>{model.spread.value == null ? '待补' : `${model.spread.status} ${model.spread.value >= 0 ? '+' : ''}${fixed(model.spread.value)} USD/t`}</strong></span>{model.business && <span>内部年度出口 <strong>{model.business.totalVolume.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 吨</strong></span>}{model.quota.eu && <span>EU 配额 <strong>剩余 {fixed(model.quota.eu.remainingPct)}%</strong></span>}{model.quota.uk && <span>UK 配额 <strong>剩余 {fixed(model.quota.uk.remainingPct)}%</strong></span>}{model.remedy && <span>贸易救济 <strong>{model.remedy.impact}影响 · {model.remedy.caseItem.country}</strong></span>}</div><div className="command-provenance"><span>本页生成 <strong>{formatWeatherTime(model.generatedAt)}</strong></span><span>数据同步 <strong>{formatWeatherTime(model.dataSyncGeneratedAt || '')}</strong></span><span>来源状态 <strong>{briefSourceState(model)}</strong></span></div></div><aside className="command-rail" aria-label="精华关键数据"><div className="rail-heading"><strong>精华关键数据</strong></div><div className="spread-detail"><span>国内外钢材价差</span><strong>{model.spread.value == null ? '—' : <>{model.spread.value >= 0 ? '+' : ''}{fixed(model.spread.value)} <small>USD/t</small></>}</strong><small>{model.spread.detail}</small></div><div className="metric-grid">{model.metrics.map((metric) => <MetricRail key={metric.id} metric={metric} />)}</div></aside></div><BusinessPulse model={model} /></section>

      <section className="brief-section brief-advice brief-reveal" aria-labelledby="brief-advice-title"><div className="brief-section-heading"><div><span className="section-mark">只给动作</span><h2 id="brief-advice-title">业务建议</h2></div><span className="section-note">已展示 {Math.min(model.advice.length, 5)} 条 · 每条建议均附数据依据</span></div><div className="advice-plan"><div className="plan-summary"><span>销售方案摘要</span><p>{model.salesPlan.summary}</p></div>{model.salesPlan.actions.length > 0 && <div className="plan-actions"><span>优先动作</span><ol>{model.salesPlan.actions.slice(0, 4).map((action) => <li key={action}>{action}</li>)}</ol></div>}</div><div className="advice-grid">{model.advice.slice(0, 5).map((advice, index) => <article className="advice-item" key={advice.id}><div className="advice-index">{String(index + 1).padStart(2, '0')}</div><div><div className="advice-title-row"><strong>{advice.title}</strong><span className={`priority priority-${advice.priority}`}>{advice.priority}优先</span></div><p>{advice.recommendation}</p><details><summary>查看完整依据 · {advice.sourceLabels.join('、')}</summary><div className="advice-evidence">{advice.evidence.map((evidence) => <span key={evidence}>{evidence}</span>)}{advice.evidenceMeta.map((meta) => <span key={`${meta.source}-${meta.coverageEnd}`}>{meta.source} · 覆盖至 {meta.coverageEnd || '—'} · {meta.state === 'fallback' ? '沿用上次快照' : meta.state === 'fresh' ? '已更新' : '待核验'}</span>)}</div></details></div></article>)}</div>{model.salesPlan.guardrails.length > 0 && <details className="plan-guardrails"><summary>成交前置条件 · {model.salesPlan.guardrails.length} 条</summary><ul>{model.salesPlan.guardrails.map((guardrail) => <li key={guardrail}>{guardrail}</li>)}</ul></details>}<details className="plan-evidence"><summary>查看销售方案总依据 · {model.salesPlan.evidence.length} 条</summary><ul>{model.salesPlan.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></details>{!model.advice.length && <p className="compact-empty">当前没有足够数据依据生成业务建议。</p>}</section>

      {model.news.length > 0 && <section className="brief-section brief-news brief-reveal" aria-labelledby="brief-news-title"><div className="brief-section-heading"><div><span className="section-mark">行业信号</span><h2 id="brief-news-title">我的钢铁网 · 行业快讯</h2></div><span className="section-note">{newsQualityText(model)} · {briefSourceState(model)}</span></div>{model.newsSource?.source.truncation_detected && <p className="news-quality-note">本期展示已采集范围内、与热轧/冷轧/镀层/硅钢/出口业务相关的精选快讯；源站报告量更大，未采集部分不作为本期结论依据。</p>}<div className="news-list">{model.news.slice(0, 3).map((news) => <NewsLine key={news.news_id} news={news} />)}</div>{model.news.length > 3 && <details className="brief-more"><summary>展开其余 {model.news.length - 3} 条快讯</summary><div className="news-list">{model.news.slice(3).map((news) => <NewsLine key={news.news_id} news={news} />)}</div></details>}</section>}

      <section className="brief-section brief-risk-policy brief-reveal" aria-labelledby="brief-risk-title"><div className="risk-policy-grid"><div><div className="brief-section-heading"><div><span className="section-mark">风险闸门</span><h2 id="brief-risk-title">风险与政策动态</h2></div><div className="risk-heading-actions"><span className="section-total">置顶风险 {model.risks.length} / 共 {model.riskTotalCount} 条</span><a className="risk-index-link" href="#/analysis">前往综合分析风险总板块 <span aria-hidden="true">↗</span></a></div></div><div className="risk-list">{model.risks.slice(0, 3).map((risk) => <div className="risk-line" key={risk.signal_id}><span className={`risk-state risk-state-${risk.level}`}>{riskLabel[risk.level]}</span><div><strong>{factorLabel[risk.factor] || risk.factor}</strong><span>{risk.metric} · {risk.delta_pct == null ? '变化待补' : `${risk.delta_pct >= 0 ? '+' : ''}${fixed(risk.delta_pct)}%`} · {risk.as_of.slice(0, 10)}</span></div></div>)}{model.remedy && <div className="risk-line remedy-line"><span className="risk-state risk-state-high_attention">救济</span><div><strong>{model.remedy.caseItem.country} · {model.remedy.caseItem.case_type}</strong><span>{model.remedy.caseItem.case_name} · {model.remedy.linkedDestinations.length ? `关联内部目的国：${model.remedy.linkedDestinations.join('、')}` : '尚未匹配内部目的国聚合'} · 活动案件 {model.remedy.activeCaseCount}/{model.remedy.totalCaseCount}</span></div></div>}</div>{model.risks.length > 3 && <details className="brief-more"><summary>展开其余 {model.risks.length - 3} 条置顶风险（共 {model.riskTotalCount} 条）</summary><div className="risk-list">{model.risks.slice(3).map((risk) => <div className="risk-line" key={risk.signal_id}><span className={`risk-state risk-state-${risk.level}`}>{riskLabel[risk.level]}</span><div><strong>{factorLabel[risk.factor] || risk.factor}</strong><span>{risk.metric} · {risk.delta_pct == null ? '变化待补' : `${risk.delta_pct >= 0 ? '+' : ''}${fixed(risk.delta_pct)}%`} · {risk.as_of.slice(0, 10)}</span></div></div>)}</div></details>}</div><div className="policy-column"><div className="brief-section-heading"><div><span className="section-mark">政策变化</span><h2>最近发布</h2></div><span className="section-total">重点政策 {model.policies.length} / 最近 {model.policyWindowCount} 条</span></div><div className="policy-list">{model.policies.slice(0, 3).map((policy) => <article className="policy-line" key={policy.event_id}><strong>{policy.title}</strong><span>{policy.country_region} · {policy.publish_date} · 严重程度 {policy.severity}</span><p>{policy.summary}</p></article>)}</div>{model.policies.length > 3 && <details className="brief-more"><summary>展开其余 {model.policies.length - 3} 条重点政策（最近 {model.policyWindowCount} 条）</summary><div className="policy-list">{model.policies.slice(3).map((policy) => <article className="policy-line" key={policy.event_id}><strong>{policy.title}</strong><span>{policy.country_region} · {policy.publish_date} · 严重程度 {policy.severity}</span><p>{policy.summary}</p></article>)}</div></details>}</div></div></section>
    </div>}
    {showHistory && <section className="history-section" id="brief-history" aria-label="往期晨报"><div className="history-heading"><div><span className="section-mark">档案</span><h2>往期晨报</h2></div><span className="history-count">已保存 {history.length} 期</span></div>{history.length ? <div className="history-list">{history.map((entry) => <button key={`${entry.date}-${entry.generated_at}`} className={`history-item ${entry.date === selectedDate ? 'history-item-active' : ''}`} onClick={() => viewArchive(entry)}><span className="history-date">{entry.date}</span><span className="history-summary">{entry.summary}</span><span className="history-view-label">查看</span></button>)}</div> : <div className="compact-empty">暂无已归档晨报；同步任务成功运行后将从下一期开始保存。</div>}{selectedArchive && <article className="history-detail" aria-live="polite"><div className="history-detail-heading"><div><span className="section-mark">已选档案</span><h3>{selectedArchive.date}</h3></div><time>{formatWeatherTime(selectedArchive.generated_at)}</time></div><p>{selectedArchive.summary}</p>{selectedArchive.actions.length > 0 && <div><strong>当期动作</strong><ul>{selectedArchive.actions.map((action) => <li key={action}>{action}</li>)}</ul></div>}{selectedArchive.evidence.length > 0 && <div><strong>数据依据</strong><ul>{selectedArchive.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></div>}</article>}<p className="history-note">历史档案使用同步任务保存的结论与证据摘要；切回当日日期即可查看当前动态指标。</p></section>}
  </div>;
}

function BriefModeSwitch({ mode, onChange }: { mode: 'trade' | 'tide'; onChange: (mode: 'trade' | 'tide') => void }) {
  return <div className="brief-mode-switch" role="group" aria-label="选择早报类型">
    <span className="brief-mode-label">早报</span>
    <label className="brief-mode-control">
      <input type="checkbox" checked={mode === 'tide'} onChange={(event) => onChange(event.currentTarget.checked ? 'tide' : 'trade')} aria-label="切换贸易晨报与潮汐早报" />
      <span className="brief-mode-track" aria-hidden="true"><span data-off="贸易晨报" data-on="潮汐早报" /></span>
    </label>
  </div>;
}

function MetricRail({ metric }: { metric: BriefMetric }) {
  const stateLabel = metric.sourceState === 'fallback' ? '沿用上次快照' : metric.sourceState === 'unavailable' ? '待核验' : metric.sourceState === 'fresh' ? '已更新' : metric.sourceState === 'local' ? '内部快照' : '';
  return <div className={`brief-metric metric-${metric.direction}`} data-source-state={metric.sourceState || 'unknown'}><div className="metric-top"><span>{metric.label}</span><strong>{metric.value}</strong></div><div className="metric-bottom"><span>{metric.changePeriod ? `${metric.changePeriod} ${metric.change}` : metric.change}</span><small>{metric.detail} · {metric.asOf}{stateLabel ? ` · ${stateLabel}` : ''}</small></div></div>;
}

function BusinessPulse({ model }: { model: MorningBriefModel }) {
  const points = model.monthlyPulse.map((row) => row.actual_volume_t);
  const targets = model.monthlyPulse.map((row) => row.target_volume_t);
  const max = Math.max(...points, ...targets, 1); const min = 0; const range = Math.max(max - min, 1);
  const pointX = (index: number) => (index / Math.max(points.length - 1, 1)) * 100;
  const pointY = (value: number) => 88 - ((value - min) / range) * 64;
  const polyline = points.map((value, index) => `${pointX(index)},${pointY(value)}`).join(' ');
  const targetPolyline = targets.map((value, index) => `${pointX(index)},${pointY(value)}`).join(' ');
  const latest = model.monthlyPulse[model.monthlyPulse.length - 1];
  return <div className="pulse-row"><div><span className="pulse-label">内部出口节奏 · 2025月度聚合</span><strong>{model.business ? `${model.business.topDestination?.label || '—'} / ${model.business.topProduct?.label || '—'}` : '—'}</strong><small>实际量与月度增长目标分开保存，不将目标值混入事实。</small></div>{points.length > 1 && <div className="pulse-chart-wrap"><svg className="pulse-chart" viewBox="0 0 100 100" role="img" aria-label="2025年月度实际出口量与增长目标对照"><line x1="0" x2="100" y1="88" y2="88" /><polyline className="pulse-target" points={targetPolyline} /><polyline className="pulse-actual" points={polyline} /></svg><div className="pulse-chart-labels" aria-hidden="true">{model.monthlyPulse.map((row) => <span key={row.month}>{row.label.replace('月', '')}</span>)}</div><div className="pulse-legend"><span className="legend-actual">实际出口量</span><span className="legend-target">增长目标</span></div></div>}<div className="pulse-latest">{latest?.label || '—'}<strong>{latest ? `${latest.actual_volume_t.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 吨` : '—'}</strong><small>{latest?.actual_growth_pct == null ? '月度基线' : `环比 ${latest.actual_growth_pct >= 0 ? '+' : ''}${fixed(latest.actual_growth_pct)}%`}</small></div></div>;
}

function NewsLine({ news }: { news: FastNewsItem & { matchedTopics?: string[] } }) {
  const articleUrl = newsArticleUrl(news);
  const articleTitle = news.in_article_title || news.out_article_title || '查看原文';
  return <article className="news-line"><time>{formatNewsTime(news.published_at)}</time><div className="news-content"><div className="news-tags">{(news.matchedTopics?.length ? news.matchedTopics : [sourceLabel(news)]).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div><p>{news.content_text}</p><div className="news-meta">{news.source_name && <span>{news.source_name}</span>}{articleUrl && <a href={articleUrl} title={articleTitle} target="_blank" rel="noreferrer">查看原文 ↗</a>}{!articleUrl && <span>按品类归档</span>}</div></div></article>;
}
