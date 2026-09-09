import { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import * as echarts from 'echarts';
import { useAppContext } from '@/core/store/context';
import { dataProvider } from '@/core/data/provider';
import { buildDataDrivenAdvice, DataDrivenAdvice } from '@/core/strategy/engine';
import { DataAdviceCard } from '@/shared/components/data/DataAdviceCard';
import {
  InternalAggregate,
  MarketQuote,
  PolicyEvent,
  ProductCost,
  RiskSignal,
  FxScenario,
  SteelExportSnapshot,
  ForexSnapshot,
  TaricQuotaSnapshot,
  ShippingIndexSnapshot,
  TradeRemedySnapshot,
  InternalBusinessSnapshot,
  FastNewsSnapshot,
} from '@/core/store/types';
import './UnifiedAnalysis.css';

gsap.registerPlugin(useGSAP);

function formatDate(value?: string) {
  return value ? value.slice(0, 10) : '—';
}

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits });
}

function humanizeDisplay(value: string) {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function chartThemeFromCss() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return { text: read('--text-secondary', '#526274'), grid: read('--border-default', '#dce5ee'), blue: read('--accent-primary', '#1f4e79'), lightBlue: read('--accent-secondary', '#4f8bb8'), orange: read('--accent-warning', '#e8842a'), red: read('--accent-danger', '#bd3f4d'), green: read('--accent-secondary', '#4f9b96'), purple: '#7b6cae', muted: read('--text-tertiary', '#9aaaba'), card: read('--surface-card', '#fff'), surface: read('--surface-2', '#f7f9fc') };
}

function useThemeKey() {
  const [key, setKey] = useState(() => typeof document === 'undefined' ? 'default' : document.documentElement.dataset.theme || 'default');
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setKey(root.dataset.theme || 'default'));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return key;
}

const indicatorChinese: Record<string, string> = {
  STEEL_HR_FOB_CN: '热轧卷板 · FOB 中国',
  STEEL_CR_FOB_CN: '冷轧卷板 · FOB 中国',
  STEEL_HR_CIF_EU: '热轧卷板 · CIF 欧洲',
  STEEL_SILICON_FOB_CN: '硅钢 · FOB 中国',
  STEEL_HR_CFR_SEA: '热轧卷板 · CFR 东南亚',
  STEEL_CR_CFR_SEA: '冷轧卷板 · CFR 东南亚',
  FREIGHT_CAPE_PACIFIC: '海运费 · 中国至欧洲',
  CARBON_EUA: '欧盟碳排放配额 · EUA',
  IRON_ORE_62FE_CFR: '铁矿石 · 62% Fe CFR 中国',
  COKING_COAL_FOB_AUS: '炼焦煤 · FOB 澳大利亚',
  SCRAP_HMS_CFR_TR: '废钢 · HMS 80:20 CFR 土耳其',
  NICKEL_LME_CASH: '镍 · LME 现货',
};

const indicatorShortChinese: Record<string, string> = {
  STEEL_HR_FOB_CN: '热轧 FOB 中国',
  STEEL_CR_FOB_CN: '冷轧 FOB 中国',
  STEEL_HR_CIF_EU: '热轧 CIF 欧洲',
  STEEL_SILICON_FOB_CN: '硅钢 FOB 中国',
  STEEL_HR_CFR_SEA: '热轧 CFR 东南亚',
  STEEL_CR_CFR_SEA: '冷轧 CFR 东南亚',
  FREIGHT_CAPE_PACIFIC: '海运费 · 中欧',
  CARBON_EUA: 'EUA 碳价',
  IRON_ORE_62FE_CFR: '铁矿石 CFR 中国',
  COKING_COAL_FOB_AUS: '炼焦煤 FOB 澳大利亚',
  SCRAP_HMS_CFR_TR: '废钢 CFR 土耳其',
  NICKEL_LME_CASH: '镍 · LME 现货',
};


const factorChinese: Record<string, string> = {
  price_volatility: '价格波动',
  freight_cost: '运费成本',
  carbon_cost: '碳成本',
  policy_risk: '政策风险',
  demand_weakness: '需求走弱',
  fx_volatility: '汇率波动',
  inventory_pressure: '内部库存压力',
  credit_risk: '客户信用风险',
  supply_chain: '供应链稳定性',
  market_access: '市场准入',
  liquidity: '市场流动性',
  market_sentiment: '市场情绪',
  geopolitical: '地缘与重大事件',
  operational: '内部运营波动',
};

const metricChinese: Record<string, string> = {
  steel_price_volatility_30d: '30日钢价波动率',
  ocean_freight_china_europe: '中国至欧洲海运费',
  eua_price: 'EUA碳价',
  eu_antidumping_probability: '欧盟反倾销概率',
  order_completion_rate: '订单完成率',
  fx_volatility_30d: '30日汇率波动率',
};

type RiskCategory = 'remedy' | 'quota' | 'market-volatility' | 'internal-competition' | 'trade-policy' | 'geopolitical';

const riskCategoryMeta: Record<RiskCategory, { label: string; shortLabel: string; description: string }> = {
  remedy: { label: '贸易救济', shortLabel: '救济', description: '反倾销、反补贴、保障措施及其调查进展' },
  quota: { label: '关税配额', shortLabel: '配额', description: '配额余额、临界状态与可用性约束' },
  'market-volatility': { label: '汇率及航运指数波动', shortLabel: '汇率 / 航运', description: '汇率、运费、钢价及能源成本的异常波动' },
  'internal-competition': { label: '内部市场竞争', shortLabel: '内部市场', description: '订单、客户、库存与经营执行端的变化' },
  'trade-policy': { label: '对等关税等贸易政策', shortLabel: '贸易政策', description: '关税、CBAM、许可和其他市场准入政策' },
  geopolitical: { label: '重大新闻事件', shortLabel: '重大事件', description: '战争、航线中断及影响贸易的突发事件' },
};

const riskCategoryOrder: RiskCategory[] = ['remedy', 'quota', 'market-volatility', 'internal-competition', 'trade-policy', 'geopolitical'];

function classifyRisk(signal: RiskSignal): RiskCategory {
  const text = `${signal.factor} ${signal.metric} ${signal.rule_id || ''}`.toLowerCase();
  if (/antidump|anti.?dump|countervail|safeguard|remedy|救济/.test(text)) return 'remedy';
  if (/quota|tariff.?quota|配额/.test(text)) return 'quota';
  if (/geopolitical|war|route.?disruption|conflict|战争|地缘/.test(text)) return 'geopolitical';
  if (/tariff|cbam|policy|market.?access|license|customs|关税|政策|许可/.test(text)) return 'trade-policy';
  if (/fx|freight|shipping|vessel|price.?volatility|carbon|eua|航运|汇率|运费|钢价/.test(text)) return 'market-volatility';
  return 'internal-competition';
}

function riskValueText(signal: RiskSignal) {
  const value = Number(signal.value);
  if (!Number.isFinite(value)) return '—';
  if (/probability|rate|ratio|pct|completion|reliability|share/.test(signal.metric.toLowerCase())) {
    return `${(value <= 1 && value >= 0 ? value * 100 : value).toFixed(1)}%`;
  }
  return formatNumber(value, 2);
}

function formatRiskChange(signal: RiskSignal) {
  const delta = signal.delta_pct;
  if (delta == null || !Number.isFinite(delta)) return `当前记录为 ${riskValueText(signal)}，暂无可比基线。`;
  return `较基线${delta >= 0 ? '增加' : '减少'} ${Math.abs(delta).toFixed(1)}%，当前记录为 ${riskValueText(signal)}。`;
}

function riskTargetId(signal: RiskSignal) {
  const text = `${signal.factor} ${signal.metric} ${signal.rule_id || ''}`.toLowerCase();
  if (/fx|forex|汇率/.test(text)) return 'forex-analysis';
  if (/freight|shipping|vessel|航运|运费|物流|supply.?chain/.test(text)) return 'shipping-indices';
  return 'analysis-objective-charts';
}

