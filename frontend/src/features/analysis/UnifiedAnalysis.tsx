import { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
import * as echarts from 'echarts';
import { useAppContext } from '@/core/store/context';
import { dataProvider } from '@/core/data/provider';
import { loadStrategyData } from '@/core/strategy/data';
import { buildDataDrivenAdvice, DataDrivenAdvice } from '@/core/strategy/engine';
import { DataAdviceCard } from '@/shared/components/data/DataAdviceCard';
import { DataStatus } from '@/shared/components/data/DataStatus';
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
} from '@/core/store/types';
import './UnifiedAnalysis.css';

type ObjectiveKind = '行情' | '政策' | '经营' | '成本' | '汇率' | '风险';
type ObjectivePriority = 'P0' | 'P1' | 'P2' | 'P3';

interface ObjectiveItem {
  id: string;
  kind: ObjectiveKind;
  title: string;
  chineseHint: string;
  value: string;
  detail: string;
  source: string;
  date: string;
  searchable: string;
  priority: ObjectivePriority;
}

const riskLevelText: Record<RiskSignal['level'], string> = {
  critical: '严重',
  high_attention: '高度关注',
  attention: '关注',
  normal: '正常',
};

const riskLevelClass: Record<RiskSignal['level'], string> = {
  critical: 'critical',
  high_attention: 'high',
  attention: 'attention',
  normal: 'normal',
};

const periodChinese: Record<InternalAggregate['period'], string> = {
  daily: '日',
  weekly: '周',
  monthly: '月',
};

function formatDate(value?: string) {
  return value ? value.slice(0, 10) : '—';
}

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits });
}