function getSafeExternalLink(href?: string) {
  if (!href) return null;
  try {
    const url = new URL(href);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (/example|localhost|127\.0\.0\.1|invalid/i.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function riskSource(signal: RiskSignal, policies: PolicyEvent[], tradeRemedy: TradeRemedySnapshot | null, taricQuota: TaricQuotaSnapshot | null, shippingIndices: ShippingIndexSnapshot | null, forex: ForexSnapshot | null, fastNews: FastNewsSnapshot | null) {
  const policy = signal.evidence_ref?.map((ref) => policies.find((item) => item.event_id === ref)).find(Boolean);
  const category = classifyRisk(signal);
  const source = policy?.source_url ? getSafeExternalLink(policy.source_url) : null;
  if (source) return { label: '查看政策来源', href: source };
  const remedyUrl = category === 'remedy' ? getSafeExternalLink(tradeRemedy?.source.dashboard_url) : null;
  if (remedyUrl) return { label: '查看贸易救济看板', href: remedyUrl };
  const quotaUrl = category === 'quota' ? getSafeExternalLink(taricQuota?.source.dashboard_url) : null;
  if (quotaUrl) return { label: '查看配额来源', href: quotaUrl };
  if (category === 'market-volatility') {
    const forexUrl = signal.factor === 'fx_volatility' ? getSafeExternalLink(forex?.source.dashboard_url) : null;
    if (forexUrl) return { label: '查看外汇看板', href: forexUrl };
    const shippingUrl = (signal.factor === 'freight_cost' || signal.factor === 'supply_chain') ? getSafeExternalLink(shippingIndices?.source.dashboard_url) : null;
    if (shippingUrl) return { label: '查看航运看板', href: shippingUrl };
  }
  const newsUrl = category === 'geopolitical' ? getSafeExternalLink(fastNews?.source.dashboard_url) : null;
  if (newsUrl) return { label: '查看快讯来源', href: newsUrl };
  return null;
}

function riskEvidence(signal: RiskSignal, policies: PolicyEvent[]) {
  return (signal.evidence_ref || []).map((ref) => {
    const policy = policies.find((item) => item.event_id === ref);
    const href = getSafeExternalLink(policy?.source_url);
    return href ? { label: ref, href } : null;
  }).filter((item): item is { label: string; href: string } => Boolean(item));
}

interface ObjectiveChartsProps {
  quotes: MarketQuote[];
  aggregates: InternalAggregate[];
  costs: ProductCost[];
  scenarios: FxScenario[];
  internalBusiness: InternalBusinessSnapshot | null;
  steelExport: SteelExportSnapshot | null;
  taricQuota: TaricQuotaSnapshot | null;
  advice: DataDrivenAdvice[];
  tradeRemedy: TradeRemedySnapshot | null;
}

interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  type: string;
  region: string;
  summary: string;
  sourceUrl?: string;
  severity: number;
  sourceLabel: string;
}

function build2025TimelineEvents(policies: PolicyEvent[], tradeRemedy: TradeRemedySnapshot | null): TimelineEvent[] {
  const policyEvents: TimelineEvent[] = policies
    .filter((item) => item.publish_date?.startsWith('2025-'))
    .map((item) => ({
      id: item.event_id,
      date: item.publish_date,
      title: item.title,
      type: item.event_type === 'anti_dumping' ? '反倾销' : item.event_type === 'quota' ? '配额 / 许可' : '贸易政策',
      region: item.country_region,
      summary: item.summary,
      sourceUrl: item.source_url,
      severity: item.severity,
      sourceLabel: '政策事件库',
    }));
  const remedyEvents: TimelineEvent[] = (tradeRemedy?.cases || [])
    .map((item) => ({
      id: `remedy-${item.case_id}`,
      date: item.latest_stage_date || item.filing_date || item.first_seen || '',
      title: item.case_name || `${item.country} ${item.variety || '钢材'}贸易救济案件`,
      type: item.case_type || '贸易救济',
      region: item.country,
      summary: `${item.latest_stage || item.case_state || '案件状态待核验'}；涉及${item.product_cn || item.variety || '钢材'}${item.hs_text ? `，HS：${item.hs_text}` : ''}。`,
      sourceUrl: item.original_article_url || item.source_url || item.stages?.find((stage) => stage.url)?.url || undefined,
      severity: item.case_type === '保障措施' ? 8 : item.case_state?.includes('执行') ? 8 : 7,
      sourceLabel: '出口贸易救济案件看板',
    }))
    .filter((item) => item.date.startsWith('2025-'));
  return [...policyEvents, ...remedyEvents]
    .filter((item) => /^2025-(0[1-9]|1[0-2])-\d{2}/.test(item.date))
    .sort((a, b) => b.date.localeCompare(a.date) || b.severity - a.severity);
}

function BusinessOutputAndPolicyTimeline({ snapshot, policies, tradeRemedy }: { snapshot: InternalBusinessSnapshot; policies: PolicyEvent[]; tradeRemedy: TradeRemedySnapshot | null }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<HTMLDivElement>(null);
  const themeKey = useThemeKey();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const timelineEvents = useMemo(() => build2025TimelineEvents(policies, tradeRemedy), [policies, tradeRemedy]);
  const monthKeys = useMemo(() => Array.from({ length: 12 }, (_, index) => `2025-${String(index + 1).padStart(2, '0')}`), []);
  const eventsByMonth = useMemo(() => {
    const grouped = new Map<string, TimelineEvent[]>();
    monthKeys.forEach((month) => grouped.set(month, []));
    timelineEvents.forEach((event) => grouped.set(event.date.slice(0, 7), [...(grouped.get(event.date.slice(0, 7)) || []), event]));
    return grouped;
  }, [monthKeys, timelineEvents]);
  const expandedEvents = expandedMonth ? eventsByMonth.get(expandedMonth) || [] : [];

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.getInstanceByDom(chartRef.current) || echarts.init(chartRef.current);
    const theme = chartThemeFromCss();
    const rows = snapshot.monthly.slice(0, 12);
    const actual = rows.map((row) => row.actual_volume_t);
    const target = rows.map((row) => row.target_volume_t);
    chart.setOption({
      animationDuration: 760,
      animationEasing: 'cubicOut',
      color: [theme.blue, theme.orange],
      grid: { left: 58, right: 24, top: 24, bottom: 36, containLabel: true },
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: (params: any[]) => {
          const row = rows[params[0]?.dataIndex];
          if (!row) return '';
          const gap = row.actual_volume_t - row.target_volume_t;
          return `${row.month}<br/>实际出口量：${formatNumber(row.actual_volume_t, 0)} 吨<br/>目标出口量：${formatNumber(row.target_volume_t, 0)} 吨<br/>差额：${gap >= 0 ? '+' : ''}${formatNumber(gap, 0)} 吨<br/>目标达成：${row.actual_growth_met ? '已达成' : '未达成'}`;
        },
      },
      legend: { top: 0, textStyle: { color: theme.text, fontSize: 12 } },
      xAxis: { type: 'category', data: rows.map((row) => row.label), axisLabel: { color: theme.text, fontSize: 12 }, axisLine: { lineStyle: { color: theme.grid } } },
      yAxis: { type: 'value', name: '吨', nameTextStyle: { color: theme.text, fontSize: 12 }, axisLabel: { color: theme.text, fontSize: 12 }, splitLine: { lineStyle: { color: theme.grid } } },
      series: [
        { name: '实际出口量', type: 'bar', data: actual, barWidth: '42%', itemStyle: { color: theme.blue, borderRadius: [4, 4, 0, 0] } },
        { name: '年度目标分解', type: 'line', data: target, smooth: true, symbol: 'circle', symbolSize: 7, lineStyle: { color: theme.orange, type: 'dashed', width: 2 }, itemStyle: { color: theme.orange, borderColor: theme.card, borderWidth: 2 } },
      ],
    }, true);
    const resize = () => chart.resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(chartRef.current);
    window.addEventListener('resize', resize);
    const frame = window.requestAnimationFrame(resize);
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', resize); chart.dispose(); };
  }, [snapshot, themeKey]);

  useGSAP(() => {
    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      timeline.fromTo('.business-output-heading', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: .28 })
        .fromTo('.business-output-chart', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .45 }, '-=.12')
        .fromTo('.business-output-month', { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: .24, stagger: .035 }, '-=.22');
      return () => timeline.kill();
    }, motionRef);
    return () => motion.revert();
  }, { scope: motionRef, dependencies: [expandedMonth, timelineEvents.length], revertOnUpdate: true });

  const totalVolume = snapshot.summary.total_volume_t;
  const targetVolume = snapshot.monthly.reduce((sum, row) => sum + row.target_volume_t, 0);
  const achievedMonths = snapshot.monthly.filter((row) => row.actual_growth_met).length;

  return <section ref={motionRef} className="business-output-policy-panel" aria-label="年度出口目标与政策事件时间线">
    <div className="business-output-heading">
      <div><span className="business-output-kicker">BUSINESS PULSE · 2025</span><h2>出口规模与政策事件</h2></div>
      <span>实际出货与同月政策变化共用 2025 年 1—12 月轴</span>
    </div>
    <article className="business-output-chart-card business-output-chart">
      <div className="business-output-chart-title"><strong>月度出口量与年度目标分解</strong><span>目标由 2024 年月度结算结构提取，实际与目标严格分列</span></div>
      <div ref={chartRef} className="business-output-chart-canvas" />
      <div className="business-output-footnote">2024 年基准：{snapshot.prior_year_summary ? `${formatNumber(snapshot.prior_year_summary.total_volume_t / 10000, 2)} 万吨` : '未接入'} · 2025 年实际：{formatNumber(totalVolume / 10000, 2)} 万吨 · 年度目标：{formatNumber(targetVolume / 10000, 2)} 万吨 · 目标达成 {achievedMonths}/12 个月</div>
    </article>
    <article className="business-policy-timeline">
      <div className="business-policy-heading"><div><strong>政策事件时间线</strong><span>按月份展开 2025 年可核验的贸易救济 / 政策事件</span></div><small>{timelineEvents.length} 条已匹配事件 · 来源链接可追溯</small></div>
      <div className="business-output-months" role="list" aria-label="2025年月度政策事件">
        {monthKeys.map((month) => {
          const events = eventsByMonth.get(month) || [];
          const expanded = expandedMonth === month;
          return <div className={`business-output-month ${expanded ? 'is-expanded' : ''} ${events.length ? 'has-events' : 'is-empty'}`} key={month} role="listitem">
            <button type="button" onClick={() => setExpandedMonth((current) => current === month ? null : month)} aria-expanded={expanded} aria-controls={`business-policy-${month}`}>
              <span className="business-output-month-dot" aria-hidden="true" /><strong>{month.slice(0, 4)}年{Number(month.slice(5))}月</strong><b>{events.length} 条</b><small>{events.length ? `最高影响 ${Math.max(...events.map((event) => event.severity))}/10` : '暂无已匹配事件'}</small><i aria-hidden="true">{expanded ? '−' : '+'}</i>
            </button>
          </div>;
        })}
      </div>
      {expandedMonth && <div className="business-policy-detail" id={`business-policy-${expandedMonth}`}>
        <div className="business-policy-detail-heading"><strong>{expandedMonth.slice(0, 4)}年{Number(expandedMonth.slice(5))}月事件明细</strong><button type="button" onClick={() => setExpandedMonth(null)}>收起</button></div>
        {expandedEvents.length ? <div className="business-policy-events">{expandedEvents.map((event) => <article className={`business-policy-event ${event.severity >= 8 ? 'is-critical' : ''}`} key={event.id}><div><span>{event.type}</span><strong>{event.title}</strong><small>{event.region} · {event.date} · {event.sourceLabel}</small></div><p>{event.summary}</p>{event.sourceUrl && <a href={event.sourceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}</article>)}</div> : <p className="business-policy-empty">该月暂无具备日期和来源的可核验事件。</p>}
      </div>}
    </article>
  </section>;
}

const remedyMapNames: Record<string, string> = {
  美国: 'United States', 欧盟: 'European Union', 澳大利亚: 'Australia', 加拿大: 'Canada', 印度: 'India', 巴西: 'Brazil', 墨西哥: 'Mexico', 南非: 'South Africa',
  印度尼西亚: 'Indonesia', 泰国: 'Thailand', 马来西亚: 'Malaysia', 阿根廷: 'Argentina', 土耳其: 'Turkey', 哥伦比亚: 'Colombia', 埃及: 'Egypt', 中国台湾地区: 'Taiwan',
  乌克兰: 'Ukraine', 智利: 'Chile', 越南: 'Vietnam', 欧亚经济联盟: 'Eurasian Economic Union', 韩国: 'Korea', 巴基斯坦: 'Pakistan', 新西兰: 'New Zealand', 俄罗斯: 'Russia',
  秘鲁: 'Peru', 日本: 'Japan', 菲律宾: 'Philippines', 海湾合作委员会: 'Gulf Cooperation Council', 以色列: 'Israel', 摩洛哥: 'Morocco', 危地马拉: 'Guatemala',
  委内瑞拉: 'Venezuela', 捷克: 'Czech Rep.', 保加利亚: 'Bulgaria', 多米尼加: 'Dominican Rep.', 英国: 'United Kingdom', 俄白哈关税同盟: 'Russia', 匈牙利: 'Hungary',
  哥斯达黎加: 'Costa Rica', 沙特阿拉伯: 'Saudi Arabia', 波兰: 'Poland', 突尼斯: 'Tunisia', 约旦: 'Jordan', 赞比亚: 'Zambia', 阿联酋: 'United Arab Emirates',
};
const remedyOpportunityNames: Record<string, string> = {
  欧盟: 'European Union', 欧亚经济联盟: 'Eurasian Economic Union', 海湾合作委员会: 'Gulf Cooperation Council', 俄白哈关税同盟: 'Russia-Belarus-Kazakhstan Customs Union',
};
const remedySpecialPoints: Record<string, [number, number]> = { 欧盟: [4.5, 50.8], 欧亚经济联盟: [45, 55], 海湾合作委员会: [47, 25], 中国台湾地区: [121, 23.7], 俄白哈关税同盟: [48, 54] };
const nonSingleRemedyOrigins = new Set(['欧盟', '欧亚经济联盟', '海湾合作委员会', '俄白哈关税同盟']);
type RemedyOriginFilter = 'all' | 'single' | 'non-single';
type ObjectivePanelMode = 'partners' | 'export-trend' | 'quota' | 'overseas-market';

const objectivePanelModes: Array<[ObjectivePanelMode, string]> = [
  ['partners', '贸易伙伴'],
  ['export-trend', '出口规模趋势'],
  ['quota', '欧盟配额&关税'],
  ['overseas-market', '海外市场行情'],
];

type OpportunityRule = 'quota' | 'remedy' | 'standard' | 'partial' | 'none';
type RemedyAggregateRow = TradeRemedySnapshot['aggregates']['country'][number];

interface OpportunityQuotaInfo {
  codeCount: number;
  initialAmount: number;
  balance: number;
  remainingPct: number | null;
  critical: boolean;
  sourceLabel: string;
}

interface OpportunityAssessment {
  worldName: string;
  label: string;
  rule: OpportunityRule;
  status: string;
  score: number | null;
  scoreKind: 'full' | 'market-reference' | null;
  historyScore: number | null;
  externalQty: number | null;
  internalQty: number | null;
  remedy: RemedyAggregateRow | null;
  quota: OpportunityQuotaInfo | null;
  missingItems: string[];
  dataScope: string;
  coordinate?: [number, number];
  detail: string;
}

const opportunityWorldAliases: Record<string, string> = {
  欧盟: 'European Union', 英国: 'United Kingdom', 美国: 'United States', 加拿大: 'Canada', 澳大利亚: 'Australia', 印度: 'India',
  巴西: 'Brazil', 墨西哥: 'Mexico', 南非: 'South Africa', 印度尼西亚: 'Indonesia', 泰国: 'Thailand', 马来西亚: 'Malaysia',
  阿根廷: 'Argentina', 土耳其: 'Turkey', 哥伦比亚: 'Colombia', 埃及: 'Egypt', 中国台湾: 'Taiwan', 中国台湾地区: 'Taiwan',
  中国香港: 'Hong Kong', 中国澳门: 'Macao', 乌克兰: 'Ukraine', 智利: 'Chile', 越南: 'Vietnam', 韩国: 'Korea', 巴基斯坦: 'Pakistan',
  新西兰: 'New Zealand', 俄罗斯: 'Russia', 秘鲁: 'Peru', 日本: 'Japan', 菲律宾: 'Philippines', 以色列: 'Israel', 摩洛哥: 'Morocco',
  危地马拉: 'Guatemala', 危地马拉共和国: 'Guatemala', 委内瑞拉: 'Venezuela', 捷克: 'Czech Rep.', 保加利亚: 'Bulgaria',
  多米尼加: 'Dominican Rep.', 多米尼加共和国: 'Dominican Rep.', 匈牙利: 'Hungary', 哥斯达黎加: 'Costa Rica', 沙特阿拉伯: 'Saudi Arabia',
  波兰: 'Poland', 突尼斯: 'Tunisia', 约旦: 'Jordan', 赞比亚: 'Zambia', 阿联酋: 'United Arab Emirates', 孟加拉: 'Bangladesh',
  孟加拉国: 'Bangladesh', 塞尔维亚共和国: 'Serbia', 塞尔维亚: 'Serbia', 乌兹别克: 'Uzbekistan', 乌兹别克斯坦: 'Uzbekistan',
  科特迪瓦共和国: "Côte d'Ivoire", 科特迪瓦: "Côte d'Ivoire", 坦桑尼亚: 'Tanzania', 肯尼亚: 'Kenya', 阿尔巴尼亚: 'Albania',
  葡萄牙: 'Portugal', 西班牙: 'Spain', 德国: 'Germany', 法国: 'France', 意大利: 'Italy', 比利时: 'Belgium', 希腊: 'Greece',
  瑞士: 'Switzerland', 阿尔及利亚: 'Algeria', 阿曼: 'Oman', 科威特: 'Kuwait', 卡塔尔: 'Qatar', 新加坡: 'Singapore',
  巴拿马: 'Panama', 玻利维亚: 'Bolivia', 乌拉圭: 'Uruguay', 黎巴嫩: 'Lebanon', 加纳: 'Ghana', 莫桑比克: 'Mozambique',
  吉布提: 'Djibouti', 洪都拉斯: 'Honduras', 塞内加尔: 'Senegal', 伊拉克: 'Iraq', 巴拉圭: 'Paraguay', 厄瓜多尔: 'Ecuador',
  喀麦隆: 'Cameroon', 埃塞俄比亚: 'Ethiopia', 斯洛文尼亚: 'Slovenia', 布基纳法索: 'Burkina Faso', 萨尔瓦多: 'El Salvador',
  贝宁: 'Benin', 北马其顿: 'Macedonia', 俄罗斯联邦: 'Russia',
};

const opportunityWorldChinese: Record<string, string> = {
  'United States': '美国', Canada: '加拿大', Australia: '澳大利亚', India: '印度', Brazil: '巴西', Mexico: '墨西哥',
  'South Africa': '南非', Indonesia: '印度尼西亚', Thailand: '泰国', Malaysia: '马来西亚', Argentina: '阿根廷', Turkey: '土耳其',
  Colombia: '哥伦比亚', Egypt: '埃及', Taiwan: '中国台湾', Ukraine: '乌克兰', Chile: '智利', Vietnam: '越南', Korea: '韩国',
  Pakistan: '巴基斯坦', 'New Zealand': '新西兰', Russia: '俄罗斯', Peru: '秘鲁', Japan: '日本', Philippines: '菲律宾', Israel: '以色列',
  Morocco: '摩洛哥', Guatemala: '危地马拉', Venezuela: '委内瑞拉', 'Czech Rep.': '捷克', Bulgaria: '保加利亚', 'Dominican Rep.': '多米尼加共和国',
  'United Kingdom': '英国', Hungary: '匈牙利', 'Costa Rica': '哥斯达黎加', 'Saudi Arabia': '沙特阿拉伯', Poland: '波兰', Tunisia: '突尼斯',
  Jordan: '约旦', Zambia: '赞比亚', 'United Arab Emirates': '阿联酋', Bangladesh: '孟加拉国', Serbia: '塞尔维亚', Uzbekistan: '乌兹别克斯坦',
  "Côte d'Ivoire": '科特迪瓦', Tanzania: '坦桑尼亚', Kenya: '肯尼亚', Albania: '阿尔巴尼亚', Portugal: '葡萄牙', Spain: '西班牙',
  Germany: '德国', France: '法国', Italy: '意大利', Belgium: '比利时', Greece: '希腊', Switzerland: '瑞士', Algeria: '阿尔及利亚',
  Oman: '阿曼', Kuwait: '科威特', Qatar: '卡塔尔', Singapore: '新加坡', Panama: '巴拿马', Bolivia: '玻利维亚', Uruguay: '乌拉圭',
  Lebanon: '黎巴嫩', Ghana: '加纳', Mozambique: '莫桑比克', Djibouti: '吉布提', Honduras: '洪都拉斯', Senegal: '塞内加尔', Iraq: '伊拉克',
  'European Union': '欧盟', 'Hong Kong': '中国香港', Macao: '中国澳门', China: '中国', 'Eurasian Economic Union': '欧亚经济联盟', 'Gulf Cooperation Council': '海湾合作委员会', 'Russia-Belarus-Kazakhstan Customs Union': '俄白哈关税同盟', Paraguay: '巴拉圭', Ecuador: '厄瓜多尔',
  Cameroon: '喀麦隆', Ethiopia: '埃塞俄比亚', Slovenia: '斯洛文尼亚', 'Burkina Faso': '布基纳法索', 'El Salvador': '萨尔瓦多', Benin: '贝宁', Macedonia: '北马其顿',
};

const opportunitySpecialCoordinates: Record<string, [number, number]> = {
  'European Union': [4.5, 50.8], 'United Kingdom': [-2.2, 54.5], 'Eurasian Economic Union': [45, 55], 'Gulf Cooperation Council': [47, 25], 'Russia-Belarus-Kazakhstan Customs Union': [48, 54], Taiwan: [120.5, 23.7], 'Hong Kong': [114.2, 22.3], Macao: [113.5, 22.2],
};

const euMemberWorldNames = new Set([
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Rep.', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece',
  'Hungary', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia',
  'Slovenia', 'Spain', 'Sweden',
]);

function opportunityRuleLabel(rule: OpportunityRule) {
  return rule === 'quota' ? '配额型规则' : rule === 'remedy' ? '贸易救济型规则' : rule === 'standard' ? '常规市场型规则' : rule === 'partial' ? '部分数据规则' : '暂无数据';
}

function opportunityRuleFormula(rule: OpportunityRule) {
  if (rule === 'quota') return '30% × 配额可用度 + 50% × 贸易救济安全度 + 20% × 历史出口基础；有执行中措施时最高 20 分';
  if (rule === 'remedy') return '60% × 贸易救济安全度 + 40% × 历史出口基础；有执行中措施时最高 20 分';
  if (rule === 'standard') return '有历史出口但未完成案件/HS匹配；不输出综合分，仅保留市场级事实待核验';
  if (rule === 'partial') return '不生成可比综合分；仅展示已接入的历史出口、贸易救济或配额事实';
  return '暂无可用输入数据，不进行评分';
}

function opportunityPercentile(values: number[], percentile: number) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile))] || 1;
}

function opportunityHistoryScore(externalQty: number | null, internalQty: number | null, externalP95: number, internalP95: number) {
  const parts: Array<[number, number]> = [];
  if (externalQty != null && externalQty > 0) parts.push([Math.min(100, Math.log1p(externalQty) / Math.log1p(externalP95) * 100), 0.6]);
  if (internalQty != null && internalQty > 0) parts.push([Math.min(100, Math.log1p(internalQty) / Math.log1p(internalP95) * 100), 0.4]);
  if (!parts.length) return null;
  const weight = parts.reduce((sum, [, partWeight]) => sum + partWeight, 0);
  return parts.reduce((sum, [score, partWeight]) => sum + score * partWeight, 0) / weight;
}

function opportunityRemedySafety(remedy: RemedyAggregateRow | null, maxRate: number | null) {
  if (!remedy) return { score: null, status: '未匹配到该市场案件，不能据此确认安全' };
  if (remedy.measures_in_force > 0) return { score: maxRate != null && maxRate >= 20 ? 5 : 12, status: `执行中措施 ${remedy.measures_in_force} 件` };
  if (remedy.investigating > 0) return { score: 45, status: `调查中 ${remedy.investigating} 件` };
  return { score: 78, status: `历史案件 ${remedy.case_count} 件，当前无执行中措施` };
}

function buildOpportunityAssessments(
  worldNames: string[],
  steelExport: SteelExportSnapshot | null,
  internalBusiness: InternalBusinessSnapshot | null,
  taricQuota: TaricQuotaSnapshot | null,
  tradeRemedy: TradeRemedySnapshot | null,
) {
  const exportRows = steelExport?.partner || [];
  const exportByWorld = new Map<string, number>();
  const coordinateByWorld = new Map<string, [number, number]>();
  const sourceLabelByWorld = new Map<string, string>();
  exportRows.forEach((row) => {
    const worldName = row.world || opportunityWorldAliases[row.label] || (row.name ? opportunityWorldAliases[row.name] : undefined);
    if (!worldName) return;
    exportByWorld.set(worldName, (exportByWorld.get(worldName) || 0) + Math.max(0, row.qty_t));
    sourceLabelByWorld.set(worldName, sourceLabelByWorld.get(worldName) || row.label);
    if (row.special) coordinateByWorld.set(worldName, [row.special.lng, row.special.lat]);
  });
  const euExportQty = exportRows.filter((row) => row.world && euMemberWorldNames.has(row.world)).reduce((sum, row) => sum + Math.max(0, row.qty_t), 0);
  if (euExportQty > 0 && !exportByWorld.has('European Union')) exportByWorld.set('European Union', euExportQty);

  const internalByWorld = new Map<string, number>();
  internalBusiness?.by_destination.forEach((row) => {
    const worldName = opportunityWorldAliases[row.label] || exportRows.find((item) => item.label === row.label)?.world;
    if (!worldName) return;
    internalByWorld.set(worldName, (internalByWorld.get(worldName) || 0) + Math.max(0, row.volume_t));
    sourceLabelByWorld.set(worldName, sourceLabelByWorld.get(worldName) || row.label);
  });

  const remedyByWorld = new Map<string, RemedyAggregateRow>();
  tradeRemedy?.aggregates.country.forEach((row) => {
    const worldName = remedyOpportunityNames[row.name] || remedyMapNames[row.name] || opportunityWorldAliases[row.name];
    if (!worldName) return;
    const previous = remedyByWorld.get(worldName);
    if (!previous || row.measures_in_force > previous.measures_in_force || row.case_count > previous.case_count) remedyByWorld.set(worldName, row);
    sourceLabelByWorld.set(worldName, sourceLabelByWorld.get(worldName) || row.name);
  });

  const maxRateByWorld = new Map<string, number>();
  tradeRemedy?.cases.forEach((item) => {
    const worldName = remedyOpportunityNames[item.country] || remedyMapNames[item.country] || opportunityWorldAliases[item.country];
    if (!worldName || item.final_rate_pct == null) return;
    maxRateByWorld.set(worldName, Math.max(maxRateByWorld.get(worldName) || 0, item.final_rate_pct));
  });

  const quotaByWorld = new Map<string, OpportunityQuotaInfo>();
  const euRows = taricQuota?.eu?.rows || [];
  const euChinaRows = euRows.filter((row) => /China|ERGA OMNES/i.test(row.origin));
  const euApplicableRows = euChinaRows.length ? euChinaRows : euRows.filter((row) => /ERGA OMNES/i.test(row.origin));
  const euInitial = euApplicableRows.reduce((sum, row) => sum + Math.max(0, row.initial_amount_t || 0), 0);
  const euBalance = euApplicableRows.reduce((sum, row) => sum + Math.max(0, row.balance_t || 0), 0);
  if (euApplicableRows.length) quotaByWorld.set('European Union', { codeCount: euApplicableRows.length, initialAmount: euInitial, balance: euBalance, remainingPct: euInitial ? euBalance / euInitial * 100 : taricQuota?.eu?.summary.remaining_pct ?? null, critical: euApplicableRows.some((row) => row.critical), sourceLabel: 'EU 配额（中国/ERGA OMNES适用池）' });
  if (taricQuota?.uk) quotaByWorld.set('United Kingdom', { codeCount: taricQuota.uk.summary.record_count, initialAmount: taricQuota.uk.summary.opening_balance_t, balance: taricQuota.uk.summary.balance_t, remainingPct: taricQuota.uk.summary.remaining_pct, critical: false, sourceLabel: 'UK 配额（非欧盟成员国池）' });

  const externalP95 = opportunityPercentile([...exportByWorld.values()], 0.95);
  const internalP95 = opportunityPercentile([...internalByWorld.values()], 0.95);
  const candidates = [...new Set([...worldNames, ...exportByWorld.keys(), ...internalByWorld.keys(), ...remedyByWorld.keys(), ...quotaByWorld.keys()])];
  return candidates.map((worldName): OpportunityAssessment => {
    const externalQty = exportByWorld.get(worldName) ?? null;
    const internalQty = internalByWorld.get(worldName) ?? null;
    const historyScore = opportunityHistoryScore(externalQty, internalQty, externalP95, internalP95);
    // 欧盟案件与配额属于区域主体，不复制到成员国；成员国只保留自身出口事实，避免共享配额/案件被重复计算。
    const remedy = remedyByWorld.get(worldName) || null;
    const quota = quotaByWorld.get(worldName) || null;
    const remedySafety = opportunityRemedySafety(remedy, maxRateByWorld.get(worldName) ?? null);
    const hasHistory = historyScore != null;
    const hasRemedyObservation = tradeRemedy != null;
    const isRestricted = Boolean(remedy?.measures_in_force);
    // 只有配额、贸易救济和历史出口都具备时，才输出可比的配额型综合分；
    // 仅有贸易救济与历史出口时，输出“市场级参考分”，明确标记配额缺口。
    const rule: OpportunityRule = quota && remedy && hasHistory ? 'quota' : remedy && hasHistory ? 'remedy' : hasHistory && hasRemedyObservation ? 'standard' : (quota || remedy || hasHistory) ? 'partial' : 'none';
    const rawScore = rule === 'quota' && quota && remedy && hasHistory && remedySafety.score != null
      ? quota.remainingPct == null ? null : 0.3 * quota.remainingPct + 0.5 * remedySafety.score + 0.2 * historyScore
      : rule === 'remedy' && hasHistory && remedySafety.score != null ? 0.6 * remedySafety.score + 0.4 * historyScore : null;
    const score = rawScore == null ? null : Number(Math.min(isRestricted ? 20 : 100, Math.max(0, rawScore)).toFixed(1));
    const scoreKind: OpportunityAssessment['scoreKind'] = score == null ? null : rule === 'quota' ? 'full' : 'market-reference';
    const status = rule === 'none' ? '暂无数据' : isRestricted ? '受贸易救济限制' : scoreKind === 'full' ? '可比评估 · 配额型' : scoreKind === 'market-reference' ? '市场级参考 · 配额数据缺口' : rule === 'standard' ? '有历史出口 · 待案件/配额核验' : rule === 'partial' ? '部分评估 · 数据缺口' : '数据不足 · 不输出综合分';
    const baseLabel = sourceLabelByWorld.get(worldName) || opportunityWorldChinese[worldName] || worldName;
    const label = baseLabel;
    const missingItems = [
      !externalQty ? '海关出口' : '',
      !internalQty ? '内部业务' : '',
      !hasHistory ? '历史出口（海关/内部）' : '',
      !remedy ? (tradeRemedy ? '贸易救济国家/产品/HS匹配' : '贸易救济数据源') : '',
      !quota ? '配额' : '',
    ].filter(Boolean);
    const dataScope = euMemberWorldNames.has(worldName) ? '国家出口事实；欧盟案件/配额不复制到成员国' : worldName === 'European Union' ? '欧盟区域主体汇总；不拆分为成员国独立配额' : '市场级出口、案件与配额匹配；产品/HS级仍需复核';
    const freshness = `海关抓取 ${steelExport?.source.captured_at || steelExport?.source.generated_at || '—'}；内部业务快照 ${internalBusiness?.source.captured_at || '2025-12'}；贸易救济抓取 ${tradeRemedy?.source.captured_at || tradeRemedy?.source.generated_at || '—'}；配额抓取 ${taricQuota?.source.captured_at || '—'}`;
    const scoreText = score == null ? '不输出可比综合分' : scoreKind === 'full' ? `${score} 分（满条件可比）` : `${score} 分（市场级参考）`;
    const compactDetail = `<div class="map-tooltip-title">${label}</div><div class="map-tooltip-status">${status} · ${opportunityRuleLabel(rule)}</div><div class="map-tooltip-grid"><span>评分</span><strong>${scoreText}</strong><span>海关出口</span><strong>${externalQty == null ? '—' : `${formatNumber(externalQty, 0)} 吨`}</strong><span>内部业务</span><strong>${internalQty == null ? '—' : `${formatNumber(internalQty, 0)} 吨`}</strong><span>配额</span><strong>${quota ? `${formatNumber(quota.balance, 0)} 吨 · ${quota.remainingPct == null ? '—' : `${quota.remainingPct.toFixed(1)}%`}` : '未接入'}</strong><span>贸易救济</span><strong>${remedy ? `${remedy.case_count} 件 · 执行中 ${remedy.measures_in_force}` : '未匹配'}</strong></div><div class="map-tooltip-note">缺失：${missingItems.length ? missingItems.join('、') : '无'}<br/>${dataScope}<br/>数据时间：${freshness}</div>`;
    return {
      worldName,
      label,
      rule,
      status,
      score,
      scoreKind,
      historyScore,
      externalQty,
      internalQty,
      remedy,
      quota,
      missingItems,
      dataScope,
      coordinate: coordinateByWorld.get(worldName) || opportunitySpecialCoordinates[worldName],
      detail: compactDetail,
    };
  });
}