function humanizeDisplay(value: string) {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function quoteChange(quote: MarketQuote) {
  if (quote.baseline === undefined || quote.baseline === 0) return null;
  return ((quote.value - quote.baseline) / quote.baseline) * 100;
}

function preferredAggregatePeriod(items: InternalAggregate[]) {
  return (['monthly', 'weekly', 'daily'] as const).find((period) => items.some((item) => item.period === period)) || 'weekly';
}

function aggregateDurationDays(item: InternalAggregate) {
  const start = Date.parse(item.start_date);
  const end = Date.parse(item.end_date);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(1, Math.round((end - start) / 86400000) + 1) : 0;
}

function scopedAggregates(items: InternalAggregate[]) {
  const period = preferredAggregatePeriod(items);
  const expectedDays = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
  const samePeriod = items.filter((item) => item.period === period);
  const periodSized = samePeriod.filter((item) => Math.abs(aggregateDurationDays(item) - expectedDays) <= (period === 'monthly' ? 6 : 2));
  return periodSized.length ? periodSized : samePeriod;
}

function latestCostScenario(items: ProductCost[]) {
  const latestDate = [...new Set(items.map((item) => item.effective_date))].sort().reverse()[0];
  if (!latestDate) return [];
  const latest = items.filter((item) => item.effective_date === latestDate);
  const groups = new Map<string, ProductCost[]>();
  latest.forEach((item) => {
    const key = [item.product_code, item.trade_term, item.origin, item.destination, item.currency].join('|');
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
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

const policyChinese: Record<string, string> = {
  regulation: '法规 / 监管',
  tariff: '关税措施',
  subsidy: '补贴 / 激励',
  ban: '禁令 / 限制',
  quota: '配额 / 许可',
  anti_dumping: '反倾销',
};

const policyTitleChinese: Record<string, string> = {
  'EU CBAM Full Implementation Phase': '欧盟 CBAM 全面实施阶段',
  'US Section 232 Steel Tariff Review': '美国 232 条款钢材关税复审',
  'India Safeguard Duty Extension': '印度保障措施关税延长',
  'China Export Tax Rebate Adjustment': '中国钢材出口退税调整',
  'EU Anti-Dumping Investigation - Cold-Rolled': '欧盟冷轧钢反倾销调查',
  'ASEAN Harmonized Steel Standard': '东盟钢材标准协调统一',
  'Vietnam Import Licensing Requirement': '越南钢材进口许可要求',
  'Brazil Minimum Import Price': '巴西钢材最低进口价格',
  'Turkey Additional Customs Duty': '土耳其钢材附加关税',
  'Japan Green Steel Procurement Policy': '日本绿色钢材采购政策',
  'Indonesia Nickel Export Ban Extension': '印度尼西亚镍出口禁令延长',
  'South Korea Emissions Trading System Expansion': '韩国碳排放交易体系扩围',
  'Mexico Steel Origin Verification Program': '墨西哥钢材原产地核验计划',
  'UK Carbon Border Tax Proposal': '英国碳边境税提案',
  'Australia Critical Minerals Strategy': '澳大利亚关键矿产战略',
  'Thailand BOI Investment Incentives': '泰国 BOI 投资激励',
  'Canada Underutilized Capacity Tariff': '加拿大产能不足附加关税',
  'Philippines Anti-Circumvention Duty': '菲律宾反规避关税',
  'EU Deforestation Regulation Impact': '欧盟零毁林法规影响',
  'Singapore Carbon Tax Increase': '新加坡碳税上调',
};

const factorChinese: Record<string, string> = {
  price_volatility: '价格波动',
  freight_cost: '运费成本',
  carbon_cost: '碳成本',
  policy_risk: '政策风险',
  demand_weakness: '需求走弱',
  fx_volatility: '汇率波动',
};

const costComponentChinese: Record<string, string> = {
  BASE_STEEL: '基础钢材价格',
  INLAND_FREIGHT: '内陆运费',
  OCEAN_FREIGHT: '海运费',
  INSURANCE: '海运保险',
  CUSTOMS_DUTY: '进口关税',
  CBAM: 'CBAM证书成本',
};

const productChinese: Record<string, string> = {
  'HR-Q235B-3.0': '热轧 Q235B · 3.0mm',
  'CR-SPCC-1.2': '冷轧 SPCC · 1.2mm',
  'SS-M470-50A': '硅钢 M470-50A',
};

const regionChinese: Record<string, string> = {
  asia: '亚洲',
  europe: '欧洲',
  americas: '美洲',
  africa: '非洲',
  global: '全球',
};

const customerSegmentChinese: Record<string, string> = {
  automotive: '汽车',
  construction: '建筑',
  appliance: '家电',
  transformer: '变压器',
  distribution: '流通',
};

function scenarioChinese(name: string) {
  if (name === 'Current Rate') return '当前汇率';
  const match = name.match(/^([A-Z]{3}) (Strengthens|Weakens) (.+)$/);
  if (!match) return '汇率情景';
  return `${match[1]}${match[2] === 'Strengthens' ? '升值' : '贬值'}${match[3]}`;
}

const metricChinese: Record<string, string> = {
  steel_price_volatility_30d: '30日钢价波动率',
  ocean_freight_china_europe: '中国至欧洲海运费',
  eua_price: 'EUA碳价',
  eu_antidumping_probability: '欧盟反倾销概率',
  order_completion_rate: '订单完成率',
  fx_volatility_30d: '30日汇率波动率',
};

const metricEnglish: Record<string, string> = {
  steel_price_volatility_30d: 'steel price volatility 30d',
  ocean_freight_china_europe: 'ocean freight China Europe',
  eua_price: 'EUA price',
  eu_antidumping_probability: 'EU anti-dumping probability',
  order_completion_rate: 'order completion rate',
  fx_volatility_30d: 'FX volatility 30d',
};

function displayMetric(value: string) {
  return metricEnglish[value] || humanizeDisplay(value);
}

function policySeverityLabel(severity: number) {
  if (severity >= 8) return '严重';
  if (severity >= 6) return '高度关注';
  if (severity >= 4) return '关注';
  return '一般';
}

function policyVerifyLabel(status: PolicyEvent['verify_status']) {
  return status === 'verified' ? '已核验' : status === 'pending' ? '待核验' : '未核验';
}

interface ObjectiveChartsProps {
  quotes: MarketQuote[];
  aggregates: InternalAggregate[];
  costs: ProductCost[];
  scenarios: FxScenario[];
  steelExport: SteelExportSnapshot | null;
  taricQuota: TaricQuotaSnapshot | null;
  advice: DataDrivenAdvice[];
  tradeRemedy: TradeRemedySnapshot | null;
}

const remedyMapNames: Record<string, string> = {
  美国: 'United States of America', 欧盟: 'European Union', 澳大利亚: 'Australia', 加拿大: 'Canada', 印度: 'India', 巴西: 'Brazil', 墨西哥: 'Mexico', 南非: 'South Africa',
  印度尼西亚: 'Indonesia', 泰国: 'Thailand', 马来西亚: 'Malaysia', 阿根廷: 'Argentina', 土耳其: 'Turkey', 哥伦比亚: 'Colombia', 埃及: 'Egypt', 中国台湾地区: 'Taiwan',
  乌克兰: 'Ukraine', 智利: 'Chile', 越南: 'Vietnam', 欧亚经济联盟: 'Eurasian Economic Union', 韩国: 'Korea', 巴基斯坦: 'Pakistan', 新西兰: 'New Zealand', 俄罗斯: 'Russia',
  秘鲁: 'Peru', 日本: 'Japan', 菲律宾: 'Philippines', 海湾合作委员会: 'Gulf Cooperation Council', 以色列: 'Israel', 摩洛哥: 'Morocco', 危地马拉: 'Guatemala',
  委内瑞拉: 'Venezuela', 捷克: 'Czech Rep.', 保加利亚: 'Bulgaria', 多米尼加: 'Dominican Rep.', 英国: 'United Kingdom', 俄白哈关税同盟: 'Russia', 匈牙利: 'Hungary',
  哥斯达黎加: 'Costa Rica', 沙特阿拉伯: 'Saudi Arabia', 波兰: 'Poland', 突尼斯: 'Tunisia', 约旦: 'Jordan', 赞比亚: 'Zambia', 阿联酋: 'United Arab Emirates',
};
const remedySpecialPoints: Record<string, [number, number]> = { 欧盟: [4.5, 50.8], 欧亚经济联盟: [45, 55], 海湾合作委员会: [47, 25], 中国台湾地区: [121, 23.7], 俄白哈关税同盟: [48, 54] };
const nonSingleRemedyOrigins = new Set(['欧盟', '欧亚经济联盟', '海湾合作委员会', '俄白哈关税同盟']);
type RemedyOriginFilter = 'all' | 'single' | 'non-single';

function isNonSingleRemedyOrigin(name: string) {
  return nonSingleRemedyOrigins.has(name);
}

function ObjectiveCharts({ quotes, aggregates, costs, scenarios, steelExport, taricQuota, advice, tradeRemedy }: ObjectiveChartsProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<HTMLDivElement>(null);
  const costRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const exportTrendRef = useRef<HTMLDivElement>(null);
  const exportRankRef = useRef<HTMLDivElement>(null);
  const quotaTrendRef = useRef<HTMLDivElement>(null);
  const quotaRankRef = useRef<HTMLDivElement>(null);
  const quotaMixRef = useRef<HTMLDivElement>(null);
  const quotaTightnessRef = useRef<HTMLDivElement>(null);
  const quotaUseRef = useRef<HTMLDivElement>(null);
  const ukQuotaRef = useRef<HTMLDivElement>(null);
  const [worldReady, setWorldReady] = useState(false);
  const [mapMode, setMapMode] = useState<'partners' | 'remedy' | 'opportunity'>('partners');
  const [remedyOriginFilter, setRemedyOriginFilter] = useState<RemedyOriginFilter>('all');
  const themeKey = useThemeKey();
  const chartTheme = useMemo(() => chartThemeFromCss(), [themeKey]);

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
        setWorldReady(true);
      })
      .catch(() => {
        if (active) setWorldReady(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !worldReady) return;
    const chart = echarts.getInstanceByDom(mapRef.current) || echarts.init(mapRef.current);
    chart.setOption({
      tooltip: { trigger: 'item' },
      visualMap: { show: false, min: 0, max: 1, inRange: { color: [chartTheme.surface, chartTheme.surface] } },
      series: [{ name: '贸易伙伴世界分布', type: 'map', map: 'trade-world', roam: true, zoom: 1.05, emphasis: { label: { show: false }, itemStyle: { areaColor: chartTheme.lightBlue } }, itemStyle: { areaColor: chartTheme.surface, borderColor: chartTheme.grid, borderWidth: 0.7 }, data: [] }],
    });
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [chartTheme, worldReady]);

  useEffect(() => {
    if (!mapRef.current || !worldReady) return;
    const chart = echarts.getInstanceByDom(mapRef.current) || echarts.init(mapRef.current);
    const exportRows = steelExport?.default_view.partner || [];
    const allRemedyRows = tradeRemedy?.aggregates.country || [];
    const remedyRows = allRemedyRows.filter((row) => remedyOriginFilter === 'all' || (remedyOriginFilter === 'non-single' ? isNonSingleRemedyOrigin(row.name) : !isNonSingleRemedyOrigin(row.name)));
    const maxExport = Math.max(...exportRows.map((row) => row.qty_t), 1);
    const maxCases = Math.max(...allRemedyRows.map((row) => row.case_count), 1);
    const exportByName = new Map(exportRows.map((row) => [row.name, row]));
    const partnerMap = exportRows.filter((row) => row.world && row.qty_t > 0).map((row) => ({ name: row.world as string, value: row.qty_t, chineseName: row.name, detail: `出口量：${formatNumber(row.qty_t, 0)} 吨<br/>出口额：$${formatNumber(row.amount_usd, 0)}<br/>平均单价：$${formatNumber(row.avg_price_usd_t, 2)}/吨` }));
    const partnerSpecial = exportRows.filter((row) => row.special && row.qty_t > 0).map((row) => ({ name: row.name, value: [row.special?.lng, row.special?.lat, row.qty_t], chineseName: row.name, detail: `出口量：${formatNumber(row.qty_t, 0)} 吨<br/>出口额：$${formatNumber(row.amount_usd, 0)}<br/>平均单价：$${formatNumber(row.avg_price_usd_t, 2)}/吨` }));
    const remedyMap = remedyRows.filter((row) => remedyMapNames[row.name] && !remedySpecialPoints[row.name]).map((row) => ({ name: remedyMapNames[row.name], value: row.case_count, chineseName: row.name, detail: `案件：${row.case_count} 件<br/>反倾销：${row.anti_dumping} · 反补贴：${row.countervailing} · 保障措施：${row.safeguard}<br/>措施执行中：${row.measures_in_force} 件` }));
    const remedySpecial = remedyRows.filter((row) => remedySpecialPoints[row.name]).map((row) => ({ name: row.name, value: [...remedySpecialPoints[row.name], row.case_count], chineseName: row.name, detail: `案件：${row.case_count} 件<br/>反倾销：${row.anti_dumping} · 反补贴：${row.countervailing} · 保障措施：${row.safeguard}<br/>措施执行中：${row.measures_in_force} 件` }));
    const quotaRows = [
      ...(taricQuota?.eu ? [{ name: '欧盟', value: taricQuota.eu.summary.remaining_pct ?? 0, amount: taricQuota.eu.summary.balance_t, detail: `EU TARIC<br/>余额：${formatNumber(taricQuota.eu.summary.balance_t, 0)} 吨<br/>剩余比例：${taricQuota.eu.summary.remaining_pct?.toFixed(1) ?? '—'}%` }] : []),
      ...(taricQuota?.uk ? [{ name: '英国', value: taricQuota.uk.summary.remaining_pct ?? 0, amount: taricQuota.uk.summary.balance_t, detail: `UK 配额<br/>余额：${formatNumber(taricQuota.uk.summary.balance_t, 0)} 吨<br/>剩余比例：${taricQuota.uk.summary.remaining_pct?.toFixed(1) ?? '—'}%` }] : []),
    ];
    const assessment = quotaRows.map((quota) => {
      const country = quota.name;
      const remedy = allRemedyRows.find((row) => row.name === country);
      const exportRow = country === '欧盟'
        ? exportRows.filter((row) => row.region6 === '欧洲').reduce((sum, row) => ({ qty_t: sum.qty_t + row.qty_t }), { qty_t: 0 })
        : exportByName.get(country);
      const risk = remedy ? Math.min(100, remedy.case_count / maxCases * 60 + remedy.measures_in_force / Math.max(remedy.case_count, 1) * 40) : 0;
      const history = exportRow ? Math.min(100, Math.log1p(exportRow.qty_t) / Math.log1p(Math.max(...exportRows.map((row) => row.qty_t), 1)) * 100) : null;
      const score = history == null ? null : Number((0.4 * quota.value + 0.4 * (100 - risk) + 0.2 * history).toFixed(1));
      return { name: country, value: score, chineseName: country, detail: `综合适配度：${score == null ? '暂不可评估' : `${score} 分`}<br/>配额可用度：${quota.value.toFixed(1)}%<br/>贸易救济安全度：${(100 - risk).toFixed(1)} 分<br/>历史出口基础：${history == null ? '无匹配' : `${history.toFixed(1)} 分`}<br/>公式：40%配额 + 40%安全度 + 20%历史基础` };
    }).filter((row) => row.value != null);
    const activeMap = mapMode === 'partners' ? partnerMap : mapMode === 'remedy' ? remedyMap : [];
    const activeSpecial = mapMode === 'partners' ? partnerSpecial : mapMode === 'remedy' ? remedySpecial : assessment.map((row) => ({ name: row.name, value: [...(row.name === '英国' ? [-2, 54.5] : remedySpecialPoints.欧盟), row.value], chineseName: row.name, detail: row.detail }));
    const activeMax = mapMode === 'partners' ? maxExport : mapMode === 'remedy' ? maxCases : 100;
    const palette = mapMode === 'partners' ? ['#dcebf5', '#9fc7df', '#4b8fbd', '#1e5e91', '#0b3b68'] : mapMode === 'remedy' ? ['#fff0df', '#eeae61', '#c85b3d', '#8c2538'] : ['#edf0fa', '#a5acd9', '#6875b7', '#333b78'];
    const title = mapMode === 'partners' ? '贸易伙伴世界分布 · 出口量' : mapMode === 'remedy' ? '贸易救济案件世界分布 · 案件数' : '区域出口条件辅助评估 · 综合适配度';
    chart.setOption({
      tooltip: { trigger: 'item', formatter: (params: any) => `${params.data?.chineseName || params.name}<br/>${params.data?.detail || (params.value == null ? '暂无数据' : `数值：${params.value}`)}` },
      visualMap: { show: true, left: 18, bottom: 12, min: 0, max: activeMax, calculable: false, text: mapMode === 'partners' ? ['高出口量', '低出口量'] : mapMode === 'remedy' ? ['高案件数', '低案件数'] : ['高适配度', '低适配度'], textStyle: { color: chartTheme.text, fontSize: 12 }, inRange: { color: palette } },
      geo: { map: 'trade-world', roam: true, zoom: 1.05, itemStyle: { areaColor: chartTheme.surface, borderColor: chartTheme.grid, borderWidth: 0.7 }, emphasis: { label: { show: false }, itemStyle: { areaColor: chartTheme.orange } } },
      series: [{ name: title, type: 'map', map: 'trade-world', geoIndex: 0, emphasis: { label: { show: false } }, data: activeMap }, { name: '地区明细', type: 'scatter', coordinateSystem: 'geo', symbolSize: (value: number[]) => Math.max(9, Math.min(25, Math.sqrt(Math.max(1, Number(value[2] || value[0])) / Math.max(1, activeMax)) * 26)), itemStyle: { color: mapMode === 'remedy' ? '#bd4f3d' : mapMode === 'opportunity' ? '#525fae' : chartTheme.orange, borderColor: chartTheme.card, borderWidth: 1 }, label: { show: false }, emphasis: { label: { show: false }, itemStyle: { borderColor: chartTheme.text, borderWidth: 2 } }, data: activeSpecial }],
    }, true);
    return () => chart.dispose();
  }, [chartTheme, mapMode, remedyOriginFilter, steelExport, taricQuota, tradeRemedy, worldReady]);

  useEffect(() => {
    const charts = [trendRef.current, operationRef.current, costRef.current, fxRef.current]
      .filter((node): node is HTMLDivElement => Boolean(node))
      .map((node) => echarts.getInstanceByDom(node) || echarts.init(node));
    if (charts.length !== 4) return;

    const trendDates = [...new Set(quotes.map((quote) => quote.date.slice(0, 10)))].sort();
    const trendCodes = [...new Set(quotes.map((quote) => quote.indicator_code))]
      .sort((a, b) => quotes.filter((quote) => quote.indicator_code === b).length - quotes.filter((quote) => quote.indicator_code === a).length)
      .slice(0, 4);
    const trendSeries = trendCodes.map((code) => {
      const codeQuotes = quotes.filter((quote) => quote.indicator_code === code);
      const firstValue = codeQuotes.find((quote) => quote.value > 0)?.value || 1;
      const seriesQuotes = new Map(codeQuotes.map((quote) => [quote.date.slice(0, 10), Number((quote.value / firstValue * 100).toFixed(1))]));
      return {
        name: indicatorChinese[code] || humanizeDisplay(code),
        type: 'line' as const,
        smooth: true,
        showSymbol: false,
        data: trendDates.map((date) => seriesQuotes.get(date) ?? null),
      };
    });

    const chartTheme = chartThemeFromCss();
    const chartText = chartTheme.text;
    const chartGrid = chartTheme.grid;
    const chartBlue = chartTheme.blue;
    const chartBlueLight = chartTheme.lightBlue;
    const chartOrange = chartTheme.orange;
    const chartRed = chartTheme.red;
    charts[0].setOption({
      color: [chartBlue, chartBlueLight, chartOrange, chartTheme.green],
      grid: { left: 48, right: 18, top: 30, bottom: 34, containLabel: true },
      tooltip: { trigger: 'axis' },
      legend: { top: 0, type: 'scroll', textStyle: { color: chartText, fontSize: 13 } },
      xAxis: { type: 'category', data: trendDates, axisLabel: { color: chartText, fontSize: 13 }, axisLine: { lineStyle: { color: chartGrid } } },
      yAxis: { type: 'value', name: '基期=100', nameTextStyle: { color: chartText, fontSize: 13 }, axisLabel: { color: chartText, fontSize: 13 }, splitLine: { lineStyle: { color: chartGrid } } },
      series: trendSeries,
    });

    const operationGroups = new Map<string, { volume: number; target: number }>();
    scopedAggregates(aggregates).forEach((item) => {
      const key = productChinese[item.product_grade || ''] || regionChinese[item.region] || item.region;
      const current = operationGroups.get(key) || { volume: 0, target: 0 };
      current.volume += item.volume_t;
      current.target += item.target_volume_t || 0;
      operationGroups.set(key, current);
    });
    const operationData = [...operationGroups.entries()].slice(0, 8).map(([name, item]) => ({ name, value: item.target ? Number((item.volume / item.target * 100).toFixed(1)) : 0 }));
    charts[1].setOption({
      grid: { left: 44, right: 18, top: 18, bottom: 28, containLabel: true },
      tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0]?.name}<br/>目标完成：${params[0]?.value ?? 0}%` },
      xAxis: { type: 'category', data: operationData.map((item) => item.name), axisLabel: { color: chartText, fontSize: 13, rotate: operationData.length > 4 ? 28 : 0 }, axisLine: { lineStyle: { color: chartGrid } } },
      yAxis: { type: 'value', max: 120, axisLabel: { color: chartText, fontSize: 13, formatter: '{value}%' }, splitLine: { lineStyle: { color: chartGrid } } },
      series: [{ type: 'bar', barWidth: '46%', data: operationData.map((item) => item.value), itemStyle: { color: chartBlueLight }, label: { show: true, position: 'top', color: chartText, fontSize: 13, formatter: '{c}%' } }],
    });

    const costGroups = new Map<string, number>();
    latestCostScenario(costs).forEach((item) => costGroups.set(item.component_code, (costGroups.get(item.component_code) || 0) + item.value_per_ton));
    const costData = [...costGroups.entries()].map(([code, value]) => ({ name: costComponentChinese[code] || humanizeDisplay(code), value: Number(value.toFixed(2)) }));
    charts[2].setOption({
      color: [chartBlue, chartOrange, chartTheme.green, chartTheme.purple, chartTheme.lightBlue, chartRed],
      tooltip: { trigger: 'item', formatter: '{b}<br/>金额：{c}<br/>占比：{d}%' },
      legend: { bottom: 0, type: 'scroll', textStyle: { color: chartText, fontSize: 13 } },
      series: [{ type: 'pie', radius: ['38%', '67%'], center: ['50%', '44%'], itemStyle: { borderColor: chartTheme.card, borderWidth: 2 }, label: { color: chartText, fontSize: 13, formatter: '{b}\n{d}%' }, data: costData }],
    });

    const fxData = scenarios.map((scenario) => ({
      name: scenarioChinese(scenario.scenario_name),
      value: Number(scenario.scenario_rate.toFixed(4)),
      pct: scenario.scenario_pct,
    }));
    charts[3].setOption({
      grid: { left: 48, right: 18, top: 18, bottom: 42, containLabel: true },
      tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0]?.name}<br/>汇率：${params[0]?.value}<br/>情景变化：${fxData[params[0]?.dataIndex]?.pct ?? 0}%` },
      xAxis: { type: 'value', name: '汇率', axisLabel: { color: chartText, fontSize: 13 }, splitLine: { lineStyle: { color: chartGrid } } },
      yAxis: { type: 'category', inverse: true, data: fxData.map((item) => item.name), axisLabel: { color: chartText, fontSize: 12, width: 96, overflow: 'truncate' }, axisLine: { lineStyle: { color: chartGrid } } },
      dataZoom: [{ type: 'slider', yAxisIndex: 0, start: 0, end: Math.min(100, fxData.length > 12 ? 46 : 100), right: 2, width: 10, borderColor: 'transparent', fillerColor: chartBlue, handleStyle: { color: chartBlue } }, { type: 'inside', yAxisIndex: 0, start: 0, end: 100 }],
      series: [{ type: 'bar', barWidth: '58%', data: fxData.map((item) => ({ value: item.value, itemStyle: { color: item.pct < 0 ? chartOrange : chartBlue } })), label: { show: true, position: 'right', color: chartText, fontSize: 12, formatter: '{c}' } }],
    });

    const handleResize = () => charts.forEach((chart) => chart.resize());
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      charts.forEach((chart) => chart.dispose());
    };
  }, [aggregates, costs, quotes, scenarios, themeKey]);

  useEffect(() => {
    if (!taricQuota || !quotaTrendRef.current || !quotaRankRef.current || !quotaMixRef.current || !quotaTightnessRef.current || !quotaUseRef.current) return;
    const chartTheme = chartThemeFromCss();
    const trend = echarts.init(quotaTrendRef.current); const rank = echarts.init(quotaRankRef.current); const mix = echarts.init(quotaMixRef.current); const tightness = echarts.init(quotaTightnessRef.current); const use = echarts.init(quotaUseRef.current);
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
  }, [taricQuota, themeKey]);

  useEffect(() => {
    if (!taricQuota?.uk || !ukQuotaRef.current) return;
    const chartTheme = chartThemeFromCss(); const chart = echarts.init(ukQuotaRef.current); const history = taricQuota.uk.history;
    chart.setOption({ color: [chartTheme.blue, chartTheme.orange], grid: { left: 54, right: 50, top: 30, bottom: 34, containLabel: true }, tooltip: { trigger: 'axis', formatter: (params: any) => { const row = history[params[0]?.dataIndex]; return `${row?.date}<br/>当前余额：${formatNumber(row?.balance_t || 0, 0)} 吨<br/>剩余比例：${row?.remaining_pct?.toFixed?.(1) ?? '—'}%`; } }, legend: { top: 0, textStyle: { color: chartTheme.text, fontSize: 12 } }, xAxis: { type: 'category', data: history.map((row) => row.date.slice(5)), axisLabel: { color: chartTheme.text, fontSize: 12, interval: Math.max(0, Math.ceil(history.length / 8) - 1) } }, yAxis: [{ type: 'value', name: '余额（吨）', axisLabel: { color: chartTheme.text, fontSize: 12 }, splitLine: { lineStyle: { color: chartTheme.grid } } }, { type: 'value', name: '剩余比例', min: 0, max: 100, axisLabel: { color: chartTheme.text, fontSize: 12, formatter: '{value}%' }, splitLine: { show: false } }], series: [{ name: '当前余额', type: 'line', smooth: true, data: history.map((row) => row.balance_t), areaStyle: { opacity: .1 } }, { name: '剩余比例', type: 'line', smooth: true, yAxisIndex: 1, data: history.map((row) => row.remaining_pct == null ? null : row.remaining_pct), lineStyle: { type: 'dashed', opacity: .55 }, symbol: 'none' }] });
    const resize = () => chart.resize(); window.addEventListener('resize', resize); return () => { window.removeEventListener('resize', resize); chart.dispose(); };
  }, [taricQuota, themeKey]);

  useEffect(() => {
    if (!steelExport || !exportTrendRef.current || !exportRankRef.current) return;
    const exportTheme = chartThemeFromCss();
    const trendChart = echarts.getInstanceByDom(exportTrendRef.current) || echarts.init(exportTrendRef.current);
    const rankChart = echarts.getInstanceByDom(exportRankRef.current) || echarts.init(exportRankRef.current);
    const exportView = steelExport.default_view;
    const months = exportView.monthly;
    trendChart.setOption({
      color: [exportTheme.blue, exportTheme.orange],
      grid: { left: 54, right: 20, top: 24, bottom: 38, containLabel: true },
      tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0]?.axisValue}<br/>出口量：${formatNumber(months[params[0]?.dataIndex]?.qty_t || 0, 0)} 吨<br/>出口均价：$${formatNumber(months[params[0]?.dataIndex]?.avg_price_usd_t || 0, 2)}/吨` },
      legend: { top: 0, textStyle: { color: exportTheme.text, fontSize: 13 } },
      xAxis: { type: 'category', data: months.map((row) => row.label), axisLabel: { color: exportTheme.text, fontSize: 13, rotate: months.length > 12 ? 35 : 0 } },
      yAxis: [{ type: 'value', name: '出口量（吨）', axisLabel: { color: exportTheme.text, fontSize: 13 }, splitLine: { lineStyle: { color: exportTheme.grid } } }, { type: 'value', name: '美元/吨', axisLabel: { color: exportTheme.text, fontSize: 13 }, splitLine: { show: false } }],
      series: [{ name: '出口量', type: 'bar', data: months.map((row) => row.qty_t), barMaxWidth: 24 }, { name: '出口均价', type: 'line', yAxisIndex: 1, data: months.map((row) => row.avg_price_usd_t), smooth: true, symbol: 'none' }],
    }, true);
    const top = exportView.partner.slice(0, 10).reverse();
    rankChart.setOption({
      grid: { left: 72, right: 26, top: 16, bottom: 28, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => `${params[0]?.name}<br/>出口量：${formatNumber(params[0]?.value || 0, 0)} 吨<br/>均价：$${formatNumber(top[params[0]?.dataIndex]?.avg_price_usd_t || 0, 2)}/吨` },
      xAxis: { type: 'value', axisLabel: { color: exportTheme.text, fontSize: 13 }, splitLine: { lineStyle: { color: exportTheme.grid } } },
      yAxis: { type: 'category', data: top.map((row) => row.label), axisLabel: { color: exportTheme.text, fontSize: 13 } },
      series: [{ type: 'bar', data: top.map((row) => row.qty_t), barMaxWidth: 20, itemStyle: { color: exportTheme.blue }, label: { show: true, position: 'right', color: exportTheme.text, fontSize: 12, formatter: (params: any) => `${formatNumber(params.value / 10000, 1)} 万吨` } }],
    }, true);
    const resize = () => { trendChart.resize(); rankChart.resize(); };
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); trendChart.dispose(); rankChart.dispose(); };
  }, [steelExport, themeKey]);

  return (
    <div className="objective-charts" aria-label="客观信息图表">
      <article className="objective-chart-card map-card export-map-card"><div className="objective-chart-heading"><div><strong>{mapMode === 'partners' ? '贸易伙伴世界分布' : mapMode === 'remedy' ? '出口贸易救济案件分布' : '区域出口条件辅助评估'}</strong><small>{mapMode === 'partners' ? 'Trade partners · 中国海关钢材出口量' : mapMode === 'remedy' ? `Trade remedies · ${tradeRemedy?.summary.total_cases || 0} 条全量钢材案件` : 'Opportunity · 配额 × 贸易救济安全度 × 历史出口基础'}</small></div><div className="map-mode-switch" role="tablist" aria-label="地图分析视图">{([['partners', '贸易伙伴'], ['remedy', '贸易救济'], ['opportunity', '出口条件评估']] as const).map(([mode, label]) => <button key={mode} type="button" className={mapMode === mode ? 'is-active' : ''} onClick={() => setMapMode(mode)} role="tab" aria-selected={mapMode === mode}>{label}</button>)}</div></div><div className="map-toolbar"><span>{mapMode === 'partners' ? `海关出口快照 · ${steelExport ? `${steelExport.default_view.filter.year}年${steelExport.default_view.filter.kind}` : '待接入'}` : mapMode === 'remedy' ? `源站更新 ${tradeRemedy?.source.generated_at || '—'} · ${remedyOriginFilter === 'all' ? tradeRemedy?.summary.total_cases || 0 : tradeRemedy?.cases.filter((item) => remedyOriginFilter === 'non-single' ? isNonSingleRemedyOrigin(item.country) : !isNonSingleRemedyOrigin(item.country)).length || 0} 条案件` : '仅对同时具备配额、案件与历史出口匹配的地区计算'}<span className="map-zoom-note">支持缩放 / 拖拽 / 悬停查看明细</span></span>{mapMode === 'remedy' && <div className="remedy-origin-switch" role="group" aria-label="贸易救济发起方筛选">{([['all', '全部发起方'], ['single', '单一国家/地区'], ['non-single', '非单一国家/区域组织']] as const).map(([filter, label]) => <button key={filter} type="button" className={remedyOriginFilter === filter ? 'is-active' : ''} onClick={() => setRemedyOriginFilter(filter)}>{label}</button>)}</div>}</div><div className="objective-map-wrap"><div ref={mapRef} className="objective-chart map-main-chart" />{!worldReady && <div className="map-status">地图资源加载失败</div>}{mapMode === 'partners' && !steelExport && <div className="map-data-note">出口快照未接入，当前仅展示底图</div>}{mapMode === 'remedy' && !tradeRemedy && <div className="map-data-note">贸易救济快照未接入，无法绘制案件分布</div>}{mapMode === 'remedy' && tradeRemedy && remedyOriginFilter === 'non-single' && !tradeRemedy.cases.some((item) => isNonSingleRemedyOrigin(item.country)) && <div className="map-data-note">当前快照没有匹配的区域组织发起案件</div>}{mapMode === 'opportunity' && (!tradeRemedy || !taricQuota || !steelExport) && <div className="map-data-note">综合评估需要案件、配额和历史出口三类快照同时可用</div>}</div>{mapMode === 'partners' && advice.find((item) => item.id === 'export-market') && <DataAdviceCard advice={advice.find((item) => item.id === 'export-market')} compact />}{mapMode === 'opportunity' && <div className="map-method-note">公式：综合适配度 = 40% × 配额可用度 + 40% × 贸易救济安全度 + 20% × 历史出口基础。缺少匹配数据时不以 0 分代替。</div>}</article>
      {steelExport && <><article className="objective-chart-card export-trend-card"><div className="objective-chart-heading"><strong>出口规模与均价趋势</strong><small>Customs export · {steelExport.default_view.filter.year}年{steelExport.default_view.filter.kind} · 月度出口量 × 加权均价</small></div><div ref={exportTrendRef} className="objective-chart export-chart" /></article><article className="objective-chart-card export-rank-card"><div className="objective-chart-heading"><strong>主要贸易伙伴排名</strong><small>Top 10 · {steelExport.default_view.filter.year}年{steelExport.default_view.filter.kind}累计出口量</small></div><div ref={exportRankRef} className="objective-chart export-chart" /></article></>}
      <article className="objective-chart-card trend-card"><div className="objective-chart-heading"><strong>外部行情走势</strong><small>Market trend · 基期=100，避免混合单位误读</small></div><div ref={trendRef} className="objective-chart" />{advice.find((item) => item.id === 'steel-price') && <DataAdviceCard advice={advice.find((item) => item.id === 'steel-price')} compact />}</article>
      <article className="objective-chart-card"><div className="objective-chart-heading"><strong>经营目标完成</strong><small>Target progress · InternalAggregate</small></div><div ref={operationRef} className="objective-chart" />{advice.find((item) => item.id === 'target') && <DataAdviceCard advice={advice.find((item) => item.id === 'target')} compact />}</article>
      <article className="objective-chart-card"><div className="objective-chart-heading"><strong>单位成本构成</strong><small>Cost mix · 最新同场景 ProductCost</small></div><div ref={costRef} className="objective-chart" />{advice.find((item) => item.id === 'cost-floor') && <DataAdviceCard advice={advice.find((item) => item.id === 'cost-floor')} compact />}</article>
      <article className="objective-chart-card fx-scenario-card"><div className="objective-chart-heading"><strong>汇率情景区间</strong><small>FX scenarios · FxScenario</small></div><div ref={fxRef} className="objective-chart" />{advice.find((item) => item.id === 'fx-terms') && <DataAdviceCard advice={advice.find((item) => item.id === 'fx-terms')} compact />}</article>
      {taricQuota && <><article className="objective-chart-card quota-wide"><div className="objective-chart-heading"><strong>EU 配额余额趋势</strong><small>EU TARIC · {taricQuota.eu?.as_of || taricQuota.latest.as_of} · 单位：吨</small></div><div ref={quotaTrendRef} className="objective-chart quota-chart" />{(advice.find((item) => item.id === 'eu-quota') || advice.find((item) => item.id === 'eu-quota-monitor')) && <DataAdviceCard advice={advice.find((item) => item.id === 'eu-quota') || advice.find((item) => item.id === 'eu-quota-monitor')} compact />}</article><article className="objective-chart-card quota-rank"><div className="objective-chart-heading"><strong>EU Code 配额规模</strong><small>初始配额排名 · Top 10</small></div><div ref={quotaRankRef} className="objective-chart quota-chart" /></article><article className="objective-chart-card quota-mix"><div className="objective-chart-heading"><strong>EU 配额状态构成</strong><small>互斥状态 · Code 数量</small></div><div ref={quotaMixRef} className="objective-chart quota-chart" /></article><article className="objective-chart-card quota-rank"><div className="objective-chart-heading"><strong>EU 配额紧张度</strong><small>剩余比例最低 · Top 10</small></div><div ref={quotaTightnessRef} className="objective-chart quota-chart" /></article><article className="objective-chart-card quota-wide"><div className="objective-chart-heading"><strong>EU 初始 / 已用 / 余额</strong><small>同一最新快照 · Top 10</small></div><div ref={quotaUseRef} className="objective-chart quota-chart" /></article>{taricQuota.uk && <article className="objective-chart-card quota-wide"><div className="objective-chart-heading"><strong>UK 关税配额余额趋势</strong><small>独立来源 · {taricQuota.uk.as_of} · 订单 {taricQuota.uk.rows[0]?.order_number || '—'}</small></div><div ref={ukQuotaRef} className="objective-chart quota-chart" />{advice.find((item) => item.id === 'uk-quota') && <DataAdviceCard advice={advice.find((item) => item.id === 'uk-quota')} compact />}</article>}</>}
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
    const green = '#1b9b6f';
    const lineColors = [blue, lightBlue, orange, green, '#7b6cae', '#bd3f4d'];

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
    <section className="shipping-index-panel" aria-label="航运指数核心数据">
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
  const riskRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const backtestRef = useRef<HTMLDivElement>(null);
  const [horizon, setHorizon] = useState<30 | 60 | 90>(60);
  const [expandedFx, setExpandedFx] = useState(false);
  const themeKey = useThemeKey();

  useEffect(() => {
    const nodes = [dxyRef.current, eurRef.current, cnyRef.current, yieldRef.current, riskRef.current, scoreRef.current, backtestRef.current];
    const charts = new Map<number, echarts.ECharts>();
    nodes.forEach((node, index) => {
      const visible = index > 2 || expandedFx;
      if (node && visible) charts.set(index, echarts.getInstanceByDom(node) || echarts.init(node));
    });
    const chartAt = (index: number) => charts.get(index);
    if (![3, 4, 5, 6].every((index) => chartAt(index))) return;
    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue('--text-secondary').trim() || '#526274';
    const grid = styles.getPropertyValue('--border-default').trim() || '#dce5ee';
    const blue = '#3478b9';
    const orange = '#d88935';
    const green = '#1b9b6f';
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
    const riskRows = [['EUR', forex.risk.EUR], ['CNY', forex.risk.CNY], ['USD', forex.risk.USD]] as const;
    chartAt(4)?.setOption({ color: [blue, red, gray], grid: { left: 74, right: 26, top: 22, bottom: 32, containLabel: true }, tooltip: { trigger: 'axis' }, xAxis: { type: 'value', name: '百分比', ...baseAxis, splitLine: { lineStyle: { color: grid } } }, yAxis: { type: 'category', data: riskRows.map(([key]) => key), ...baseAxis }, series: [{ name: '历史波动率', type: 'bar', data: riskRows.map(([, row]) => row.volatility_pct), itemStyle: { color: (params: any) => riskRows[params.dataIndex][0] === 'USD' ? gray : blue } }, { name: '最大回撤（绝对值）', type: 'bar', data: riskRows.map(([, row]) => Math.abs(row.max_drawdown_pct)), itemStyle: { color: red } }] }, true);
    const scores = [{ name: 'EUR', conservative: forex.risk.EUR.score_conservative ?? 0, aggressive: forex.risk.EUR.score_aggressive ?? 0 }, { name: 'CNY', conservative: forex.risk.CNY.score_conservative ?? 0, aggressive: forex.risk.CNY.score_aggressive ?? 0 }, { name: 'USD', conservative: 0, aggressive: 0 }];
    chartAt(5)?.setOption({ color: [green, orange], grid: { left: 74, right: 26, top: 22, bottom: 32, containLabel: true }, tooltip: { trigger: 'axis' }, legend: { top: 0, textStyle: { color: text, fontSize: 13 } }, xAxis: { type: 'value', name: '综合得分', ...baseAxis, splitLine: { lineStyle: { color: grid } } }, yAxis: { type: 'category', data: scores.map((row) => row.name), ...baseAxis }, series: [{ name: '保守模式 λ=2', type: 'bar', data: scores.map((row) => ({ value: row.conservative, itemStyle: { color: row.conservative >= 0 ? green : red } })) }, { name: '激进模式 λ=0.8', type: 'bar', data: scores.map((row) => ({ value: row.aggressive, itemStyle: { color: row.aggressive >= 0 ? green : red } })) }] }, true);
    const tests = forex.backtests[String(horizon) as '30' | '60' | '90'];
    const boxStats = (rows: Array<{ return_pct: number }>) => { const values = rows.map((row) => row.return_pct).filter(Number.isFinite).sort((a, b) => a - b); if (!values.length) return [null, null, null, null, null]; const q = (ratio: number) => values[Math.floor((values.length - 1) * ratio)]; return [q(0), q(.25), q(.5), q(.75), q(1)]; };
    const box = [['EUR', boxStats(tests.EUR)], ['CNY', boxStats(tests.CNY)], ['USD', boxStats(tests.USD)]] as const;
    const loss = tests.loss_probability_pct || { EUR: 0, CNY: 0, USD: 0 };
    chartAt(6)?.setOption({ color: [blue, orange, gray], grid: { left: 54, right: 20, top: 24, bottom: 36, containLabel: true }, tooltip: { trigger: 'item', formatter: (params: any) => `${params.name}<br/>最小：${params.value?.[0]?.toFixed?.(2) ?? '—'}%<br/>Q1：${params.value?.[1]?.toFixed?.(2) ?? '—'}%<br/>中位数：${params.value?.[2]?.toFixed?.(2) ?? '—'}%<br/>Q3：${params.value?.[3]?.toFixed?.(2) ?? '—'}%<br/>最大：${params.value?.[4]?.toFixed?.(2) ?? '—'}%<br/>亏损概率：${loss[params.name as 'EUR' | 'CNY' | 'USD']?.toFixed?.(1) ?? '—'}%` }, xAxis: { type: 'category', data: box.map(([name]) => name), ...baseAxis }, yAxis: { type: 'value', name: '到期相对收益（%）', ...baseAxis, splitLine: { lineStyle: { color: grid } } }, series: [{ type: 'boxplot', data: box.map(([name, stats], index) => ({ name, value: stats, itemStyle: { borderColor: [blue, orange, gray][index], color: `${[blue, orange, gray][index]}33` } })) }] }, true);
    const resize = () => charts.forEach((chart) => chart.resize()); window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); charts.forEach((chart) => chart.dispose()); };
  }, [forex, horizon, themeKey, expandedFx]);

  const latestEUR = forex.latest_independent?.EURUSD || forex.symbols.EURUSD[forex.symbols.EURUSD.length - 1];
  const latestCNY = forex.latest_independent?.USDCNY || forex.symbols.USDCNY[forex.symbols.USDCNY.length - 1];
  const latestDXY = forex.latest_independent?.DINIW || forex.symbols.DINIW[forex.symbols.DINIW.length - 1];
  const displayRate = (point?: { close: number }) => point && Number.isFinite(point.close) ? point.close.toFixed(4) : '—';
  const displayPercentile = (point?: { percentile: number }) => point && Number.isFinite(point.percentile) ? point.percentile.toFixed(1) : '—';
  const displaySigned = (value?: number) => value == null || !Number.isFinite(value) ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  const selectedLoss = forex.backtests[String(horizon) as '30' | '60' | '90'].loss_probability_pct;
  return <section className="forex-panel" aria-label="外汇汇率分析">
    <div className="section-heading"><div><span className="section-index">FX</span><h2>外汇与签约币种</h2></div><p>近12个月历史统计 · 不构成预测</p></div>
    <div className="forex-kpis"><div><span>DXY 美元指数</span><strong>{displayRate(latestDXY)}</strong><small>{latestDXY?.date || '暂无日期'} · 宏观参考</small></div><div><span>EURUSD 欧元兑美元</span><strong className="forex-eur">{displayRate(latestEUR)}</strong><small>历史分位 {displayPercentile(latestEUR)}%</small></div><div><span>USDCNY 美元兑人民币</span><strong className="forex-cny">{displayRate(latestCNY)}</strong><small>历史分位 {displayPercentile(latestCNY)}%</small></div><div><span>数据区间</span><strong>{forex.source.observation_count} 日</strong><small>{forex.source.coverage_start} 至 {forex.source.coverage_end}</small></div></div>
    <div className="forex-insight-strip"><div><span>EUR计价相对收益</span><strong className={forex.risk.EUR.current_relative_yield_pct >= 0 ? 'is-positive' : 'is-negative'}>{displaySigned(forex.risk.EUR.current_relative_yield_pct)}</strong><small>对比直接 USD 签约</small></div><div><span>CNY计价相对收益</span><strong className={forex.risk.CNY.current_relative_yield_pct >= 0 ? 'is-positive' : 'is-negative'}>{displaySigned(forex.risk.CNY.current_relative_yield_pct)}</strong><small>对比直接 USD 签约</small></div><div><span>综合评分</span><strong>{`保守 ${forex.risk.EUR.score_conservative == null ? '—' : forex.risk.EUR.score_conservative.toFixed(2)} / ${forex.risk.CNY.score_conservative == null ? '—' : forex.risk.CNY.score_conservative.toFixed(2)}`}</strong><small>EUR / CNY · λ=2</small></div><div><span>{horizon}天账期亏损概率</span><strong>{`EUR ${selectedLoss?.EUR == null ? '—' : selectedLoss.EUR.toFixed(1)}% · CNY ${selectedLoss?.CNY == null ? '—' : selectedLoss.CNY.toFixed(1)}%`}</strong><small>历史回测，不代表预测</small></div></div>
    <div className="forex-chart-grid"><div className="forex-chart-toggle-row"><button type="button" className="forex-chart-toggle" onClick={() => setExpandedFx((current) => !current)} aria-expanded={expandedFx}>{expandedFx ? '收起行情图表' : '展开行情图表'}</button></div>{expandedFx && <><article className="forex-chart-card forex-wide"><div className="analysis-chart-heading"><strong>DXY 美元指数</strong><small>宏观背景参考 · {latestDXY?.date || '暂无日期'}</small></div><div ref={dxyRef} className="forex-chart" /></article><article className="forex-chart-card"><div className="analysis-chart-heading"><strong>EURUSD 欧元兑美元</strong><small>价格 · MA20 / MA60 · 25/50/75%分位 · 20日动量</small></div><div ref={eurRef} className="forex-chart" /></article><article className="forex-chart-card"><div className="analysis-chart-heading"><strong>USDCNY 美元兑人民币</strong><small>价格 · MA20 / MA60 · 25/50/75%分位 · 20日动量</small></div><div ref={cnyRef} className="forex-chart" /></article></>}<article className="forex-chart-card forex-wide"><div className="analysis-chart-heading"><strong>等价美元相对收益</strong><small>固定 100 万美元基准 · 0轴=USD计价</small></div><div ref={yieldRef} className="forex-chart" /></article><article className="forex-chart-card"><div className="analysis-chart-heading"><strong>收益风险概览</strong><small>波动率与最大历史回撤</small></div><div ref={riskRef} className="forex-chart" /></article><article className="forex-chart-card"><div className="analysis-chart-heading"><strong>收益-风险综合评分</strong><small>保守 λ=2 · 激进 λ=0.8</small></div><div ref={scoreRef} className="forex-chart" /></article><article className="forex-chart-card forex-wide"><div className="analysis-chart-heading"><strong>账期回测收益分布</strong><div className="forex-horizon"><span>账期</span>{([30, 60, 90] as const).map((days) => <button key={days} className={horizon === days ? 'is-active' : ''} onClick={() => setHorizon(days)}>{days}天</button>)}</div></div><div ref={backtestRef} className="forex-chart" /></article></div>
  </section>;
}

interface AnalysisChartProps {
  title: string;
  subtitle: string;
  option: echarts.EChartsOption;
  className?: string;
  onPointClick?: (index: number) => void;
  emptyMessage?: string;
}

interface PolicyTimelineProps {
  policies: PolicyEvent[];
}

function PolicyTimeline({ policies }: PolicyTimelineProps) {
  const periods = useMemo(() => {
    const grouped = new Map<string, PolicyEvent[]>();
    policies.forEach((policy) => {
      const period = policy.publish_date?.slice(0, 7) || '未标注时间';
      grouped.set(period, [...(grouped.get(period) || []), policy]);
    });
    return [...grouped.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([period, events]) => ({
        period,
        events: [...events].sort((a, b) => b.severity - a.severity || b.publish_date.localeCompare(a.publish_date)),
        highCount: events.filter((event) => event.severity >= 6).length,
        maxSeverity: Math.max(...events.map((event) => event.severity), 0),
      }));
  }, [policies]);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const activePeriod = periods.find((period) => period.period === expandedPeriod) || null;

  if (!periods.length) return <div className="analysis-chart-empty">当前筛选范围暂无政策事件</div>;

  return (
    <div className="policy-timeline" aria-label="政策事件时间线">
      <div className="policy-timeline-head">
        <div>
          <strong>按发布日期查看政策事件</strong>
          <span>共 {policies.length} 条 · 高度关注及以上 {periods.reduce((sum, period) => sum + period.highCount, 0)} 条</span>
        </div>
        <span className="policy-timeline-hint">点击时间节点展开明细</span>
      </div>
      <div className="policy-timeline-track" role="list">
        {periods.map((period, index) => {
          const expanded = expandedPeriod === period.period;
          return (
            <div className={`policy-timeline-node ${expanded ? 'is-expanded' : ''}`} key={period.period} role="listitem">
              <button
                type="button"
                className="policy-timeline-node-button"
                onClick={() => setExpandedPeriod((current) => current === period.period ? null : period.period)}
                aria-expanded={expanded}
                aria-controls={`policy-period-${period.period}`}
              >
                <span className="policy-timeline-dot" aria-hidden="true" />
                <span className="policy-timeline-period">{period.period === '未标注时间' ? period.period : `${period.period.slice(0, 4)}年${Number(period.period.slice(5))}月`}</span>
                <strong>{period.events.length} 条</strong>
                <small>{period.highCount ? `${period.highCount} 条高度关注` : '暂无高度关注'} · 最高 {period.maxSeverity}/10</small>
                <span className="policy-timeline-chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
              </button>
              {index < periods.length - 1 && <span className="policy-timeline-connector" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      {activePeriod && (
        <div className="policy-timeline-detail" id={`policy-period-${activePeriod.period}`}>
          <div className="policy-timeline-detail-head">
            <div><strong>{activePeriod.period === '未标注时间' ? activePeriod.period : `${activePeriod.period.slice(0, 4)}年${Number(activePeriod.period.slice(5))}月政策事件`}</strong><span>按严重程度由高到低排列 · 点击来源可追溯原始页面</span></div>
            <button type="button" onClick={() => setExpandedPeriod(null)}>收起</button>
          </div>
          <div className="policy-event-list">
            {activePeriod.events.map((policy) => (
              <article className={`policy-event-item ${policy.severity >= 8 ? 'is-critical' : policy.severity >= 6 ? 'is-high' : ''}`} key={policy.event_id}>
                <div className="policy-event-top">
                  <div><span className="policy-event-type">{policyChinese[policy.event_type] || '贸易政策'}</span><strong>{policyTitleChinese[policy.title] || policy.title}</strong><small>{policy.title}</small></div>
                  <span className={`policy-severity severity-${policy.severity >= 8 ? 'critical' : policy.severity >= 6 ? 'high' : 'normal'}`}>{policySeverityLabel(policy.severity)} · {policy.severity}/10</span>
                </div>
                <p>{policy.summary}</p>
                <div className="policy-event-meta"><span>发布 {formatDate(policy.publish_date)}</span>{policy.effective_date && <span>生效 {formatDate(policy.effective_date)}</span>}{policy.expiry_date && <span>到期 {formatDate(policy.expiry_date)}</span>}<span>发布方 {policy.issuer}</span><span>适用 {policy.country_region}</span><span>状态 {policyVerifyLabel(policy.verify_status)}</span>{policy.product_scope?.length ? <span>品类 {policy.product_scope.join('、')}</span> : null}{policy.source_url && <a href={policy.source_url} target="_blank" rel="noreferrer">查看来源 ↗</a>}</div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisChart({ title, subtitle, option, className = '', onPointClick, emptyMessage }: AnalysisChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (emptyMessage || !chartRef.current) return;
    const chart = echarts.getInstanceByDom(chartRef.current) || echarts.init(chartRef.current);
    chart.setOption(option, true);
    const handlePointClick = (params: any) => onPointClick?.(typeof params.dataIndex === 'number' ? params.dataIndex : 0);
    if (onPointClick) chart.on('click', handlePointClick);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (onPointClick) chart.off('click', handlePointClick);
      chart.dispose();
    };
  }, [emptyMessage, onPointClick, option]);

  return (
    <article className={`analysis-chart-card ${className}`}>
      <div className="analysis-chart-heading"><strong>{title}</strong><small>{subtitle}</small></div>
      {emptyMessage ? <div className="analysis-chart-empty">{emptyMessage}</div> : <div ref={chartRef} className="analysis-chart" />}
    </article>
  );
}

export function UnifiedAnalysis() {
  const { state, dispatch } = useAppContext();
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [aggregates, setAggregates] = useState<InternalAggregate[]>([]);
  const [costs, setCosts] = useState<ProductCost[]>([]);
  const [scenarios, setScenarios] = useState<FxScenario[]>([]);
  const [policies, setPolicies] = useState<PolicyEvent[]>([]);
  const [signals, setSignals] = useState<RiskSignal[]>([]);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'全部' | ObjectiveKind>('全部');
  const [priorityFilter, setPriorityFilter] = useState<'全部' | ObjectivePriority>('全部');
  const [searchOpen, setSearchOpen] = useState(false);
  const [objectiveDetailsOpen, setObjectiveDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [steelExport, setSteelExport] = useState<SteelExportSnapshot | null>(null);
  const [forex, setForex] = useState<ForexSnapshot | null>(null);
  const [taricQuota, setTaricQuota] = useState<TaricQuotaSnapshot | null>(null);
  const [tradeRemedy, setTradeRemedy] = useState<TradeRemedySnapshot | null>(null);
  const [shippingIndices, setShippingIndices] = useState<ShippingIndexSnapshot | null>(null);
  const [syncStatus, setSyncStatus] = useState<Awaited<ReturnType<typeof loadStrategyData>>['syncStatus']>(null);
  const [analysisAdvice, setAnalysisAdvice] = useState<DataDrivenAdvice[]>([]);

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
    ])
      .then(([nextQuotes, nextAggregates, nextCosts, nextScenarios, nextPolicies, nextSignals, nextSteelExport, nextForex, nextTaricQuota, nextTradeRemedy, nextShippingIndices, nextSyncStatus]) => {
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
        setSyncStatus(nextSyncStatus);
        setAnalysisAdvice(buildDataDrivenAdvice({ quotes: nextQuotes, risks: nextSignals, policies: nextPolicies, aggregates: nextAggregates, costs: nextCosts, fxScenarios: nextScenarios, steelExport: nextSteelExport, forex: nextForex, taricQuota: nextTaricQuota, shippingIndices: nextShippingIndices, syncStatus: nextSyncStatus }));
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

  const objectiveItems = useMemo<ObjectiveItem[]>(() => {
    const quoteItems = quotes.map((quote) => {
      const change = quoteChange(quote);
      const priority: ObjectivePriority = change !== null && Math.abs(change) >= 8 ? 'P1' : 'P2';
      return {
        id: quote.quote_id,
        kind: '行情' as const,
        title: quote.indicator_name,
        chineseHint: indicatorChinese[quote.indicator_code] || '市场指标',
        value: `${formatNumber(quote.value)} ${quote.unit}`,
        detail: change === null ? `来源 ${quote.source}` : `较基线 ${change >= 0 ? '+' : ''}${change.toFixed(1)}% · ${quote.fetch_mode || '本地快照'}`,
        source: quote.source,
        date: formatDate(quote.date),
        priority,
        searchable: `${quote.indicator_name} ${quote.indicator_code} ${indicatorChinese[quote.indicator_code] || ''} ${quote.source} ${quote.region || ''} ${quote.product_line || ''} ${quote.unit} 行情 市场 价格 运费 碳价 汇率`.toLowerCase(),
      };
    });
    const policyItems = policies.map((policy) => ({
      id: policy.event_id,
      kind: '政策' as const,
      title: policy.title,
      chineseHint: policyChinese[policy.event_type] || '贸易政策',
        value: policyChinese[policy.event_type] || humanizeDisplay(policy.event_type),
      detail: `${policy.issuer} · ${policy.verify_status === 'pending' ? '待核验' : '已核验'}`,
      source: policy.issuer,
      date: formatDate(policy.publish_date),
      priority: policy.severity >= 4 ? 'P1' as const : 'P2' as const,
      searchable: `${policy.title} ${policy.summary} ${policy.issuer} ${policy.country_region} ${policy.event_type} ${policyChinese[policy.event_type] || ''} 政策 法规 关税 合规`.toLowerCase(),
    }));
    const aggregateItems = aggregates.map((aggregate) => ({
      id: aggregate.aggregate_id,
      kind: '经营' as const,
      title: `${aggregate.product_grade || aggregate.product_line} · ${aggregate.region}`,
      chineseHint: `经营聚合 · ${productChinese[aggregate.product_grade || ''] || aggregate.product_line} · ${regionChinese[aggregate.region] || aggregate.region}`,
      value: `${formatNumber(aggregate.volume_t, 0)} t`,
      detail: `目标完成 ${formatNumber(aggregate.completion_pct ?? (aggregate.target_volume_t ? aggregate.volume_t / aggregate.target_volume_t * 100 : 0), 1)}% · ${aggregate.period}`,
      source: '内部聚合',
      date: formatDate(aggregate.end_date),
      priority: (Number(aggregate.completion_pct ?? (aggregate.target_volume_t ? aggregate.volume_t / aggregate.target_volume_t * 100 : 100)) < 80 ? 'P1' : 'P2') as ObjectivePriority,
      searchable: `${aggregate.product_grade || ''} ${aggregate.product_line} ${aggregate.region} ${aggregate.customer_segment || ''} ${aggregate.order_type || ''} 内部聚合 销量 目标`.toLowerCase(),
    }));
    const costItems = costs.map((cost) => ({
      id: cost.cost_id,
      kind: '成本' as const,
      title: `${cost.component_name} · ${cost.product_code}`,
      chineseHint: `${costComponentChinese[cost.component_code] || '成本分项'} · ${productChinese[cost.product_code] || '产品成本'}`,
      value: `${formatNumber(cost.value_per_ton)} ${cost.currency}/t`,
      detail: `${cost.trade_term} · ${cost.origin} → ${cost.destination}`,
      source: cost.source,
      date: formatDate(cost.effective_date),
      priority: 'P2' as const,
      searchable: `${cost.component_name} ${cost.product_code} ${cost.trade_term} ${cost.origin} ${cost.destination} ${cost.source} 成本 分项 产品`.toLowerCase(),
    }));
    const fxItems = scenarios.map((scenario) => ({
      id: scenario.scenario_id,
      kind: '汇率' as const,
      title: scenario.scenario_name,
      chineseHint: scenarioChinese(scenario.scenario_name),
      value: `${scenario.scenario_rate.toFixed(2)} ${scenario.quote_currency}/${scenario.base_currency}`,
      detail: `情景变化 ${scenario.scenario_pct >= 0 ? '+' : ''}${scenario.scenario_pct.toFixed(1)}% · 基准 ${scenario.base_rate.toFixed(2)}`,
      source: '汇率情景',
      date: formatDate(scenario.as_of),
      priority: 'P2' as const,
      searchable: `${scenario.scenario_name} ${scenario.base_currency} ${scenario.quote_currency} 汇率情景 敏感度 当前汇率`.toLowerCase(),
    }));
    const riskItems = signals.map((signal) => ({
      id: signal.signal_id,
      kind: '风险' as const,
      title: signal.factor,
      chineseHint: factorChinese[signal.factor] || '风险因子',
      value: riskLevelText[signal.level],
      detail: `${metricChinese[signal.metric] || '风险指标'} · ${displayMetric(signal.metric)} · ${signal.review_status === 'pending' ? '待处理' : signal.review_status === 'confirmed' ? '已确认' : '已忽略'}`,
      source: '风险规则',
      date: formatDate(signal.as_of),
      priority: (signal.level === 'critical' ? 'P0' : signal.level === 'high_attention' ? 'P1' : signal.level === 'attention' ? 'P2' : 'P3') as ObjectivePriority,
      searchable: `${signal.factor} ${signal.metric} ${factorChinese[signal.factor] || ''} ${metricChinese[signal.metric] || ''} ${signal.level} ${riskLevelText[signal.level]} 风险 预警 信号`.toLowerCase(),
    }));
    return [...riskItems, ...policyItems, ...quoteItems, ...aggregateItems, ...costItems, ...fxItems]
      .sort((a, b) => a.priority.localeCompare(b.priority) || b.date.localeCompare(a.date));
  }, [aggregates, costs, policies, quotes, scenarios, signals]);

  const filteredObjectives = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return objectiveItems.filter((item) =>
      (kindFilter === '全部' || item.kind === kindFilter) &&
      (priorityFilter === '全部' || item.priority === priorityFilter) &&
      (!normalizedQuery || item.searchable.includes(normalizedQuery)),
    );
  }, [kindFilter, objectiveItems, priorityFilter, query]);

  const metrics = useMemo(() => {
    const periodAggregates = scopedAggregates(aggregates);
    const totalVolume = periodAggregates.reduce((sum, item) => sum + item.volume_t, 0);
    const totalTarget = periodAggregates.reduce((sum, item) => sum + (item.target_volume_t || 0), 0);
    const completion = totalTarget ? totalVolume / totalTarget * 100 : 0;
    const scopedCosts = latestCostScenario(costs);
    const averageCost = scopedCosts.length ? scopedCosts.reduce((sum, item) => sum + item.value_per_ton, 0) / scopedCosts.length : 0;
    const activeRiskCount = signals.filter((item) => (item.level === 'critical' || item.level === 'high_attention') && item.review_status !== 'dismissed').length;
    const pendingPolicyCount = policies.filter((item) => item.verify_status === 'pending').length;
    const scenarioRates = scenarios.map((item) => item.scenario_rate);
    return {
      completion,
      averageCost,
      activeRiskCount,
      pendingPolicyCount,
      scenarioLow: scenarioRates.length ? Math.min(...scenarioRates) : 0,
      scenarioHigh: scenarioRates.length ? Math.max(...scenarioRates) : 0,
      aggregatePeriod: preferredAggregatePeriod(aggregates),
    };
  }, [aggregates, costs, policies, scenarios, signals]);

  const concernItems = useMemo(() => {
    const items: Array<{ label: string; value: string; detail: string; tone: string }> = [];
    if (metrics.completion) items.push({ label: '指标完成', value: `${metrics.completion.toFixed(1)}%`, detail: metrics.completion >= 100 ? '已达到当前聚合目标' : '仍需结合订单节奏判断', tone: metrics.completion >= 100 ? 'good' : 'focus' });
    if (metrics.averageCost) items.push({ label: '单位成本', value: `${formatNumber(metrics.averageCost)} /t`, detail: '基于最新成本快照均值', tone: 'neutral' });
    items.push({ label: '市场拓展', value: '需人工判断', detail: '当前数据未接入客户重要度与利润字段', tone: 'muted' });
    items.push({ label: '订单维护', value: '需人工判断', detail: '当前数据未接入客户维护程度字段', tone: 'muted' });
    return items;
  }, [metrics]);

  const marketComparisons = useMemo(() => {
    const groups = new Map<string, MarketQuote[]>();
    quotes.forEach((quote) => {
      const current = groups.get(quote.indicator_code) || [];
      current.push(quote);
      groups.set(quote.indicator_code, current);
    });
    return [...groups.entries()]
      .map(([code, items]) => {
        const comparable = items.filter((item) => item.value !== undefined);
        const units = new Set(comparable.map((item) => `${item.unit}|${item.currency || ''}`));
        const frequencies = new Set(comparable.map((item) => item.frequency));
        const dates = new Set(comparable.map((item) => item.date.slice(0, 10)));
        if (units.size !== 1 || frequencies.size !== 1 || dates.size !== 1) return null;
        const values = comparable.map((item) => item.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        return {
          code,
          name: comparable[0].indicator_name,
          chineseHint: indicatorChinese[code] || '市场指标',
          min,
          max,
          unit: comparable[0].unit,
          currency: comparable[0].currency || '',
          date: comparable[0].date.slice(0, 10),
          sourceCount: new Set(comparable.map((item) => item.source)).size,
          sources: [...new Set(comparable.map((item) => item.source))].join(' · '),
          spread: max - min,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter((item) => item.sourceCount > 1)
      .sort((a, b) => b.spread - a.spread)
      .slice(0, 4);
  }, [quotes]);

  const themeKey = useThemeKey();
  const chartTheme = useMemo(() => chartThemeFromCss(), [themeKey]);

  const processedChartOption = useMemo<echarts.EChartsOption>(() => {
    const completionByDate = new Map<string, { volume: number; target: number }>();
    scopedAggregates(aggregates).forEach((item) => {
      const current = completionByDate.get(item.end_date) || { volume: 0, target: 0 };
      current.volume += item.volume_t;
      current.target += item.target_volume_t || 0;
      completionByDate.set(item.end_date, current);
    });
    const rows = [...completionByDate.entries()].sort(([a], [b]) => a.localeCompare(b));
    const completion = rows.map(([, item]) => {
      return item.target ? Number((item.volume / item.target * 100).toFixed(1)) : null;
    });
    return {
      color: [chartTheme.blue, chartTheme.orange],
      grid: { left: 54, right: 18, top: 35, bottom: 38, containLabel: true },
      tooltip: { trigger: 'axis', formatter: (params: any) => { const row = rows[params[0]?.dataIndex]?.[1]; return `${params[0]?.axisValue}<br/>完成率：${params[0]?.value ?? '无目标'}%<br/>经营量：${row ? formatNumber(row.volume, 0) : '—'} t<br/>目标量：${row ? formatNumber(row.target, 0) : '—'} t<br/>统计周期：${periodChinese[metrics.aggregatePeriod]}`; } },
      legend: { top: 0, type: 'scroll', textStyle: { color: chartTheme.text, fontSize: 13 } },
      xAxis: { type: 'category', data: rows.map(([date]) => formatDate(date)), axisLabel: { color: chartTheme.text, fontSize: 13 }, axisLine: { lineStyle: { color: chartTheme.grid } } },
      yAxis: { type: 'value', name: '完成率 %', max: 120, axisLabel: { color: chartTheme.text, fontSize: 13, formatter: '{value}%' }, splitLine: { lineStyle: { color: chartTheme.grid } } },
      series: [{ name: '目标完成率', type: 'line', smooth: true, symbolSize: 8, data: completion, itemStyle: { color: chartTheme.blue }, lineStyle: { width: 3, color: chartTheme.blue }, areaStyle: { color: chartTheme.blue, opacity: 0.08 }, label: { show: true, position: 'top', color: chartTheme.text, fontSize: 13, formatter: (params: any) => params.value == null ? '无目标' : `${params.value}%` } }],
    };
  }, [aggregates, chartTheme, metrics.aggregatePeriod]);

  const fxSensitivityChartOption = useMemo<echarts.EChartsOption>(() => {
    const pctValues = [...new Set(scenarios.map((item) => item.scenario_pct))].sort((a, b) => a - b);
    const pairs = [...new Set(scenarios.map((item) => `${item.base_currency}/${item.quote_currency}`))];
    return {
      color: [chartTheme.orange, chartTheme.blue, chartTheme.green, chartTheme.purple],
      grid: { left: 52, right: 18, top: 35, bottom: 38, containLabel: true },
      tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0]?.axisValue}% 情景变化<br/>${params.map((item: any) => `${item.seriesName}：${item.value}`).join('<br/>')}` },
      legend: { top: 0, type: 'scroll', textStyle: { color: chartTheme.text, fontSize: 13 } },
      xAxis: { type: 'category', boundaryGap: false, data: pctValues.map((value) => `${value > 0 ? '+' : ''}${value}%`), axisLabel: { color: chartTheme.text, fontSize: 13, interval: (index: number) => index % 2 === 0, hideOverlap: true }, axisLine: { lineStyle: { color: chartTheme.grid } } },
      yAxis: { type: 'value', name: '相对基准指数', axisLabel: { color: chartTheme.text, fontSize: 13 }, splitLine: { lineStyle: { color: chartTheme.grid } } },
      series: pairs.map((pair) => ({ name: pair, type: 'line' as const, smooth: true, symbolSize: 7, data: pctValues.map((pct) => { const item = scenarios.find((scenario) => `${scenario.base_currency}/${scenario.quote_currency}` === pair && scenario.scenario_pct === pct); return item ? Number((item.scenario_rate / item.base_rate * 100).toFixed(2)) : null; }) })),
    };
  }, [chartTheme, scenarios]);

  const dataReadinessChartOption = useMemo<echarts.EChartsOption>(() => {
    const values = [
      { name: '经营目标数据', value: aggregates.length ? 100 : null, status: aggregates.length ? '已接入' : '未接入' },
      { name: '成本分项数据', value: costs.length ? 100 : null, status: costs.length ? '已接入' : '未接入' },
      { name: '市场行情数据', value: quotes.length ? 100 : null, status: quotes.length ? '已接入' : '未接入' },
      { name: '政策事件数据', value: policies.length ? 100 : null, status: policies.length ? '已接入' : '未接入' },
      { name: '客户重要度', value: null, status: '未接入字段' },
      { name: '订单利润', value: null, status: '未接入字段' },
      { name: '维护程度', value: null, status: '未接入字段' },
    ];
    return { grid: { left: 102, right: 46, top: 16, bottom: 28, containLabel: true }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => { const item = values[params[0]?.dataIndex]; return `${item?.name}<br/>状态：${item?.status}`; } }, xAxis: { type: 'value', max: 1, axisLabel: { color: chartTheme.text, fontSize: 13, formatter: (value: number) => value === 1 ? '已接入' : '' }, splitLine: { lineStyle: { color: chartTheme.grid } } }, yAxis: { type: 'category', inverse: true, data: values.map((item) => item.name), axisLabel: { color: chartTheme.text, fontSize: 13 }, axisLine: { lineStyle: { color: chartTheme.grid } } }, series: [{ type: 'bar', barWidth: '48%', data: values.map((item) => ({ value: item.value == null ? null : 1, itemStyle: { color: item.value == null ? chartTheme.muted : chartTheme.green } })), label: { show: true, position: 'right', color: chartTheme.text, fontSize: 13, formatter: (params: any) => values[params.dataIndex].value == null ? '未接入' : '已有数据' } }] };
  }, [aggregates.length, chartTheme, costs.length, policies.length, quotes.length]);

  const businessMixChartOption = useMemo<echarts.EChartsOption>(() => {
    const groups = new Map<string, { contract: number; spot: number; other: number }>();
    scopedAggregates(aggregates).forEach((item) => {
      const key = customerSegmentChinese[item.customer_segment || ''] || item.customer_segment || '未标注客户分群';
      const current = groups.get(key) || { contract: 0, spot: 0, other: 0 };
      if (item.order_type === 'contract') current.contract += item.volume_t;
      else if (item.order_type === 'spot') current.spot += item.volume_t;
      else current.other += item.volume_t;
      groups.set(key, current);
    });
    const rows = [...groups.entries()].sort((a, b) => (b[1].contract + b[1].spot + b[1].other) - (a[1].contract + a[1].spot + a[1].other)).slice(0, 8);
    return {
      grid: { left: 82, right: 22, top: 34, bottom: 34, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => `${params[0]?.name}<br/>${params.map((item: any) => `${item.seriesName}：${formatNumber(item.value, 0)} t`).join('<br/>')}<br/>统计周期：${periodChinese[metrics.aggregatePeriod]}` },
      legend: { top: 0, textStyle: { color: chartTheme.text, fontSize: 13 } },
      xAxis: { type: 'value', name: '经营量（吨）', nameTextStyle: { color: chartTheme.text, fontSize: 13 }, axisLabel: { color: chartTheme.text, fontSize: 13 }, splitLine: { lineStyle: { color: chartTheme.grid } } },
      yAxis: { type: 'category', inverse: true, data: rows.map(([key]) => key), axisLabel: { color: chartTheme.text, fontSize: 13 }, axisLine: { lineStyle: { color: chartTheme.grid } } },
      series: [
        { name: '合同单', type: 'bar', stack: 'volume', barWidth: '52%', data: rows.map(([, value]) => Number(value.contract.toFixed(1))), itemStyle: { color: chartTheme.blue } },
        { name: '现货单', type: 'bar', stack: 'volume', data: rows.map(([, value]) => Number(value.spot.toFixed(1))), itemStyle: { color: chartTheme.orange } },
        { name: '其他', type: 'bar', stack: 'volume', data: rows.map(([, value]) => Number(value.other.toFixed(1))), itemStyle: { color: chartTheme.muted } },
      ],
    };
  }, [aggregates, chartTheme, metrics.aggregatePeriod]);

  const comparisonChartOption = useMemo<echarts.EChartsOption>(() => ({
    grid: { left: 54, right: 18, top: 18, bottom: 34, containLabel: true }, tooltip: { trigger: 'axis' }, legend: { top: 0, textStyle: { color: chartTheme.text, fontSize: 13 } }, xAxis: { type: 'category', data: marketComparisons.map((item) => item.chineseHint), axisLabel: { color: chartTheme.text, fontSize: 13, interval: 0, rotate: 18 }, axisLine: { lineStyle: { color: chartTheme.grid } } }, yAxis: { type: 'value', axisLabel: { color: chartTheme.text, fontSize: 13 }, splitLine: { lineStyle: { color: chartTheme.grid } } }, series: [{ name: '最低值', type: 'bar', barGap: 0, barWidth: '22%', data: marketComparisons.map((item) => item.min), itemStyle: { color: chartTheme.lightBlue } }, { name: '最高值', type: 'bar', barWidth: '22%', data: marketComparisons.map((item) => item.max), itemStyle: { color: chartTheme.orange } }],
  }), [chartTheme, marketComparisons]);

  const riskTrendChartOption = useMemo<echarts.EChartsOption>(() => {
    const activeSignals = signals.filter((signal) => signal.review_status !== 'dismissed');
    const dates = [...new Set(activeSignals.map((signal) => signal.as_of.slice(0, 10)))].sort();
    const levels: RiskSignal['level'][] = ['critical', 'high_attention', 'attention', 'normal'];
    return { grid: { left: 48, right: 18, top: 24, bottom: 34, containLabel: true }, tooltip: { trigger: 'axis' }, legend: { top: 0, textStyle: { color: chartTheme.text, fontSize: 13 } }, xAxis: { type: 'category', data: dates, axisLabel: { color: chartTheme.text, fontSize: 13 }, axisLine: { lineStyle: { color: chartTheme.grid } } }, yAxis: { type: 'value', minInterval: 1, name: '信号数量', nameTextStyle: { color: chartTheme.text, fontSize: 13 }, axisLabel: { color: chartTheme.text, fontSize: 13 }, splitLine: { lineStyle: { color: chartTheme.grid } } }, series: levels.map((level) => ({ name: riskLevelText[level], type: 'line' as const, stack: 'risk', areaStyle: {}, smooth: true, data: dates.map((date) => activeSignals.filter((signal) => signal.as_of.slice(0, 10) === date && signal.level === level).length) })) };
  }, [chartTheme, signals]);

  const riskScatterOption = useMemo<echarts.EChartsOption>(() => ({
    grid: { left: 54, right: 18, top: 18, bottom: 36 }, tooltip: { trigger: 'item', formatter: (params: any) => { const signal = signals.filter((item) => item.review_status !== 'dismissed')[params.dataIndex]; return `${params.data?.name}<br/>变化：${params.data?.value?.[0] ?? 0}%<br/>评分：${params.data?.value?.[1] ?? 0}<br/>信号编号：${signal?.signal_id || '—'}<br/>依据：${signal?.evidence_ref?.join('、') || '当前风险快照'}`; } }, xAxis: { type: 'value', name: '相对基线变化 %', axisLabel: { color: chartTheme.text, fontSize: 13 }, splitLine: { lineStyle: { color: chartTheme.grid } } }, yAxis: { type: 'value', name: '风险评分', axisLabel: { color: chartTheme.text, fontSize: 13 }, splitLine: { lineStyle: { color: chartTheme.grid } } }, series: [{ type: 'scatter', symbolSize: 13, data: signals.filter((signal) => signal.review_status !== 'dismissed').map((signal) => ({ name: factorChinese[signal.factor] || humanizeDisplay(signal.factor), value: [signal.delta_pct ?? (signal.baseline ? (signal.value - signal.baseline) / signal.baseline * 100 : 0), signal.score], itemStyle: { color: signal.level === 'critical' ? chartTheme.red : signal.level === 'high_attention' ? chartTheme.orange : chartTheme.blue } })) }],
  }), [chartTheme, signals]);

  const riskScoreOption = useMemo<echarts.EChartsOption>(() => {
    const items = signals.filter((signal) => signal.review_status !== 'dismissed').sort((a, b) => b.score - a.score);
    return {
      grid: { left: 104, right: 30, top: 18, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => { const signal = items[params[0]?.dataIndex]; return `${factorChinese[signal?.factor] || humanizeDisplay(signal?.factor || '')}<br/>风险评分：${signal?.score ?? '—'}<br/>级别：${riskLevelText[signal?.level] || '—'}<br/>信号编号：${signal?.signal_id || '—'}<br/>规则：${signal?.rule_id || '—'}<br/>依据：${signal?.evidence_ref?.join('、') || '当前风险快照'}`; } },
      xAxis: { type: 'value', max: 100, name: '风险评分', nameTextStyle: { color: chartTheme.text, fontSize: 13 }, axisLabel: { color: chartTheme.text, fontSize: 13 }, splitLine: { lineStyle: { color: chartTheme.grid } } },
      yAxis: { type: 'category', inverse: true, data: items.map((signal) => factorChinese[signal.factor] || humanizeDisplay(signal.factor)), axisLabel: { color: chartTheme.text, fontSize: 13 }, axisLine: { lineStyle: { color: chartTheme.grid } } },
      series: [{ type: 'bar', barWidth: '48%', data: items.map((signal) => ({ value: signal.score, itemStyle: { color: signal.level === 'critical' ? chartTheme.red : signal.level === 'high_attention' ? chartTheme.orange : chartTheme.blue } })), label: { show: true, position: 'right', color: chartTheme.text, fontSize: 13 } }],
    };
  }, [chartTheme, signals]);

  const summary = useMemo(() => {
    if (loading) return '正在整理当前产品线与区域的数据快照…';
    if (error) return '综合分析数据加载失败，请检查本地数据服务。';
    if (metrics.activeRiskCount > 0) return `当前识别到 ${metrics.activeRiskCount} 条高优先级风险信号，建议先核对风险依据，再判断订单与市场动作。`;
    return '当前未发现高优先级风险信号，可结合成本、目标完成率和政策变化推进人工研判。';
  }, [error, loading, metrics.activeRiskCount]);

  const updateReviewStatus = (signalId: string, reviewStatus: RiskSignal['review_status']) => {
    setSignals((current) => {
      const nextSignals = current.map((signal) => signal.signal_id === signalId ? { ...signal, review_status: reviewStatus } : signal);
      dispatch({ type: 'SET_RISK_SIGNALS', payload: nextSignals });
      return nextSignals;
    });
  };

  return (
    <div className="unified-analysis">
      <section className="analysis-context-bar" aria-label="当前分析范围">
        <span className="context-section-label">综合分析</span>
        <span>{state.productLine === 'hot-rolled' ? '热轧卷板' : state.productLine === 'cold-rolled' ? '冷轧卷板' : '硅钢'}</span>
        <span>{state.region === 'global' ? '全球' : state.region}</span>
      </section>

      {error && <div className="analysis-error">{error}</div>}

      <section className="analysis-section objective-section">
        <div className="section-heading">
          <div><span className="section-index">01</span><h2>客观信息</h2></div>
          <div className="section-heading-status"><DataStatus status={syncStatus} compact /></div>
        </div>
        {!loading && <div className="fact-strip">
          <div><span>行情记录</span><strong>{quotes.length}</strong><small>{new Set(quotes.map((quote) => quote.source)).size} 个来源</small></div>
          <div><span>政策事件</span><strong>{policies.length}</strong><small>{metrics.pendingPolicyCount} 条待核验</small></div>
          <div><span>风险信号</span><strong>{signals.filter((signal) => signal.level !== 'normal').length}</strong><small>{metrics.activeRiskCount} 条待关注</small></div>
          <div><span>经营聚合</span><strong>{aggregates.length}</strong><small>当前产品线 / 区域</small></div>
        </div>}
        {!loading && <ObjectiveCharts quotes={quotes} aggregates={aggregates} costs={costs} scenarios={scenarios} steelExport={steelExport} taricQuota={taricQuota} tradeRemedy={tradeRemedy} advice={analysisAdvice} />}
        {!loading && shippingIndices && <ShippingIndexPanel snapshot={shippingIndices} />}
        {!loading && <div className="analysis-advice-strip" aria-label="客观信息对应建议">{analysisAdvice.slice(0, 4).map((advice) => <DataAdviceCard key={advice.id} advice={advice} compact />)}</div>}
        {!loading && forex && <ForexCharts forex={forex} />}
        {!loading && <section className={`analysis-search panel-surface objective-search ${searchOpen || query || kindFilter !== '全部' || priorityFilter !== '全部' ? 'is-open' : ''}`} aria-label="搜索客观明细">
          <div className="search-row">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { const nextQuery = event.target.value; setSearchOpen(true); setQuery(nextQuery); setObjectiveDetailsOpen(Boolean(nextQuery) || kindFilter !== '全部' || priorityFilter !== '全部'); }} placeholder="搜索指标、政策、来源、区域或风险关键词" />
            </label>
            {(searchOpen || query || kindFilter !== '全部' || priorityFilter !== '全部') && <span className="search-count">匹配 {filteredObjectives.length} 条明细</span>}
            <button type="button" className="search-toggle" onClick={() => setSearchOpen((current) => !current)} aria-expanded={searchOpen || Boolean(query) || kindFilter !== '全部' || priorityFilter !== '全部'}>{searchOpen || query || kindFilter !== '全部' || priorityFilter !== '全部' ? '收起筛选' : '展开筛选'}</button>
          </div>
          {(searchOpen || query || kindFilter !== '全部' || priorityFilter !== '全部') && <div className="filter-row">
              {(['全部', '行情', '政策', '经营', '成本', '汇率', '风险'] as const).map((kind) => (
                <button key={kind} className={`filter-chip ${kindFilter === kind ? 'is-active' : ''}`} onClick={() => { setSearchOpen(true); setKindFilter(kind); setObjectiveDetailsOpen(true); }}>{kind}</button>
              ))}
              <span className="filter-divider" aria-hidden="true" />
              {(['全部', 'P0', 'P1', 'P2', 'P3'] as const).map((priority) => (
                <button key={priority} className={`filter-chip priority-chip priority-${priority.toLowerCase()} ${priorityFilter === priority ? 'is-active' : ''}`} onClick={() => { setSearchOpen(true); setPriorityFilter(priority); setObjectiveDetailsOpen(true); }}>
                  {priority === '全部' ? '全部优先级' : `${priority} ${priority === 'P0' ? '立即核验' : priority === 'P1' ? '重点关注' : priority === 'P2' ? '常规跟踪' : '辅助信息'}`}
                </button>
              ))}
            </div>}
        </section>}
        {loading ? <div className="analysis-empty">正在读取本地数据…</div> : (
        <section className={`objective-details ${objectiveDetailsOpen ? 'is-open' : ''}`} aria-label="客观信息明细">
          <div className="objective-grid-meta">
            <span>客观信息概览 <strong>{filteredObjectives.length}</strong></span>
            <button type="button" className="objective-detail-toggle" onClick={() => setObjectiveDetailsOpen((current) => !current)} aria-expanded={objectiveDetailsOpen}>{objectiveDetailsOpen ? '收起客观明细' : '展开客观明细'}</button>
          </div>
          {objectiveDetailsOpen && <div className="objective-scroll" aria-label="客观信息滚动列表">
          <div className="objective-detail-label">客观明细数据</div>
          <div className="objective-table-wrap">
              <table className="objective-table">
                <thead><tr><th>优先级</th><th>信息类型</th><th>指标 / 事件</th><th>当前状态</th><th>当前值</th><th>来源 / 日期</th></tr></thead>
                <tbody>
                  {filteredObjectives.map((item) => (
                    <tr key={item.id}>
                      <td><span className={`priority-badge priority-${item.priority.toLowerCase()}`}>{item.priority}</span></td>
                      <td><span className={`kind-label kind-${item.kind}`}>{item.kind}</span></td>
                      <td><div className="objective-table-title"><strong>{item.chineseHint}</strong><small>{humanizeDisplay(item.title)} · {humanizeDisplay(item.detail)}</small></div></td>
                      <td className="objective-table-status">{humanizeDisplay(item.detail)}</td>
                      <td className="objective-table-value">{item.value}</td>
                      <td><div className="objective-table-source"><span>{humanizeDisplay(item.source)}</span><small>{item.date}</small></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredObjectives.length && <div className="analysis-empty">没有匹配的信息</div>}
          </div>
          </div>}
        </section>
        )}
      </section>

      <section className="analysis-section processed-section">
        <div className="section-heading"><div><span className="section-index">02</span><h2>处理后指标</h2></div><p>由现有数据计算出的变化、敏感度与完成情况</p></div>
        <div className="processed-grid">
          <div className="processed-card"><span>目标完成率</span><strong>{metrics.completion.toFixed(1)}%</strong><small>内部聚合销量 / 目标销量 · {metrics.aggregatePeriod === 'monthly' ? '月度' : metrics.aggregatePeriod === 'daily' ? '日度' : '周度'}口径</small></div>
          <div className="processed-card"><span>最新单位成本</span><strong>{metrics.averageCost ? `${formatNumber(metrics.averageCost)} /t` : '—'}</strong><small>最新有效日期的同场景成本均值</small></div>
          <div className="processed-card"><span>汇率情景区间</span><strong>{metrics.scenarioLow ? `${metrics.scenarioLow.toFixed(2)}—${metrics.scenarioHigh.toFixed(2)}` : '—'}</strong><small>当前本地情景最低 / 最高</small></div>
          <div className="processed-card"><span>待核验政策</span><strong>{metrics.pendingPolicyCount}</strong><small>需要人工确认的政策事件</small></div>
        </div>
        <div className="analysis-chart-grid analysis-chart-grid-two">
          <AnalysisChart title="经营目标完成率" subtitle="Target progress · InternalAggregate.volume / target" option={processedChartOption} emptyMessage={!aggregates.length ? '当前筛选范围暂无经营数据' : undefined} />
          <AnalysisChart title="汇率情景敏感度" subtitle="FX sensitivity · 各货币对按基准=100归一化" option={fxSensitivityChartOption} emptyMessage={!scenarios.length ? '当前暂无汇率情景数据' : undefined} />
        </div>
      </section>

      <section className="analysis-section concern-section">
        <div className="section-heading"><div><span className="section-index">03</span><h2>业务关注点</h2></div><p>用于判断是否进入策略流程的客观条件，不直接给出决策</p></div>
        <div className="concern-grid">{concernItems.map((item) => <div className={`concern-card concern-${item.tone}`} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div>
          <div className="analysis-chart-grid analysis-chart-grid-two"><AnalysisChart title="数据准备状态" subtitle="Data readiness · 仅表示字段是否接入，不代表业务评分" option={dataReadinessChartOption} /><AnalysisChart title="客户分群与订单结构" subtitle="Business mix · 单一统计周期下的经营量（吨）" option={businessMixChartOption} emptyMessage={!aggregates.length ? '当前筛选范围暂无经营数据' : undefined} /></div>
      </section>

      <section className="analysis-section compare-section">
        <div className="section-heading"><div><span className="section-index">04</span><h2>市场对比与内外部综合</h2></div><p>按来源、区域、产品线和内部聚合进行对照</p></div>
        <div className="compare-grid">
          <div className="compare-card"><span>外部行情来源</span><strong>{new Set(quotes.map((quote) => quote.source)).size} 个</strong><small>{[...new Set(quotes.map((quote) => quote.source))].slice(0, 4).join(' · ') || '暂无数据'}</small></div>
          <div className="compare-card"><span>覆盖区域</span><strong>{new Set(quotes.map((quote) => quote.region).filter(Boolean)).size} 个</strong><small>当前快照按区域与产品线筛选</small></div>
          <div className="compare-card"><span>内部经营记录</span><strong>{aggregates.length} 条</strong><small>可按周期、客户分群与订单类型继续接入</small></div>
          <div className="compare-card compare-muted"><span>国内钢厂对比</span><strong>暂无接入</strong><small>当前数据源没有集团外部钢厂对比字段</small></div>
        </div>
        <div className="comparison-list">
          <div className="comparison-list-head"><span>同指标外部市场对比</span><small>仅比较同日期、同单位、同币种的多来源行情</small></div>
          {marketComparisons.map((item) => (
            <div className="comparison-row" key={item.code}>
              <div><strong>{item.name}</strong><small>{item.chineseHint}</small></div>
              <span>{item.min.toFixed(2)}—{item.max.toFixed(2)} {item.unit}</span>
              <small>{item.sourceCount} 个来源 · {item.date} · 区间差 {item.spread.toFixed(2)} · {item.sources}</small>
            </div>
          ))}
          {!marketComparisons.length && <div className="analysis-empty">当前快照没有可进行多来源对比的同指标数据</div>}
        </div>
        <div className="analysis-chart-grid analysis-chart-grid-two"><AnalysisChart title="同指标市场区间对比" subtitle="Market range · 最低 / 最高值，按各指标自身单位展示" option={comparisonChartOption} emptyMessage={!marketComparisons.length ? '当前快照没有可进行同口径多来源对比的数据' : undefined} /><article className="analysis-chart-card policy-timeline-card"><div className="analysis-chart-heading"><strong>政策事件时间线</strong><small>Policy timeline · 按发布日期查看事件明细</small></div><PolicyTimeline policies={policies} /></article></div>
      </section>

      <section className="analysis-section conclusion-section">
        <div className="section-heading"><div><span className="section-index">05</span><h2>总结与风险信号</h2></div><p>风险信号来自客观数据变化，仍需人工审核确认</p></div>
        <div className="conclusion-summary"><span className="summary-mark">/</span><p>{summary}</p></div>
        <div className="signal-list">
          {signals.filter((signal) => signal.level !== 'normal' && signal.review_status !== 'dismissed').slice(0, 12).map((signal) => (
            <article className="signal-card" key={signal.signal_id}>
              <div className="signal-top"><span className={`signal-level signal-${riskLevelClass[signal.level]}`}>{riskLevelText[signal.level]}</span><span className={`review-state review-${signal.review_status}`}>{signal.review_status === 'confirmed' ? '已确认' : signal.review_status === 'dismissed' ? '已忽略' : '待处理'}</span></div>
              <strong>{factorChinese[signal.factor] || '风险因子'}</strong><span className="signal-cn">{humanizeDisplay(signal.factor)}</span><span>{metricChinese[signal.metric] || '风险指标'} · {displayMetric(signal.metric)}</span>
              <small>依据：{signal.evidence_ref?.length ? signal.evidence_ref.join('、') : '当前风险快照'}</small>
              <div className="signal-actions"><button disabled={signal.review_status === 'confirmed'} onClick={() => updateReviewStatus(signal.signal_id, 'confirmed')}>确认</button><button disabled={signal.review_status === 'dismissed'} onClick={() => updateReviewStatus(signal.signal_id, 'dismissed')}>忽略</button></div>
            </article>
          ))}
          {!signals.filter((signal) => signal.level !== 'normal' && signal.review_status !== 'dismissed').length && <div className="analysis-empty">当前没有高优先级风险信号</div>}
        </div>
        <div className="analysis-chart-grid analysis-chart-grid-two conclusion-chart-grid"><AnalysisChart title="风险驱动散点" subtitle="Risk drivers · 变化幅度 × 风险评分，点击查看证据" option={riskScatterOption} onPointClick={(index) => setSelectedRiskId(signals.filter((signal) => signal.review_status !== 'dismissed')[index]?.signal_id || null)} emptyMessage={!signals.filter((signal) => signal.review_status !== 'dismissed').length ? '当前暂无可展示的风险信号' : undefined} /><AnalysisChart title="风险级别趋势" subtitle="Risk trend · 按日期统计，已忽略信号不纳入" option={riskTrendChartOption} emptyMessage={!signals.filter((signal) => signal.review_status !== 'dismissed').length ? '当前暂无可展示的风险趋势' : undefined} /><AnalysisChart title="风险评分排序" subtitle="Risk score · 依据证据编号可回溯至风险卡片" option={riskScoreOption} emptyMessage={!signals.filter((signal) => signal.review_status !== 'dismissed').length ? '当前暂无可展示的风险排名' : undefined} /></div>
        {selectedRiskId && <div className="risk-trace-note">已选风险信号：<strong>{selectedRiskId}</strong> · 可在上方风险卡片中查看证据编号与人工审核状态。<button type="button" onClick={() => setSelectedRiskId(null)}>清除选择</button></div>}
      </section>
    </div>
  );
}