function isNonSingleRemedyOrigin(name: string) {
  return nonSingleRemedyOrigins.has(name);
}

function ObjectiveCharts({ quotes, internalBusiness, steelExport, taricQuota, advice, tradeRemedy }: ObjectiveChartsProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const exportTrendRef = useRef<HTMLDivElement>(null);
  const exportRankRef = useRef<HTMLDivElement>(null);
  const quotaTrendRef = useRef<HTMLDivElement>(null);
  const quotaRankRef = useRef<HTMLDivElement>(null);
  const quotaMixRef = useRef<HTMLDivElement>(null);
  const quotaTightnessRef = useRef<HTMLDivElement>(null);
  const quotaUseRef = useRef<HTMLDivElement>(null);
  const ukQuotaRef = useRef<HTMLDivElement>(null);
  const [worldReady, setWorldReady] = useState(false);
  const [worldNames, setWorldNames] = useState<string[]>([]);
  const [mapMode, setMapMode] = useState<'partners' | 'remedy' | 'opportunity'>('partners');
  const [remedyOriginFilter, setRemedyOriginFilter] = useState<RemedyOriginFilter>('all');
  const [panelMode, setPanelMode] = useState<ObjectivePanelMode>('partners');
  const [assessmentRulesOpen, setAssessmentRulesOpen] = useState(false);
  const themeKey = useThemeKey();
  const chartTheme = useMemo(() => chartThemeFromCss(), [themeKey]);
  const opportunityAssessments = useMemo(
    () => buildOpportunityAssessments(worldNames, steelExport, internalBusiness, taricQuota, tradeRemedy),
    [internalBusiness, taricQuota, tradeRemedy, steelExport, worldNames],
  );
  const opportunitySummary = useMemo(() => {
    const fullScoreCount = opportunityAssessments.filter((item) => item.scoreKind === 'full').length;
    const referenceScoreCount = opportunityAssessments.filter((item) => item.scoreKind === 'market-reference').length;
    const restrictedCount = opportunityAssessments.filter((item) => item.status === '受贸易救济限制').length;
    const partialCount = opportunityAssessments.filter((item) => item.score == null && item.rule !== 'none').length;
    const unavailableCount = opportunityAssessments.filter((item) => item.rule === 'none').length;
    return { total: opportunityAssessments.length, fullScoreCount, referenceScoreCount, restrictedCount, partialCount, unavailableCount };
  }, [opportunityAssessments]);

  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}data/world.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`world.json: ${response.status}`);
        return response.json();
      })
      .then((worldData) => {
        if (!active) return;
        echarts.registerMap('trade-world', worldData);
        setWorldNames((worldData.features || []).map((feature: { properties?: { name?: string } }) => feature.properties?.name).filter((name: string | undefined): name is string => Boolean(name)));
        setWorldReady(true);
      })
      .catch(() => {
        if (active) setWorldReady(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !worldReady) return;
    const mapNode = mapRef.current;
    const chart = echarts.getInstanceByDom(mapNode) || echarts.init(mapNode);
    const exportRows = steelExport?.partner || [];
    const allRemedyRows = tradeRemedy?.aggregates.country || [];
    const remedyRows = allRemedyRows.filter((row) => remedyOriginFilter === 'all' || (remedyOriginFilter === 'non-single' ? isNonSingleRemedyOrigin(row.name) : !isNonSingleRemedyOrigin(row.name)));
    const maxExport = Math.max(...exportRows.map((row) => row.qty_t), 1);
    const maxCases = Math.max(...allRemedyRows.map((row) => row.case_count), 1);
    const partnerMap = exportRows.filter((row) => row.world && row.qty_t > 0).map((row) => ({ name: row.world as string, value: row.qty_t, chineseName: row.name, detail: `出口量：${formatNumber(row.qty_t, 0)} 吨<br/>出口额：$${formatNumber(row.amount_usd, 0)}<br/>平均单价：$${formatNumber(row.avg_price_usd_t, 2)}/吨` }));
    const partnerSpecial = exportRows.filter((row) => row.special && row.qty_t > 0).map((row) => ({ name: row.name, value: [row.special?.lng, row.special?.lat, row.qty_t], chineseName: row.name, detail: `出口量：${formatNumber(row.qty_t, 0)} 吨<br/>出口额：$${formatNumber(row.amount_usd, 0)}<br/>平均单价：$${formatNumber(row.avg_price_usd_t, 2)}/吨` }));
    const remedyMap = remedyRows.filter((row) => remedyMapNames[row.name] && !remedySpecialPoints[row.name]).map((row) => ({ name: remedyMapNames[row.name], value: row.case_count, chineseName: row.name, detail: `案件：${row.case_count} 件<br/>反倾销：${row.anti_dumping} · 反补贴：${row.countervailing} · 保障措施：${row.safeguard}<br/>措施执行中：${row.measures_in_force} 件` }));
    const remedySpecial = remedyRows.filter((row) => remedySpecialPoints[row.name]).map((row) => ({ name: row.name, value: [...remedySpecialPoints[row.name], row.case_count], chineseName: row.name, detail: `案件：${row.case_count} 件<br/>反倾销：${row.anti_dumping} · 反补贴：${row.countervailing} · 保障措施：${row.safeguard}<br/>措施执行中：${row.measures_in_force} 件` }));
    const assessmentMap = opportunityAssessments.filter((row) => worldNames.includes(row.worldName)).map((row) => ({ name: row.worldName, value: row.score == null ? -1 : row.score, chineseName: row.label, detail: row.detail, itemStyle: row.status === '受贸易救济限制' ? { areaColor: '#c4514c' } : row.score == null ? { areaColor: chartTheme.muted } : undefined }));
    const assessmentSpecial = opportunityAssessments.filter((row) => row.coordinate).map((row) => ({ name: row.label, value: [row.coordinate![0], row.coordinate![1], row.score == null ? 0 : row.score], chineseName: row.label, detail: row.detail, itemStyle: row.status === '受贸易救济限制' ? { color: '#c4514c' } : row.score == null ? { color: chartTheme.muted } : undefined }));
    const activeMap = mapMode === 'partners' ? partnerMap : mapMode === 'remedy' ? remedyMap : assessmentMap;
    const activeSpecial = mapMode === 'partners' ? partnerSpecial : mapMode === 'remedy' ? remedySpecial : assessmentSpecial;
    const activeMax = mapMode === 'partners' ? maxExport : mapMode === 'remedy' ? maxCases : 100;
    const palette = mapMode === 'partners' ? ['#dcebf5', '#9fc7df', '#4b8fbd', '#1e5e91', '#0b3b68'] : mapMode === 'remedy' ? ['#fff0df', '#eeae61', '#c85b3d', '#8c2538'] : ['#edf0fa', '#a5acd9', '#6875b7', '#333b78'];
    const title = mapMode === 'partners' ? '贸易伙伴世界分布 · 出口量' : mapMode === 'remedy' ? '贸易救济案件世界分布 · 案件数' : '区域出口条件辅助评估 · 综合适配度';
    chart.setOption({
      tooltip: { trigger: 'item', confine: true, className: 'analysis-map-tooltip', formatter: (params: any) => params.data?.detail || `${params.data?.chineseName || opportunityWorldChinese[params.name] || params.name}<br/>${params.value == null ? '暂无数据：尚未匹配到已接入数据源' : `数值：${params.value}`}` },
      visualMap: { show: true, left: 18, bottom: 12, min: mapMode === 'opportunity' ? 0 : 0, max: activeMax, calculable: false, text: mapMode === 'partners' ? ['高出口量', '低出口量'] : mapMode === 'remedy' ? ['高案件数', '低案件数'] : ['高适配度', '低适配度'], textStyle: { color: chartTheme.text, fontSize: 12 }, inRange: { color: palette }, outOfRange: { color: chartTheme.muted } },
      geo: { map: 'trade-world', roam: true, zoom: 1.05, itemStyle: { areaColor: chartTheme.surface, borderColor: chartTheme.grid, borderWidth: 0.7 }, emphasis: { label: { show: false }, itemStyle: { areaColor: chartTheme.orange } } },
      series: [{ name: title, type: 'map', map: 'trade-world', geoIndex: 0, emphasis: { label: { show: false } }, data: activeMap }, { name: '地区明细', type: 'scatter', coordinateSystem: 'geo', symbolSize: (value: number[]) => Math.max(9, Math.min(25, Math.sqrt(Math.max(1, Number(value[2] || value[0])) / Math.max(1, activeMax)) * 26)), itemStyle: { color: mapMode === 'remedy' ? '#bd4f3d' : mapMode === 'opportunity' ? '#525fae' : chartTheme.orange, borderColor: chartTheme.card, borderWidth: 1 }, label: { show: false }, emphasis: { label: { show: false }, itemStyle: { borderColor: chartTheme.text, borderWidth: 2 } }, data: activeSpecial }],
    }, true);
    const resize = () => chart.resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(mapNode);
    window.addEventListener('resize', resize);
    const frame = window.requestAnimationFrame(resize);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [chartTheme, internalBusiness, mapMode, opportunityAssessments, remedyOriginFilter, steelExport, taricQuota, tradeRemedy, worldNames, worldReady]);

  useEffect(() => {
    if (panelMode !== 'quota') return;
    if (!taricQuota || !quotaTrendRef.current || !quotaRankRef.current || !quotaMixRef.current || !quotaTightnessRef.current || !quotaUseRef.current) return;
    const chartTheme = chartThemeFromCss();
    const trend = echarts.getInstanceByDom(quotaTrendRef.current) || echarts.init(quotaTrendRef.current); const rank = echarts.getInstanceByDom(quotaRankRef.current) || echarts.init(quotaRankRef.current); const mix = echarts.getInstanceByDom(quotaMixRef.current) || echarts.init(quotaMixRef.current); const tightness = echarts.getInstanceByDom(quotaTightnessRef.current) || echarts.init(quotaTightnessRef.current); const use = echarts.getInstanceByDom(quotaUseRef.current) || echarts.init(quotaUseRef.current);
    const history = taricQuota.eu?.history || taricQuota.history;
    const latest = taricQuota.eu?.rows || taricQuota.latest.rows;
    const trendLabel = history.map((row) => row.date.slice(5));
    trend.setOption({ color: [chartTheme.blue, chartTheme.orange], grid: { left: 52, right: 18, top: 28, bottom: 34, containLabel: true }, tooltip: { trigger: 'axis', formatter: (params: any) => `${history[params[0]?.dataIndex]?.date}<br/>剩余量：${formatNumber(history[params[0]?.dataIndex]?.balance_t || 0, 0)} 吨<br/>剩余比例：${history[params[0]?.dataIndex]?.remaining_pct?.toFixed(1) ?? '—'}%` }, xAxis: { type: 'category', data: trendLabel, axisLabel: { color: chartTheme.text, fontSize: 12, interval: Math.max(0, Math.ceil(history.length / 8) - 1) } }, yAxis: [{ type: 'value', name: '剩余量（吨）', axisLabel: { color: chartTheme.text, fontSize: 12 }, splitLine: { lineStyle: { color: chartTheme.grid } } }, { type: 'value', name: '剩余比例', axisLabel: { color: chartTheme.text, fontSize: 12, formatter: '{value}%' } }], series: [{ name: '总剩余配额', type: 'line', smooth: true, data: history.map((row) => row.balance_t), areaStyle: { opacity: .08 } }, { name: '剩余比例', type: 'line', yAxisIndex: 1, smooth: true, data: history.map((row) => row.remaining_pct), symbol: 'none' }] });
    const top = [...latest].sort((a, b) => (b.initial_amount_t || 0) - (a.initial_amount_t || 0));
    rank.setOption({ grid: { left: 74, right: 34, top: 18, bottom: 28, containLabel: true }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => { const row = top[params[0]?.dataIndex]; return `${row?.code}<br/>${row?.origin}<br/>初始：${formatNumber(row?.initial_amount_t || 0, 0)} 吨<br/>剩余：${formatNumber(row?.balance_t || 0, 0)} 吨`; } }, xAxis: { type: 'value', name: '初始配额（吨）', axisLabel: { color: chartTheme.text, fontSize: 12 }, splitLine: { lineStyle: { color: chartTheme.grid } } }, yAxis: { type: 'category', inverse: true, data: top.map((row) => row.code), axisLabel: { color: chartTheme.text, fontSize: 12 } }, series: [{ name: '初始配额', type: 'bar', data: top.map((row) => row.initial_amount_t), barWidth: '56%', itemStyle: { color: chartTheme.blue }, label: { show: true, position: 'right', color: chartTheme.text, fontSize: 11, formatter: (params: any) => `${formatNumber(params.value, 0)}` } }] });
    const distribution = [{ name: '已耗尽', value: latest.filter((row) => (row.balance_t || 0) <= 0).length }, { name: '临界且有余额', value: latest.filter((row) => (row.balance_t || 0) > 0 && row.critical).length }, { name: '正常有余额', value: latest.filter((row) => (row.balance_t || 0) > 0 && !row.critical).length }];
    mix.setOption({ color: [chartTheme.green, chartTheme.red, chartTheme.orange], tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 个 Code（{d}%）' }, series: [{ type: 'pie', radius: ['42%', '70%'], center: ['50%', '48%'], label: { color: chartTheme.text, fontSize: 12, formatter: '{b}\n{d}%' }, data: distribution }] });
    const tight = [...latest].filter((row) => row.balance_t != null && row.initial_amount_t).sort((a, b) => ((a.balance_t || 0) / (a.initial_amount_t || 1)) - ((b.balance_t || 0) / (b.initial_amount_t || 1))).slice(0, 10).reverse();
    tightness.setOption({ grid: { left: 74, right: 42, top: 18, bottom: 28, containLabel: true }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => { const row = tight[params[0]?.dataIndex]; return `${row?.code}<br/>剩余比例：${params[0]?.value?.toFixed?.(1) ?? '—'}%<br/>余额：${formatNumber(row?.balance_t || 0, 0)} 吨`; } }, xAxis: { type: 'value', max: 100, axisLabel: { color: chartTheme.text, fontSize: 12, formatter: '{value}%' }, splitLine: { lineStyle: { color: chartTheme.grid } } }, yAxis: { type: 'category', inverse: true, data: tight.map((row) => row.code), axisLabel: { color: chartTheme.text, fontSize: 12 } }, series: [{ name: '剩余比例', type: 'bar', data: tight.map((row) => Number((((row.balance_t || 0) / (row.initial_amount_t || 1)) * 100).toFixed(1))), barWidth: '58%', itemStyle: { color: chartTheme.orange }, label: { show: true, position: 'right', color: chartTheme.text, fontSize: 11, formatter: '{c}%' } }] });
    use.setOption({ grid: { left: 64, right: 26, top: 18, bottom: 28, containLabel: true }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => `${params[0]?.name}<br/>初始：${formatNumber(top[params[0]?.dataIndex]?.initial_amount_t || 0, 0)} 吨<br/>已使用：${formatNumber(params[1]?.value || 0, 0)} 吨<br/>当前余额：${formatNumber(params[2]?.value || 0, 0)} 吨` }, legend: { top: 0, textStyle: { color: chartTheme.text, fontSize: 12 } }, xAxis: { type: 'value', name: '吨', axisLabel: { color: chartTheme.text, fontSize: 12 }, splitLine: { lineStyle: { color: chartTheme.grid } } }, yAxis: { type: 'category', inverse: true, data: top.slice(0, 10).map((row) => row.code), axisLabel: { color: chartTheme.text, fontSize: 12 } }, series: [{ name: '已使用', type: 'bar', stack: 'quota', data: top.slice(0, 10).map((row) => Math.max(0, (row.initial_amount_t || 0) - (row.balance_t || 0))), itemStyle: { color: chartTheme.orange } }, { name: '当前余额', type: 'bar', stack: 'quota', data: top.slice(0, 10).map((row) => Math.max(0, row.balance_t || 0)), itemStyle: { color: chartTheme.blue } }] });
    const resize = () => { trend.resize(); rank.resize(); mix.resize(); tightness.resize(); use.resize(); }; window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); trend.dispose(); rank.dispose(); mix.dispose(); tightness.dispose(); use.dispose(); };
  }, [panelMode, taricQuota, themeKey]);

  useEffect(() => {
    if (panelMode !== 'quota') return;
    if (!taricQuota?.uk || !ukQuotaRef.current) return;
    const chartTheme = chartThemeFromCss(); const chart = echarts.getInstanceByDom(ukQuotaRef.current) || echarts.init(ukQuotaRef.current); const history = taricQuota.uk.history;
    chart.setOption({ color: [chartTheme.blue, chartTheme.orange], grid: { left: 54, right: 50, top: 30, bottom: 34, containLabel: true }, tooltip: { trigger: 'axis', formatter: (params: any) => { const row = history[params[0]?.dataIndex]; return `${row?.date}<br/>当前余额：${formatNumber(row?.balance_t || 0, 0)} 吨<br/>剩余比例：${row?.remaining_pct?.toFixed?.(1) ?? '—'}%`; } }, legend: { top: 0, textStyle: { color: chartTheme.text, fontSize: 12 } }, xAxis: { type: 'category', data: history.map((row) => row.date.slice(5)), axisLabel: { color: chartTheme.text, fontSize: 12, interval: Math.max(0, Math.ceil(history.length / 8) - 1) } }, yAxis: [{ type: 'value', name: '余额（吨）', axisLabel: { color: chartTheme.text, fontSize: 12 }, splitLine: { lineStyle: { color: chartTheme.grid } } }, { type: 'value', name: '剩余比例', min: 0, max: 100, axisLabel: { color: chartTheme.text, fontSize: 12, formatter: '{value}%' }, splitLine: { show: false } }], series: [{ name: '当前余额', type: 'line', smooth: true, data: history.map((row) => row.balance_t), areaStyle: { opacity: .1 } }, { name: '剩余比例', type: 'line', smooth: true, yAxisIndex: 1, data: history.map((row) => row.remaining_pct == null ? null : row.remaining_pct), lineStyle: { type: 'dashed', opacity: .55 }, symbol: 'none' }] });
    const resize = () => chart.resize(); window.addEventListener('resize', resize); return () => { window.removeEventListener('resize', resize); chart.dispose(); };
  }, [panelMode, taricQuota, themeKey]);

  useEffect(() => {
    if (!steelExport) return;
    const exportTheme = chartThemeFromCss();
    const exportView = steelExport.default_view;
    const charts: echarts.ECharts[] = [];
    const nodes: HTMLDivElement[] = [];
    if (panelMode === 'export-trend' && exportTrendRef.current) {
      const node = exportTrendRef.current;
      const chart = echarts.getInstanceByDom(node) || echarts.init(node);
      const months = exportView.monthly;
      chart.setOption({ color: [exportTheme.blue, exportTheme.orange], grid: { left: 54, right: 20, top: 24, bottom: 38, containLabel: true }, tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0]?.axisValue}<br/>出口量：${formatNumber(months[params[0]?.dataIndex]?.qty_t || 0, 0)} 吨<br/>出口均价：$${formatNumber(months[params[0]?.dataIndex]?.avg_price_usd_t || 0, 2)}/吨` }, legend: { top: 0, textStyle: { color: exportTheme.text, fontSize: 13 } }, xAxis: { type: 'category', data: months.map((row) => row.label), axisLabel: { color: exportTheme.text, fontSize: 12, rotate: months.length > 12 ? 35 : 0, hideOverlap: true } }, yAxis: [{ type: 'value', name: '出口量（吨）', axisLabel: { color: exportTheme.text, fontSize: 12 }, splitLine: { lineStyle: { color: exportTheme.grid } } }, { type: 'value', name: '美元/吨', axisLabel: { color: exportTheme.text, fontSize: 12 }, splitLine: { show: false } }], series: [{ name: '出口量', type: 'bar', data: months.map((row) => row.qty_t), barMaxWidth: 24 }, { name: '出口均价', type: 'line', yAxisIndex: 1, data: months.map((row) => row.avg_price_usd_t), smooth: true, symbol: 'none' }] }, true);
      charts.push(chart); nodes.push(node);
    }
    if (panelMode === 'partners' && exportRankRef.current) {
      const node = exportRankRef.current;
      const chart = echarts.getInstanceByDom(node) || echarts.init(node);
      const top = exportView.partner.slice(0, 10).reverse();
      chart.setOption({ grid: { left: 72, right: 26, top: 16, bottom: 28, containLabel: true }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => `${params[0]?.name}<br/>出口量：${formatNumber(params[0]?.value || 0, 0)} 吨<br/>均价：$${formatNumber(top[params[0]?.dataIndex]?.avg_price_usd_t || 0, 2)}/吨` }, xAxis: { type: 'value', axisLabel: { color: exportTheme.text, fontSize: 12 }, splitLine: { lineStyle: { color: exportTheme.grid } } }, yAxis: { type: 'category', data: top.map((row) => row.label), axisLabel: { color: exportTheme.text, fontSize: 12 } }, series: [{ type: 'bar', data: top.map((row) => row.qty_t), barMaxWidth: 20, itemStyle: { color: exportTheme.blue }, label: { show: true, position: 'right', color: exportTheme.text, fontSize: 11, formatter: (params: any) => `${formatNumber(params.value / 10000, 1)} 万吨` } }] }, true);
      charts.push(chart); nodes.push(node);
    }
    if (!charts.length) return;
    const resize = () => charts.forEach((chart) => chart.resize());
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    nodes.forEach((node) => observer?.observe(node));
    window.addEventListener('resize', resize);
    const frame = window.requestAnimationFrame(resize);
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', resize); charts.forEach((chart) => chart.dispose()); };
  }, [panelMode, steelExport, themeKey]);

  useEffect(() => {
    if (panelMode !== 'overseas-market' || !trendRef.current) return;
    const node = trendRef.current;
    const chart = echarts.getInstanceByDom(node) || echarts.init(node);
    const trendDates = [...new Set(quotes.map((quote) => quote.date.slice(0, 10)))].sort();
    const trendCodes = [...new Set(quotes.map((quote) => quote.indicator_code))]
      .sort((a, b) => quotes.filter((quote) => quote.indicator_code === b).length - quotes.filter((quote) => quote.indicator_code === a).length)
      .slice(0, 4);
    const trendSeries = trendCodes.map((code) => {
      const codeQuotes = quotes.filter((quote) => quote.indicator_code === code);
      const firstValue = codeQuotes.find((quote) => quote.value > 0)?.value || 1;
      const seriesQuotes = new Map(codeQuotes.map((quote) => [quote.date.slice(0, 10), Number((quote.value / firstValue * 100).toFixed(1))]));
      return { name: indicatorShortChinese[code] || indicatorChinese[code] || humanizeDisplay(code), type: 'line' as const, smooth: true, showSymbol: false, data: trendDates.map((date) => seriesQuotes.get(date) ?? null) };
    });
    const text = chartTheme.text;
    chart.setOption({
      color: [chartTheme.blue, chartTheme.lightBlue, chartTheme.orange, chartTheme.green],
      grid: { left: 48, right: 18, top: 48, bottom: 38, containLabel: true },
      tooltip: { trigger: 'axis', confine: true, formatter: (params: any[]) => params.map((item) => `${indicatorChinese[item.seriesName] || item.seriesName}：${item.value == null ? '—' : item.value}`).join('<br/>') },
      legend: { top: 4, type: 'scroll', itemWidth: 10, itemHeight: 8, textStyle: { color: text, fontSize: 11 }, pageTextStyle: { color: text } },
      xAxis: { type: 'category', data: trendDates, axisLabel: { color: text, fontSize: 11, interval: Math.max(0, Math.ceil(trendDates.length / 6) - 1), hideOverlap: true }, axisLine: { lineStyle: { color: chartTheme.grid } } },
      yAxis: { type: 'value', name: '指数（首个观测=100）', nameTextStyle: { color: text, fontSize: 11 }, axisLabel: { color: text, fontSize: 11 }, splitLine: { lineStyle: { color: chartTheme.grid } } },
      series: trendSeries,
    }, true);
    const resize = () => chart.resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(node);
    window.addEventListener('resize', resize);
    const frame = window.requestAnimationFrame(resize);
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', resize); chart.dispose(); };
  }, [chartTheme, panelMode, quotes, themeKey]);

  return (
    <div className="objective-charts" aria-label="客观信息图表">
      <article className="objective-chart-card map-card export-map-card"><div className="objective-chart-heading"><div><strong>{mapMode === 'partners' ? '贸易伙伴世界分布' : mapMode === 'remedy' ? '出口贸易救济案件分布' : '区域出口条件辅助评估'}</strong><small>{mapMode === 'partners' ? 'Trade partners · 中国海关钢材出口量' : mapMode === 'remedy' ? `Trade remedies · ${tradeRemedy?.summary.total_cases || 0} 条全量钢材案件` : '全球分层评估 · 满条件可比分与数据缺口分开表达'}</small></div><div className="map-mode-switch" role="tablist" aria-label="地图分析视图">{([['partners', '贸易伙伴'], ['remedy', '贸易救济'], ['opportunity', '出口条件评估']] as const).map(([mode, label]) => <button key={mode} type="button" className={mapMode === mode ? 'is-active' : ''} onClick={() => setMapMode(mode)} role="tab" aria-selected={mapMode === mode}>{label}</button>)}</div></div><div className="map-toolbar"><span>{mapMode === 'partners' ? `海关出口快照 · ${steelExport ? `${steelExport.default_view.filter.year}年${steelExport.default_view.filter.kind}` : '待接入'}` : mapMode === 'remedy' ? `源站更新 ${tradeRemedy?.source.generated_at || '—'} · ${remedyOriginFilter === 'all' ? tradeRemedy?.summary.total_cases || 0 : tradeRemedy?.cases.filter((item) => remedyOriginFilter === 'non-single' ? isNonSingleRemedyOrigin(item.country) : !isNonSingleRemedyOrigin(item.country)).length || 0} 条案件` : `全球 ${opportunitySummary.total} 个地区 · 满条件可比 ${opportunitySummary.fullScoreCount} · 市场级参考 ${opportunitySummary.referenceScoreCount} · 受限 ${opportunitySummary.restrictedCount} · 部分数据 ${opportunitySummary.partialCount} · 暂无数据 ${opportunitySummary.unavailableCount}`}<span className="map-zoom-note">支持缩放 / 拖拽 / 悬停查看明细</span></span>{mapMode === 'opportunity' && <button type="button" className="opportunity-rule-toggle" aria-expanded={assessmentRulesOpen} onClick={() => setAssessmentRulesOpen((current) => !current)}>{assessmentRulesOpen ? '收起评估规则' : '展开评估规则'}</button>}{mapMode === 'remedy' && <div className="remedy-origin-switch" role="group" aria-label="贸易救济发起方筛选">{([['all', '全部发起方'], ['single', '单一国家/地区'], ['non-single', '非单一国家/区域组织']] as const).map(([filter, label]) => <button key={filter} type="button" className={remedyOriginFilter === filter ? 'is-active' : ''} onClick={() => setRemedyOriginFilter(filter)}>{label}</button>)}</div>}</div>{mapMode === 'opportunity' && assessmentRulesOpen && <div className="opportunity-rule-panel" aria-label="出口条件评估规则"><div><strong>满条件配额型</strong><span>当前用于 EU / UK 等已接入配额池且同时匹配案件、历史出口的地区：{opportunityRuleFormula('quota')}。</span></div><div><strong>市场级贸易救济参考</strong><span>有案件且有历史出口、但配额尚未接入时：{opportunityRuleFormula('remedy')}；仅作市场级参考，不与满条件分直接横比。</span></div><div><strong>常规市场型</strong><span>有历史出口但未完成国家 / 产品 / HS 案件匹配：{opportunityRuleFormula('standard')}。</span></div><div><strong>部分 / 缺口型</strong><span>仅有配额、案件或单一出口记录时不生成可比综合分；地图保留该地区并标出缺失项，没有数据不等于安全。</span></div><div className="opportunity-status-legend" aria-label="地图状态图例"><span className="is-score">满条件可比</span><span className="is-reference">市场级参考</span><span className="is-restricted">执行中贸易救济</span><span className="is-missing">部分 / 暂无数据</span></div></div>}<div className="objective-map-wrap"><div ref={mapRef} className="objective-chart map-main-chart" />{!worldReady && <div className="map-status">地图资源加载失败</div>}{mapMode === 'partners' && !steelExport && <div className="map-data-note">出口快照未接入，当前仅展示底图</div>}{mapMode === 'remedy' && !tradeRemedy && <div className="map-data-note">贸易救济快照未接入，无法绘制案件分布</div>}{mapMode === 'remedy' && tradeRemedy && remedyOriginFilter === 'non-single' && !tradeRemedy.cases.some((item) => isNonSingleRemedyOrigin(item.country)) && <div className="map-data-note">当前快照没有匹配的区域组织发起案件</div>}{mapMode === 'opportunity' && (!tradeRemedy || !steelExport || !internalBusiness) && <div className="map-data-note">出口条件评估基于已接入数据；当前缺少部分来源时，地图保留全球地区并标注数据缺口</div>}</div>{mapMode === 'partners' && advice.find((item) => item.id === 'export-market') && <DataAdviceCard advice={advice.find((item) => item.id === 'export-market')} compact />}</article>
      <aside className="objective-linked-panel" aria-label="客观信息联动面板">
        <div className="objective-linked-header">
          <div><span className="objective-panel-eyebrow">联动视图</span><strong>{objectivePanelModes.find(([mode]) => mode === panelMode)?.[1]}</strong></div>
          <span className="objective-panel-meta">按需查看</span>
        </div>
        <div className="objective-panel-tabs" role="tablist" aria-label="客观信息联动模式">
          {objectivePanelModes.map(([mode, label]) => <button key={mode} type="button" role="tab" aria-selected={panelMode === mode} aria-controls={`objective-panel-${mode}`} className={panelMode === mode ? 'is-active' : ''} onClick={() => setPanelMode(mode)}>{label}</button>)}
        </div>
        <div className="objective-panel-content">
          {panelMode === 'partners' && <div id="objective-panel-partners" className="objective-panel-view" role="tabpanel">
            <div className="objective-panel-kpis">
              <div><span>出口伙伴</span><strong>{steelExport?.summary.partner_count ?? '—'}</strong><small>中国海关钢材出口</small></div>
              <div><span>累计出口量</span><strong>{steelExport ? `${formatNumber(steelExport.summary.total_qty_t / 10000, 1)} 万吨` : '—'}</strong><small>{steelExport?.default_view.filter.year || '当前'}年口径</small></div>
              <div><span>出口集中度</span><strong>{steelExport ? `${steelExport.concentration.cr5_pct.toFixed(1)}%` : '—'}</strong><small>Top 5 伙伴占比</small></div>
            </div>
            {steelExport ? <article className="objective-panel-chart-card"><div className="objective-chart-heading"><strong>主要贸易伙伴排名</strong><small>Top 10 · 累计出口量</small></div><div ref={exportRankRef} className="objective-chart export-chart" /></article> : <div className="objective-panel-empty">暂无出口快照，当前地图仅保留底图。</div>}
          </div>}
          {panelMode === 'export-trend' && <div id="objective-panel-export-trend" className="objective-panel-view" role="tabpanel">
            <div className="objective-panel-kpis">
              <div><span>累计出口量</span><strong>{steelExport ? `${formatNumber(steelExport.summary.total_qty_t / 10000, 1)} 万吨` : '—'}</strong><small>按当前出口快照</small></div>
              <div><span>出口金额</span><strong>{steelExport ? `$${formatNumber(steelExport.summary.total_amount_usd / 100000000, 2)} 亿` : '—'}</strong><small>美元口径</small></div>
              <div><span>加权均价</span><strong>{steelExport ? `$${formatNumber(steelExport.summary.average_price_usd_t, 0)}` : '—'}</strong><small>美元 / 吨</small></div>
            </div>
            {steelExport ? <article className="objective-panel-chart-card"><div className="objective-chart-heading"><strong>出口规模与均价趋势</strong><small>月度出口量 × 加权均价</small></div><div ref={exportTrendRef} className="objective-chart export-chart" /></article> : <div className="objective-panel-empty">暂无出口快照，暂不能绘制趋势。</div>}
          </div>}
          {panelMode === 'quota' && <div id="objective-panel-quota" className="objective-panel-view" role="tabpanel">
            {taricQuota ? <><div className="objective-panel-kpis"><div><span>EU 剩余配额</span><strong>{taricQuota.eu?.summary.remaining_pct == null ? '—' : `${taricQuota.eu.summary.remaining_pct.toFixed(1)}%`}</strong><small>{formatNumber(taricQuota.eu?.summary.balance_t ?? taricQuota.latest.summary.balance_t, 0)} 吨</small></div><div><span>EU Code 数量</span><strong>{taricQuota.eu?.summary.code_count ?? taricQuota.latest.summary.code_count}</strong><small>当前最新快照</small></div><div><span>UK 配额</span><strong>{taricQuota.uk?.summary.remaining_pct == null ? '—' : `${taricQuota.uk.summary.remaining_pct.toFixed(1)}%`}</strong><small>独立来源</small></div></div><article className="objective-panel-chart-card"><div className="objective-chart-heading"><strong>EU 配额余额趋势</strong><small>余额与剩余比例</small></div><div ref={quotaTrendRef} className="objective-chart quota-chart" /></article><div className="objective-panel-chart-grid"><article className="objective-panel-chart-card"><div className="objective-chart-heading"><strong>配额紧张度</strong><small>剩余比例最低</small></div><div ref={quotaTightnessRef} className="objective-chart quota-chart" /></article><article className="objective-panel-chart-card"><div className="objective-chart-heading"><strong>状态构成</strong><small>Code 数量</small></div><div ref={quotaMixRef} className="objective-chart quota-chart" /></article></div><article className="objective-panel-chart-card"><div className="objective-chart-heading"><strong>EU 初始 / 已用 / 余额</strong><small>Top 10</small></div><div ref={quotaUseRef} className="objective-chart quota-chart" /></article><article className="objective-panel-chart-card"><div className="objective-chart-heading"><strong>EU Code 配额规模</strong><small>初始配额排名</small></div><div ref={quotaRankRef} className="objective-chart quota-chart" /></article>{taricQuota.uk && <article className="objective-panel-chart-card"><div className="objective-chart-heading"><strong>UK 关税配额余额趋势</strong><small>独立来源</small></div><div ref={ukQuotaRef} className="objective-chart quota-chart" /></article>}</> : <div className="objective-panel-empty">暂无配额快照，暂不能绘制配额图表。</div>}
          </div>}
          {panelMode === 'overseas-market' && <div id="objective-panel-overseas-market" className="objective-panel-view" role="tabpanel">
            <div className="objective-panel-kpis"><div><span>行情指标</span><strong>{new Set(quotes.map((quote) => quote.indicator_code)).size}</strong><small>{new Set(quotes.map((quote) => quote.source)).size} 个来源</small></div><div><span>最新记录</span><strong>{quotes.length ? formatDate([...quotes].sort((a, b) => b.date.localeCompare(a.date))[0].date) : '—'}</strong><small>按已接入行情快照</small></div><div><span>覆盖区域</span><strong>{new Set(quotes.map((quote) => quote.region).filter(Boolean)).size || '—'}</strong><small>行情区域口径</small></div></div><article className="objective-panel-chart-card"><div className="objective-chart-heading"><strong>外部行情走势</strong><small>基期=100 · 主要指标</small></div><div ref={trendRef} className="objective-chart" />{advice.find((item) => item.id === 'steel-price') && <DataAdviceCard advice={advice.find((item) => item.id === 'steel-price')} compact />}</article></div>}
        </div>
      </aside>
    </div>
  );
}

interface ShippingIndexPanelProps {
  snapshot: ShippingIndexSnapshot;
}

const shippingIndexOrder = ['CCFI', 'SCFI', 'BSI', 'BDI', 'BRENT', 'NYMEX'] as const;

function ShippingIndexPanel({ snapshot }: ShippingIndexPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bulkRef = useRef<HTMLDivElement>(null);
  const energyRef = useRef<HTMLDivElement>(null);
  const themeKey = useThemeKey();

  const rowsForSeries = (code: string) => {
    const series = snapshot.series[code];
    if (!series) return [];
    const coreRoute = series.latest.routeName;
    return [...series.points]
      .filter((point) => !coreRoute || point.routeName === coreRoute)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-60);
  };

  useEffect(() => {
    const nodes = [containerRef.current, bulkRef.current, energyRef.current];
    const charts = nodes
      .filter((node): node is HTMLDivElement => Boolean(node))
      .map((node) => echarts.getInstanceByDom(node) || echarts.init(node));
    if (charts.length !== 3) return;

    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue('--text-secondary').trim() || '#526274';
    const grid = styles.getPropertyValue('--border-default').trim() || '#dce5ee';
    const blue = styles.getPropertyValue('--accent-primary').trim() || '#1f4e79';
    const lightBlue = styles.getPropertyValue('--accent-secondary').trim() || '#4f8bb8';
    const orange = styles.getPropertyValue('--accent-warning').trim() || '#e8842a';
    const lineColors = [blue, lightBlue, orange, '#1b9b6f', '#7b6cae', '#bd3f4d'];

    const lineOption = (codes: readonly string[], title: string): echarts.EChartsOption => {
      const seriesRows = codes.map((code) => ({ code, rows: rowsForSeries(code) }));
      const dates = [...new Set(seriesRows.flatMap((item) => item.rows.map((row) => row.date)))].sort();
      return {
        color: lineColors,
        grid: { left: 52, right: 20, top: 30, bottom: 34, containLabel: true },
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const date = params[0]?.axisValue || '';
            return [date, ...params.map((param: any) => {
              const row = seriesRows[param.seriesIndex]?.rows.find((item) => item.date === date);
              return `${snapshot.series[seriesRows[param.seriesIndex]?.code]?.label || title}：${row?.value == null ? '—' : formatNumber(row.value, 2)}`;
            })].join('<br/>');
          },
        },
        legend: { top: 0, textStyle: { color: text, fontSize: 13 } },
        xAxis: { type: 'category', data: dates, axisLabel: { color: text, fontSize: 12, interval: Math.max(0, Math.ceil(dates.length / 7) - 1), hideOverlap: true, formatter: (value: string) => value.slice(0, 7) }, axisLine: { lineStyle: { color: grid } } },
        yAxis: { type: 'value', name: '基期=100', scale: true, splitNumber: 4, axisLabel: { color: text, fontSize: 12 }, splitLine: { lineStyle: { color: grid } } },
        series: seriesRows.map(({ code, rows }, index) => {
          const first = rows.find((row) => row.value > 0)?.value || 1;
          const values = new Map(rows.map((row) => [row.date, Number((row.value / first * 100).toFixed(1))]));
          return { name: snapshot.series[code]?.code || code, type: 'line' as const, smooth: true, showSymbol: false, data: dates.map((date) => values.get(date) ?? null), lineStyle: { width: 2 }, itemStyle: { color: lineColors[index] } };
        }),
      };
    };

    charts[0].setOption(lineOption(['CCFI', 'SCFI'], '集装箱运价'), true);
    charts[1].setOption(lineOption(['BSI', 'BDI'], '干散货运价'), true);
    charts[2].setOption(lineOption(['BRENT', 'NYMEX'], '原油价格'), true);
    const resize = () => charts.forEach((chart) => chart.resize());
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); charts.forEach((chart) => chart.dispose()); };
  }, [snapshot, themeKey]);

  const cards = shippingIndexOrder.map((code) => snapshot.series[code]).filter((series): series is NonNullable<typeof series> => Boolean(series));
  return (
    <section id="shipping-indices" className="shipping-index-panel" aria-label="航运指数核心数据">
      <div className="shipping-index-heading">
        <div><span className="section-index">SHIPPING</span><h2>航运指数与能源成本</h2></div>
        <p>航运市场环境参考 · 覆盖至 {snapshot.source.coverage_end} · 每日 18:00 更新</p>
      </div>
      <div className="shipping-index-kpis">
        {cards.map((series) => {
          const change = series.latest.changeRatePct;
          return <article className="shipping-index-kpi" key={series.code}>
            <div><strong>{series.code}</strong><span>{series.label.replace(`${series.code} `, '')}</span></div>
            <b>{formatNumber(series.latest.value, 2)} <small>{series.unit}</small></b>
            <em className={change == null ? '' : change >= 0 ? 'is-up' : 'is-down'}>{change == null ? '环比 —' : `环比 ${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(1)}%`}</em>
            <small>{series.latest.date} · {series.frequency}</small>
          </article>;
        })}
      </div>
      <div className="shipping-index-charts">
        <article><div className="shipping-index-chart-title"><strong>集装箱运价趋势</strong><span>Container freight · 基期=100</span></div><div ref={containerRef} /></article>
        <article><div className="shipping-index-chart-title"><strong>干散货运价趋势</strong><span>Dry bulk freight · 基期=100</span></div><div ref={bulkRef} /></article>
        <article><div className="shipping-index-chart-title"><strong>原油价格趋势</strong><span>Energy cost · 基期=100</span></div><div ref={energyRef} /></article>
      </div>
    </section>
  );
}

interface ForexChartsProps { forex: ForexSnapshot }

function ForexCharts({ forex }: ForexChartsProps) {
  const dxyRef = useRef<HTMLDivElement>(null);
  const eurRef = useRef<HTMLDivElement>(null);
  const cnyRef = useRef<HTMLDivElement>(null);
  const yieldRef = useRef<HTMLDivElement>(null);
  const [expandedFx, setExpandedFx] = useState(false);
  const themeKey = useThemeKey();

  useEffect(() => {
    const nodes = [dxyRef.current, eurRef.current, cnyRef.current, yieldRef.current];
    const charts = new Map<number, echarts.ECharts>();
    nodes.forEach((node, index) => {
      const visible = index > 2 || expandedFx;
      if (node && visible) charts.set(index, echarts.getInstanceByDom(node) || echarts.init(node));
    });
    const chartAt = (index: number) => charts.get(index);
    if (!chartAt(3)) return;
    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue('--text-secondary').trim() || '#526274';
    const grid = styles.getPropertyValue('--border-default').trim() || '#dce5ee';
    const blue = '#3478b9';
    const orange = '#d88935';
    const red = '#bd3f4d';
    const gray = '#8793a3';
    const baseAxis = { axisLabel: { color: text, fontSize: 13 }, axisLine: { lineStyle: { color: grid } } };
    const dates = forex.symbols.DINIW.map((point) => point.date);
    const lineOption = (code: 'EURUSD' | 'USDCNY', label: string, color: string): echarts.EChartsOption => {
      const rows = forex.symbols[code];
      const values = rows.map((row) => row.close);
      const quantile = (ratio: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))];
      const latest = rows[rows.length - 1];
      const momentum = rows.map((row) => row.return_20d == null ? null : Number((row.return_20d * 100).toFixed(2)));
      const labelInterval = Math.max(0, Math.ceil(rows.length / 7) - 1);
      const axisLabel = { ...baseAxis.axisLabel, interval: labelInterval, rotate: 0, hideOverlap: true, formatter: (value: string) => value.slice(0, 7) };
      return { color: [color, gray, '#a6b4c3', '#4f9b96'], grid: [{ left: 54, right: 20, top: 30, height: '58%', containLabel: true }, { left: 54, right: 20, top: '72%', height: '18%', containLabel: true }], tooltip: { trigger: 'axis', formatter: (params: any) => { const row = rows[params[0]?.dataIndex]; return `${row?.date || ''}<br/>${label}：${row?.close?.toFixed(4) || '—'}<br/>MA20：${row?.ma20 == null ? '—' : row.ma20.toFixed(4)}<br/>MA60：${row?.ma60 == null ? '—' : row.ma60.toFixed(4)}<br/>20日涨跌：${row?.return_20d == null ? '—' : `${(row.return_20d * 100).toFixed(2)}%`}<br/>历史分位：${row?.percentile?.toFixed(1) || '—'}%`; } }, legend: { top: 0, textStyle: { color: text, fontSize: 13 } }, xAxis: [{ type: 'category', data: rows.map((row) => row.date), ...baseAxis, axisLabel: { show: false } }, { type: 'category', gridIndex: 1, data: rows.map((row) => row.date), ...baseAxis, axisLabel }], yAxis: [{ type: 'value', scale: true, splitNumber: 4, ...baseAxis, splitLine: { lineStyle: { color: grid } } }, { type: 'value', gridIndex: 1, name: '20日动量 %', splitNumber: 3, ...baseAxis, axisLabel: { ...axisLabel, formatter: '{value}%' }, splitLine: { lineStyle: { color: grid, type: 'dashed' } } }], series: [{ name: label, type: 'line', data: values, smooth: true, showSymbol: false, xAxisIndex: 0, yAxisIndex: 0, lineStyle: { width: 2 }, markPoint: latest ? { data: [{ name: '当前', coord: [latest.date, latest.close], value: `当前 ${latest.percentile.toFixed(1)}%`, itemStyle: { color } }], label: { color: '#fff', fontSize: 12 } } : undefined, markLine: { symbol: 'none', data: [{ yAxis: quantile(.25), name: '25%分位' }, { yAxis: quantile(.5), name: '50%分位' }, { yAxis: quantile(.75), name: '75%分位' }], label: { color: text, fontSize: 12 }, lineStyle: { type: 'dashed', color: grid } } }, { name: 'MA20', type: 'line', data: rows.map((row) => row.ma20), smooth: true, showSymbol: false, xAxisIndex: 0, yAxisIndex: 0, lineStyle: { type: 'dashed' } }, { name: 'MA60', type: 'line', data: rows.map((row) => row.ma60), smooth: true, showSymbol: false, xAxisIndex: 0, yAxisIndex: 0, lineStyle: { type: 'dotted' } }, { name: '20日动量', type: 'bar', data: momentum, xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: 5, itemStyle: { color: (params: any) => params.value >= 0 ? '#1b9b6f' : red } }] };
    };
    const dxy = forex.symbols.DINIW;
    const dxyInterval = Math.max(0, Math.ceil(dates.length / 7) - 1);
    chartAt(0)?.setOption({ color: [gray], grid: { left: 54, right: 20, top: 24, bottom: 36, containLabel: true }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: dates, ...baseAxis, axisLabel: { ...baseAxis.axisLabel, interval: dxyInterval, rotate: 0, hideOverlap: true, formatter: (value: string) => value.slice(0, 7) } }, yAxis: { type: 'value', name: '美元指数', scale: true, splitNumber: 4, ...baseAxis, splitLine: { lineStyle: { color: grid } } }, series: [{ name: 'DXY 美元指数', type: 'line', data: dxy.map((row) => row.close), smooth: true, showSymbol: false, lineStyle: { width: 2 } }] }, true);
    chartAt(1)?.setOption(lineOption('EURUSD', 'EURUSD 欧元兑美元', blue), true);
    chartAt(2)?.setOption(lineOption('USDCNY', 'USDCNY 美元兑人民币', orange), true);
    const rel = forex.relative_yield;
    chartAt(3)?.setOption({ color: [blue, orange], grid: { left: 54, right: 20, top: 24, bottom: 36, containLabel: true }, tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0]?.axisValue}<br/>EUR计价相对收益：${(rel[params[0]?.dataIndex]?.rel_yield_EUR ?? 0).toFixed(2)}%<br/>CNY计价相对收益：${(rel[params[0]?.dataIndex]?.rel_yield_CNY ?? 0).toFixed(2)}%` }, legend: { top: 0, textStyle: { color: text, fontSize: 13 } }, xAxis: { type: 'category', data: rel.map((row) => row.date), ...baseAxis, axisLabel: { ...baseAxis.axisLabel, interval: Math.max(0, Math.ceil(rel.length / 7) - 1), rotate: 0, hideOverlap: true, formatter: (value: string) => value.slice(0, 7) } }, yAxis: { type: 'value', name: '相对美元收益（%）', scale: true, splitNumber: 4, ...baseAxis, axisLabel: { ...baseAxis.axisLabel, formatter: '{value}%' }, splitLine: { lineStyle: { color: grid } } }, series: [{ name: 'EUR计价', type: 'line', data: rel.map((row) => row.rel_yield_EUR), smooth: true, showSymbol: false, lineStyle: { width: 2 }, markLine: { symbol: 'none', data: [{ yAxis: 0, name: 'USD基准' }], lineStyle: { color: grid, type: 'dashed' } } }, { name: 'CNY计价', type: 'line', data: rel.map((row) => row.rel_yield_CNY), smooth: true, showSymbol: false }] }, true);
    const resize = () => charts.forEach((chart) => chart.resize()); window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); charts.forEach((chart) => chart.dispose()); };
  }, [forex, themeKey, expandedFx]);

  const latestEUR = forex.latest_independent?.EURUSD || forex.symbols.EURUSD[forex.symbols.EURUSD.length - 1];
  const latestCNY = forex.latest_independent?.USDCNY || forex.symbols.USDCNY[forex.symbols.USDCNY.length - 1];
  const latestDXY = forex.latest_independent?.DINIW || forex.symbols.DINIW[forex.symbols.DINIW.length - 1];
  const displayRate = (point?: { close: number }) => point && Number.isFinite(point.close) ? point.close.toFixed(4) : '—';
  const displayPercentile = (point?: { percentile: number }) => point && Number.isFinite(point.percentile) ? point.percentile.toFixed(1) : '—';
  const displaySigned = (value?: number) => value == null || !Number.isFinite(value) ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  return <section id="forex-analysis" className="forex-panel" aria-label="外汇汇率分析">
    <div className="section-heading"><div><span className="section-index">FX</span><h2>外汇与签约币种</h2></div><p>近12个月历史统计 · 不构成预测</p></div>
    <div className="forex-kpis"><div><span>DXY 美元指数</span><strong>{displayRate(latestDXY)}</strong><small>{latestDXY?.date || '暂无日期'} · 宏观参考</small></div><div><span>EURUSD 欧元兑美元</span><strong className="forex-eur">{displayRate(latestEUR)}</strong><small>历史分位 {displayPercentile(latestEUR)}%</small></div><div><span>USDCNY 美元兑人民币</span><strong className="forex-cny">{displayRate(latestCNY)}</strong><small>历史分位 {displayPercentile(latestCNY)}%</small></div><div><span>数据区间</span><strong>{forex.source.observation_count} 日</strong><small>{forex.source.coverage_start} 至 {forex.source.coverage_end}</small></div></div>
    <div className="forex-insight-strip"><div><span>EUR计价相对收益</span><strong className={forex.risk.EUR.current_relative_yield_pct >= 0 ? 'is-positive' : 'is-negative'}>{displaySigned(forex.risk.EUR.current_relative_yield_pct)}</strong><small>对比直接 USD 签约</small></div><div><span>CNY计价相对收益</span><strong className={forex.risk.CNY.current_relative_yield_pct >= 0 ? 'is-positive' : 'is-negative'}>{displaySigned(forex.risk.CNY.current_relative_yield_pct)}</strong><small>对比直接 USD 签约</small></div></div>
    <div className="forex-chart-grid"><div className="forex-chart-toggle-row"><button type="button" className="forex-chart-toggle" onClick={() => setExpandedFx((current) => !current)} aria-expanded={expandedFx}>{expandedFx ? '收起行情图表' : '展开行情图表'}</button></div>{expandedFx && <><article className="forex-chart-card forex-wide"><div className="analysis-chart-heading"><strong>DXY 美元指数</strong><small>宏观背景参考 · {latestDXY?.date || '暂无日期'}</small></div><div ref={dxyRef} className="forex-chart" /></article><article className="forex-chart-card"><div className="analysis-chart-heading"><strong>EURUSD 欧元兑美元</strong><small>价格 · MA20 / MA60 · 25/50/75%分位 · 20日动量</small></div><div ref={eurRef} className="forex-chart" /></article><article className="forex-chart-card"><div className="analysis-chart-heading"><strong>USDCNY 美元兑人民币</strong><small>价格 · MA20 / MA60 · 25/50/75%分位 · 20日动量</small></div><div ref={cnyRef} className="forex-chart" /></article></>}<article className="forex-chart-card forex-wide"><div className="analysis-chart-heading"><strong>等价美元相对收益</strong><small>固定 100 万美元基准 · 0轴=USD计价</small></div><div ref={yieldRef} className="forex-chart" /></article></div>
  </section>;
}

interface RiskDisplayItem {
  id: string;
  category: RiskCategory;
  title: string;
  metric: string;
  value: string;
  baseline: number | null;
  delta: number | null;
  asOf: string;
  freshness: string;
  changeText: string;
  evidence: Array<{ label: string; href: string }>;
  source: { label: string; href: string } | null;
  targetId: string;
}

export function UnifiedAnalysis() {
  const { state, dispatch } = useAppContext();
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [aggregates, setAggregates] = useState<InternalAggregate[]>([]);
  const [costs, setCosts] = useState<ProductCost[]>([]);
  const [scenarios, setScenarios] = useState<FxScenario[]>([]);
  const [policies, setPolicies] = useState<PolicyEvent[]>([]);
  const [signals, setSignals] = useState<RiskSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [steelExport, setSteelExport] = useState<SteelExportSnapshot | null>(null);
  const [forex, setForex] = useState<ForexSnapshot | null>(null);
  const [taricQuota, setTaricQuota] = useState<TaricQuotaSnapshot | null>(null);
  const [tradeRemedy, setTradeRemedy] = useState<TradeRemedySnapshot | null>(null);
  const [shippingIndices, setShippingIndices] = useState<ShippingIndexSnapshot | null>(null);
  const [internalBusiness, setInternalBusiness] = useState<InternalBusinessSnapshot | null>(null);
  const [fastNews, setFastNews] = useState<FastNewsSnapshot | null>(null);
  const [analysisAdvice, setAnalysisAdvice] = useState<DataDrivenAdvice[]>([]);
  const [riskFilter, setRiskFilter] = useState<'all' | RiskCategory>('remedy');
  const [expandedRiskId, setExpandedRiskId] = useState<string | null>(null);
  const riskSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      dataProvider.getMarketQuotes({ productLine: state.productLine, region: state.region, dateRange: state.dateRange }),
      dataProvider.getInternalAggregates({ productLine: state.productLine, region: state.region, dateRange: state.dateRange }),
      dataProvider.getProductCosts({ dateRange: state.dateRange }),
      dataProvider.getFxScenarios(),
      dataProvider.getPolicyEvents({ dateRange: state.dateRange }),
      dataProvider.getRiskSignals({ productLine: state.productLine, region: state.region, dateRange: state.dateRange }),
      dataProvider.getSteelExportSnapshot(),
      dataProvider.getForexSnapshot(),
      dataProvider.getTaricQuotaSnapshot(),
      dataProvider.getTradeRemedySnapshot(),
      dataProvider.getShippingIndexSnapshot(),
      dataProvider.getDataSyncStatus(),
      dataProvider.getInternalBusinessSnapshot(),
      dataProvider.getFastNewsSnapshot(),
    ])
      .then(([nextQuotes, nextAggregates, nextCosts, nextScenarios, nextPolicies, nextSignals, nextSteelExport, nextForex, nextTaricQuota, nextTradeRemedy, nextShippingIndices, nextSyncStatus, nextInternalBusiness, nextFastNews]) => {
        if (!active) return;
        setQuotes(nextQuotes);
        setAggregates(nextAggregates);
        setCosts(nextCosts);
        setScenarios(nextScenarios);
        setPolicies(nextPolicies);
        setSignals(nextSignals);
        setSteelExport(nextSteelExport);
        setForex(nextForex);
        setTaricQuota(nextTaricQuota);
        setTradeRemedy(nextTradeRemedy);
        setShippingIndices(nextShippingIndices);
        setInternalBusiness(nextInternalBusiness);
        setFastNews(nextFastNews);
        setAnalysisAdvice(buildDataDrivenAdvice({ quotes: nextQuotes, risks: nextSignals, policies: nextPolicies, aggregates: nextAggregates, costs: nextCosts, fxScenarios: nextScenarios, steelExport: nextSteelExport, forex: nextForex, taricQuota: nextTaricQuota, shippingIndices: nextShippingIndices, internalBusiness: nextInternalBusiness, syncStatus: nextSyncStatus }));
        dispatch({ type: 'SET_MARKET_DATA', payload: nextQuotes });
        dispatch({ type: 'SET_INTERNAL_AGGREGATES', payload: nextAggregates });
        dispatch({ type: 'SET_POLICY_EVENTS', payload: nextPolicies });
        dispatch({ type: 'SET_RISK_SIGNALS', payload: nextSignals });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : '加载综合分析数据失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [state.dateRange, state.productLine, state.region]);

  const riskItems = useMemo<RiskDisplayItem[]>(() => signals
    .filter((signal) => signal.level !== 'normal')
    .map((signal) => {
      const category = classifyRisk(signal);
      return {
        id: signal.signal_id,
        category,
        title: factorChinese[signal.factor] || humanizeDisplay(signal.factor),
        metric: metricChinese[signal.metric] || humanizeDisplay(signal.metric),
        value: riskValueText(signal),
        baseline: signal.baseline ?? null,
        delta: signal.delta_pct ?? null,
        asOf: formatDate(signal.as_of),
        freshness: signal.freshness,
        changeText: formatRiskChange(signal),
        evidence: riskEvidence(signal, policies),
        source: riskSource(signal, policies, tradeRemedy, taricQuota, shippingIndices, forex, fastNews),
        targetId: riskTargetId(signal),
      };
    })
    .sort((a, b) => {
      return Math.abs(b.delta || 0) - Math.abs(a.delta || 0) || b.asOf.localeCompare(a.asOf);
    }), [fastNews, forex, policies, signals, shippingIndices, taricQuota, tradeRemedy]);

  const visibleRiskItems = useMemo(() => riskFilter === 'all' ? riskItems : riskItems.filter((item) => item.category === riskFilter), [riskFilter, riskItems]);
  const riskCategoryCounts = useMemo(() => riskCategoryOrder.reduce<Record<RiskCategory, number>>((counts, category) => {
    counts[category] = riskItems.filter((item) => item.category === category).length;
    return counts;
  }, { remedy: 0, quota: 0, 'market-volatility': 0, 'internal-competition': 0, 'trade-policy': 0, geopolitical: 0 }), [riskItems]);

  useGSAP(() => {
    if (!riskSectionRef.current) return;
    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out', overwrite: 'auto' } });
      timeline
        .fromTo('.risk-section-heading', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: .28 })
        .fromTo('.risk-index', { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: .22 }, '-=.12')
        .fromTo('.risk-lane', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .28, stagger: .045 }, '-=.08');
      return () => timeline.kill();
    }, riskSectionRef);
    return () => motion.revert();
  }, { scope: riskSectionRef, dependencies: [riskFilter, riskItems.length], revertOnUpdate: true });

  useGSAP(() => {
    if (!riskSectionRef.current) return;
    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const entries = riskSectionRef.current?.querySelectorAll<HTMLElement>('.risk-entry');
      if (entries?.length) gsap.fromTo(entries, { autoAlpha: 0, y: 5 }, { autoAlpha: 1, y: 0, duration: .2, stagger: .025, clearProps: 'transform' });
    }, riskSectionRef);
    return () => motion.revert();
  }, { scope: riskSectionRef, dependencies: [riskFilter, expandedRiskId], revertOnUpdate: true });

  const focusRiskCategory = (category: 'all' | RiskCategory) => {
    setRiskFilter(category);
    setExpandedRiskId(null);
  };

  useEffect(() => {
    if (riskFilter === 'all') return;
    const frame = window.requestAnimationFrame(() => document.getElementById(`risk-lane-${riskFilter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [riskFilter]);

  return (
    <div className="unified-analysis">
      {error && <div className="analysis-error">{error}</div>}

      <section id="analysis-objective-charts" className="analysis-section objective-section">
        {!loading && <ObjectiveCharts quotes={quotes} aggregates={aggregates} costs={costs} scenarios={scenarios} internalBusiness={internalBusiness} steelExport={steelExport} taricQuota={taricQuota} tradeRemedy={tradeRemedy} advice={analysisAdvice} />}
        {!loading && shippingIndices && <ShippingIndexPanel snapshot={shippingIndices} />}
        {!loading && <div className="analysis-advice-strip" aria-label="客观信息对应建议">{analysisAdvice.slice(0, 4).map((advice) => <DataAdviceCard key={advice.id} advice={advice} compact />)}</div>}
        {!loading && forex && <ForexCharts forex={forex} />}
      </section>

      {!loading && internalBusiness && <BusinessOutputAndPolicyTimeline snapshot={internalBusiness} policies={policies} tradeRemedy={tradeRemedy} />}

      <section id="risk" ref={riskSectionRef} className="analysis-section risk-section">
        <div className="risk-section-heading">
          <div><span className="risk-section-mark" aria-hidden="true" /><div><h2>风险</h2><p>只描述已发生的变化；展开条目查看数据、时间和可核验来源。</p></div></div>
          <div className="risk-summary"><strong>{riskItems.length}</strong><span>条变化记录</span></div>
        </div>
        <nav className="risk-index" aria-label="风险分类索引">
          {riskCategoryOrder.map((category) => <button type="button" key={category} className={`risk-index-${category} ${riskFilter === category ? 'is-active' : ''}`} onClick={() => focusRiskCategory(riskFilter === category ? 'all' : category)}><i />{riskCategoryMeta[category].shortLabel} <b>{riskCategoryCounts[category]}</b></button>)}
        </nav>
        <div className="risk-index-note">按分类查看变化；数据类记录可定位到站内图表，来源类记录仅在链接可核验时提供外部入口。</div>
        <div className={`risk-lane-grid ${riskFilter !== 'all' ? 'is-filtered' : ''}`}>
          {riskCategoryOrder.filter((category) => riskFilter === 'all' || category === riskFilter).map((category) => {
            const categoryItems = visibleRiskItems.filter((item) => item.category === category);
            return <section id={`risk-lane-${category}`} className={`risk-lane risk-lane-${category}`} key={category} aria-labelledby={`risk-lane-title-${category}`}>
              <div className="risk-lane-heading"><div><i /><h3 id={`risk-lane-title-${category}`}>{riskCategoryMeta[category].label}</h3></div><span>{categoryItems.length} 项</span></div>
              <p className="risk-lane-description">{riskCategoryMeta[category].description}</p>
              <div className="risk-lane-items">
                {categoryItems.map((item) => {
                  const expanded = expandedRiskId === item.id;
                  return <article className={`risk-entry ${expanded ? 'is-expanded' : ''}`} key={item.id}>
                    <button type="button" className="risk-entry-summary" aria-expanded={expanded} onClick={() => setExpandedRiskId((current) => current === item.id ? null : item.id)}>
                      <span className="risk-entry-dot" aria-hidden="true" /><div className="risk-entry-main"><strong>{item.title}</strong><span>{item.metric} · {item.changeText}</span></div><div className="risk-entry-change"><b>{item.delta == null ? '有变化' : `${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}%`}</b><small>{item.asOf}</small></div><span className="risk-entry-chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
                    </button>
                    {expanded && <div className="risk-entry-detail">
                      <div className="risk-detail-grid"><div><small>当前记录</small><strong>{item.value}</strong></div><div><small>基准记录</small><strong>{item.baseline == null ? '—' : formatNumber(item.baseline, 2)}</strong></div><div><small>记录日期</small><strong>{item.asOf}</strong></div><div><small>数据状态</small><strong>{item.freshness || '—'}</strong></div></div>
                      <p className="risk-detail-assessment">{item.changeText}</p>
                      <div className="risk-detail-links"><a href={`#${item.targetId}`} onClick={() => setExpandedRiskId(item.id)}>定位分析 ↗</a>{item.source && <a href={item.source.href} target="_blank" rel="noreferrer">{item.source.label} ↗</a>}{item.evidence.length > 0 && <span>可核验证据：{item.evidence.map((evidence) => <a key={evidence.label} href={evidence.href} target="_blank" rel="noreferrer">{evidence.label}</a>)}</span>}</div>
                    </div>}
                  </article>;
                })}
                {!categoryItems.length && <div className="risk-lane-empty">当前分类暂无待关注信号</div>}
              </div>
            </section>;
          })}
        </div>
        {!riskItems.length && <div className="analysis-empty">当前没有需要关注的风险信号</div>}
      </section>
    </div>
  );
}
