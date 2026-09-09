import type {
  FastNewsItem,
  InternalBusinessSnapshot,
  MarketQuote,
  RiskSignal,
  ShippingIndexPoint,
  ShippingIndexSnapshot,
  TradeRemedyCase,
  TradeRemedySnapshot,
} from '@/core/store/types';
import type { StrategyDataBundle } from './data';
import { buildDataDrivenAdvice, buildDataDrivenSalesPlan, type DataDrivenAdvice, type DataDrivenSalesPlan } from './engine';
import { choosePhrase, morningBriefCorpus } from './morningBriefCorpus';

const factorLabel: Record<string, string> = {
  price_volatility: '价格波动',
  freight_cost: '运费成本',
  carbon_cost: '碳成本',
  policy_risk: '政策风险',
  demand_weakness: '需求走弱',
  fx_volatility: '汇率波动',
};

export interface BriefMetric {
  id: string;
  label: string;
  value: string;
  change: string;
  changePeriod?: string;
  direction: 'up' | 'down' | 'flat' | 'neutral';
  detail: string;
  source: string;
  asOf: string;
  sourceId?: string;
  sourceState?: 'fresh' | 'fallback' | 'unavailable' | 'local';
}

export interface BriefNewsItem extends FastNewsItem {
  matchedTopics: string[];
}

export interface BriefRemedy {
  caseItem: TradeRemedyCase;
  impact: '高' | '中';
  linkedDestinations: string[];
  productMatches: string[];
  activeCaseCount: number;
  totalCaseCount: number;
}

export interface BriefConclusionItem {
  id: string;
  label: string;
  text: string;
  tone: 'blue' | 'green' | 'amber' | 'red' | 'neutral';
}

export interface MorningBriefModel {
  generatedAt: string;
  dataSyncGeneratedAt: string | null;
  conclusion: string;
  conclusionItems: BriefConclusionItem[];
  spread: { value: number | null; change: number | null; status: '扩大' | '收窄' | '平稳' | '待补'; detail: string; asOf?: string; domesticAsOf?: string; overseasAsOf?: string; fxAsOf?: string; alignment?: 'as-of' | 'strict' };
  metrics: BriefMetric[];
  monthlyPulse: InternalBusinessSnapshot['monthly'];
  business: {
    totalVolume: number;
    topDestination: { label: string; volume_t: number; share_pct: number } | null;
    topProduct: { label: string; volume_t: number; share_pct: number } | null;
    growthTargetPct: number;
  } | null;
  advice: DataDrivenAdvice[];
  salesPlan: DataDrivenSalesPlan;
  news: BriefNewsItem[];
  newsSource: StrategyDataBundle['fastNews'];
  risks: RiskSignal[];
  riskTotalCount: number;
  policies: StrategyDataBundle['policies'];
  policyWindowCount: number;
  remedy: BriefRemedy | null;
  quota: {
    eu: { balance: number; usedPct: number | null; remainingPct: number | null; asOf: string } | null;
    uk: { balance: number; usedPct: number | null; remainingPct: number | null; asOf: string } | null;
  };
  dataState: 'ready' | 'partial' | 'unavailable';
  degradedSources: string[];
  fallbackSources: string[];
}

const dateOf = (value?: string | null) => value ? value.slice(0, 10) : '—';
const signedPct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const fixed = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
const tons = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 吨`;
const periodLabel = (frequency?: string) => frequency === 'monthly' ? '月环比' : frequency === 'weekly' || frequency === '周频' ? '周环比' : frequency === 'dekadal' ? '旬环比' : frequency === 'daily' || frequency === '日频' ? '日环比' : '最新变动';

function latestQuote(rows: MarketQuote[], predicate: (row: MarketQuote) => boolean) {
  const sorted = rows.filter(predicate).sort((a, b) => `${a.date}${a.publish_time}`.localeCompare(`${b.date}${b.publish_time}`));
  return sorted[sorted.length - 1];
}

function previousQuote(rows: MarketQuote[], quote?: MarketQuote) {
  if (!quote) return undefined;
  const sorted = rows.filter((row) => row.indicator_code === quote.indicator_code && `${row.date}${row.publish_time}` < `${quote.date}${quote.publish_time}`).sort((a, b) => `${a.date}${a.publish_time}`.localeCompare(`${b.date}${b.publish_time}`));
  return sorted[sorted.length - 1];
}

function pctChange(current: number | undefined, previous: number | undefined) {
  if (current == null || previous == null || previous === 0) return null;
  return (current / previous - 1) * 100;
}

function direction(change: number | null | undefined, positiveIsGood = true): BriefMetric['direction'] {
  if (change == null || Math.abs(change) < 0.05) return change == null ? 'neutral' : 'flat';
  return positiveIsGood ? change > 0 ? 'up' : 'down' : change < 0 ? 'up' : 'down';
}

function buildQuoteMetric(rows: MarketQuote[], id: string, label: string, predicate: (row: MarketQuote) => boolean, detail: string): BriefMetric | null {
  const quote = latestQuote(rows, predicate);
  if (!quote) return null;
  const previous = previousQuote(rows, quote);
  const change = pctChange(quote.value, previous?.value);
  const sourceId = quote.source === 'steel-dashboard-public' ? 'steel-dashboard-public' : 'local-market-quotes';
  return { id, label, value: `${fixed(quote.value, 2)} ${quote.unit}`, change: signedPct(change), changePeriod: periodLabel(quote.frequency), direction: direction(change), detail: `${detail} · ${quote.indicator_name}`, source: quote.source, asOf: dateOf(quote.date), sourceId, sourceState: sourceId === 'local-market-quotes' ? 'local' : undefined };
}

function latestShipping(snapshot: ShippingIndexSnapshot | null | undefined, code: string) {
  return snapshot?.series?.[code]?.latest;
}

function buildShippingMetric(snapshot: ShippingIndexSnapshot | null | undefined, code: string, label: string, detail: string): BriefMetric | null {
  const series = snapshot?.series?.[code];
  const point = series?.latest;
  if (!series || !point) return null;
  const change = point.changeRatePct;
  return { id: `shipping-${code}`, label, value: `${fixed(point.value, 1)} ${series.unit}`, change: signedPct(change), changePeriod: periodLabel(series.frequency), direction: direction(change, false), detail, source: snapshot.source.name, asOf: dateOf(point.date), sourceId: 'shipping-index-dashboard-public' };
}

function buildForexMetrics(data: StrategyDataBundle): BriefMetric[] {
  const latest = data.forex?.latest_independent;
  if (!latest) return [];
  const metrics: BriefMetric[] = [];
  if (latest.EURUSD) metrics.push({ id: 'fx-eurusd', label: '欧元兑美元', value: fixed(latest.EURUSD.close, 4), change: signedPct(latest.EURUSD.change_pct), changePeriod: '日环比', direction: direction(latest.EURUSD.change_pct), detail: `历史分位 ${fixed(latest.EURUSD.percentile, 0)}%`, source: data.forex?.source.name || '外汇汇率看板', asOf: dateOf(latest.EURUSD.date), sourceId: 'forex-dashboard-public' });
  if (latest.USDCNY) metrics.push({ id: 'fx-usdcny', label: '美元兑人民币', value: fixed(latest.USDCNY.close, 4), change: signedPct(latest.USDCNY.change_pct), changePeriod: '日环比', direction: direction(latest.USDCNY.change_pct, false), detail: `历史分位 ${fixed(latest.USDCNY.percentile, 0)}%`, source: data.forex?.source.name || '外汇汇率看板', asOf: dateOf(latest.USDCNY.date), sourceId: 'forex-dashboard-public' });
  return metrics;
}

function buildSteelMetrics(rows: MarketQuote[], business?: InternalBusinessSnapshot | null): BriefMetric[] {
  const metrics = [
    buildQuoteMetric(rows, 'steel-hr', '热轧卷板', (row) => row.indicator_code === 'STEEL_HR_FOB_CN', 'FOB 中国'),
    buildQuoteMetric(rows, 'steel-cr', '冷轧卷板', (row) => row.indicator_code === 'STEEL_CR_FOB_CN', 'FOB 中国'),
    buildQuoteMetric(rows, 'steel-silicon', '硅钢', (row) => row.indicator_code === 'STEEL_SILICON_FOB_CN', 'FOB 中国'),
  ].filter(Boolean) as BriefMetric[];
  const coated = business?.by_product.find((row) => /冷镀|镀层|镀锌|锌铝镁/.test(row.label));
  if (coated && business) metrics.push({ id: 'steel-coated', label: '冷轧镀层业务量', value: tons(coated.volume_t), change: '内部占比 ' + fixed(coated.share_pct, 1) + '%', changePeriod: '业务结构', direction: 'neutral', detail: `${coated.label} · 当前无独立市场价格序列`, source: business.source.name, asOf: business.source.coverage_end, sourceId: 'internal-business-2025', sourceState: 'local' });
  return metrics;
}

function buildNews(data: StrategyDataBundle): BriefNewsItem[] {
  const source = data.fastNews;
  if (!source?.items?.length) return [];
  const rules: Array<{ label: string; terms: string[] }> = [
    { label: '热轧', terms: ['热轧', '热卷', '热轧卷'] },
    { label: '冷轧与镀层', terms: ['冷轧', '冷卷', '镀锌', '镀层', '锌铝镁', '镀锡'] },
    { label: '硅钢', terms: ['硅钢', '电工钢', '取向钢'] },
    { label: '出口与贸易', terms: ['出口', '进口', '反倾销', '贸易救济', '关税', '配额'] },
    { label: '运价与能源', terms: ['运费', '运价', '航运', '船期', '铁矿', '焦煤', '原油'] },
    { label: '价格与供需', terms: ['价格', '成交', '库存', '产量', '需求', '供需'] },
  ];
  const selected = source.items.map((item) => {
    const haystack = `${item.content_text} ${item.products.map((product) => product.name).join(' ')}`;
    const matchedTopics = rules.filter((rule) => rule.terms.some((term) => haystack.includes(term))).map((rule) => rule.label);
    return { ...item, matchedTopics, relevance: matchedTopics.length * 10 + (item.source_url ? 2 : 0) };
  }).filter((item) => item.matchedTopics.length).sort((a, b) => b.relevance - a.relevance || b.published_at_ms - a.published_at_ms);
  const seen = new Set<string>();
  return selected.filter((item) => {
    const key = item.content_text.replace(/\s+/g, '').slice(0, 90);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5).map(({ relevance: _relevance, ...item }) => item);
}

function buildSpread(data: StrategyDataBundle) {
  const latestDomestic = latestQuote(data.quotes, (row) => row.indicator_code === 'STEEL_HR_FOB_CN');
  const latestOverseas = latestQuote(data.quotes, (row) => row.indicator_code === 'STEEL_HR_CIF_EU');
  if (!latestDomestic || !latestOverseas) return { value: null, change: null, status: '待补' as const, alignment: 'strict' as const, detail: '缺少同口径热轧 FOB 中国或 CIF 欧洲最新值' };
  const commonDate = [latestDomestic.date, latestOverseas.date].sort()[0];
  const domestic = latestQuoteOnOrBefore(data.quotes, (row) => row.indicator_code === 'STEEL_HR_FOB_CN', commonDate);
  const overseas = latestQuoteOnOrBefore(data.quotes, (row) => row.indicator_code === 'STEEL_HR_CIF_EU', commonDate);
  const eurPoints = data.forex?.symbols?.EURUSD?.filter((point) => point.date <= commonDate) || [];
  const eurPoint = eurPoints[eurPoints.length - 1];
  const eurusd = eurPoint?.close;
  if (!domestic || !overseas || !eurusd || !eurPoint) return { value: null, change: null, status: '待补' as const, alignment: 'strict' as const, detail: '缺少共同截止日可对齐的热轧价格或 EURUSD' };
  const value = overseas.value * eurusd - domestic.value;
  const priorDates = [...new Set([
    ...data.quotes.filter((row) => ['STEEL_HR_FOB_CN', 'STEEL_HR_CIF_EU'].includes(row.indicator_code)).map((row) => row.date),
    ...(data.forex?.symbols?.EURUSD || []).map((point) => point.date),
  ])].filter((date) => date < commonDate).sort().reverse();
  const previousDate = priorDates.find((date) =>
    latestQuoteOnOrBefore(data.quotes, (row) => row.indicator_code === 'STEEL_HR_FOB_CN', date)
    && latestQuoteOnOrBefore(data.quotes, (row) => row.indicator_code === 'STEEL_HR_CIF_EU', date)
    && (data.forex?.symbols?.EURUSD || []).some((point) => point.date <= date),
  );
  const previousDomestic = previousDate ? latestQuoteOnOrBefore(data.quotes, (row) => row.indicator_code === 'STEEL_HR_FOB_CN', previousDate) : undefined;
  const previousOverseas = previousDate ? latestQuoteOnOrBefore(data.quotes, (row) => row.indicator_code === 'STEEL_HR_CIF_EU', previousDate) : undefined;
  const previousEur = previousDate ? [...(data.forex?.symbols?.EURUSD || [])].filter((point) => point.date <= previousDate).sort((a, b) => a.date.localeCompare(b.date)).pop()?.close : undefined;
  const previousValue = previousDomestic && previousOverseas && previousEur ? previousOverseas.value * previousEur - previousDomestic.value : null;
  const change = previousValue == null ? null : value - previousValue;
  const status: MorningBriefModel['spread']['status'] = change == null || Math.abs(change) < 1 ? '平稳' : change > 0 ? '扩大' : '收窄';
  return {
    value,
    change,
    status,
    asOf: commonDate,
    domesticAsOf: domestic.date,
    overseasAsOf: overseas.date,
    fxAsOf: eurPoint.date,
    alignment: 'as-of' as const,
    detail: `共同截止日 ${commonDate}（截至口径） · 中国 FOB ${domestic.date} · 欧洲 CIF ${overseas.date} · EURUSD ${eurPoint.date} · ${fixed(overseas.value, 0)} ${overseas.unit} × ${fixed(eurusd, 4)} − ${fixed(domestic.value, 0)} ${domestic.unit}${previousDate ? ` · 对比 ${previousDate}` : ''}`,
  };
}

function latestQuoteOnOrBefore(rows: MarketQuote[], predicate: (row: MarketQuote) => boolean, date: string) {
  const sorted = rows.filter((row) => predicate(row) && row.date <= date).sort((a, b) => `${a.date}${a.publish_time}`.localeCompare(`${b.date}${b.publish_time}`));
  return sorted[sorted.length - 1];
}

function isActiveRemedy(item: TradeRemedyCase) {
  // 与贸易救济适配器的 summary.active_case_count 使用同一口径：
  // 仅排除源站明确标记为终止或撤销的案件，不用模糊的阶段关键词代替源站状态。
  return !/终止|撤销/.test(String(item.case_state));
}

function buildRemedy(data: StrategyDataBundle): BriefRemedy | null {
  const snapshot: TradeRemedySnapshot | null | undefined = data.tradeRemedy;
  const business = data.internalBusiness;
  if (!snapshot?.cases?.length) return null;
  const destinations = business?.by_destination || [];
  const products = business?.by_product || [];
  const active = snapshot.cases.filter(isActiveRemedy);
  const ranked = active.map((item) => {
    const linkedDestinations = destinations.filter((destination) => destination.label === item.country || destination.label.includes(item.country) || item.country.includes(destination.label)).map((destination) => destination.label);
    const productMatches = products.filter((product) => item.variety_tags.some((tag) => product.label.includes(tag) || tag.includes(product.label))).map((product) => product.label);
    const impact = 5 + (linkedDestinations.length ? 6 : 0) + (productMatches.length ? 4 : 0) + (item.final_rate_pct != null && item.final_rate_pct > 0 ? 4 : 0);
    return { item, linkedDestinations, productMatches, impact };
  }).sort((a, b) => b.impact - a.impact || (b.item.latest_stage_date || '').localeCompare(a.item.latest_stage_date || ''))[0];
  if (!ranked) return null;
  return { caseItem: ranked.item, impact: ranked.impact >= 10 ? '高' : '中', linkedDestinations: ranked.linkedDestinations, productMatches: ranked.productMatches, activeCaseCount: active.length, totalCaseCount: snapshot.summary.total_cases };
}

function buildQuota(data: StrategyDataBundle) {
  const quota = data.taricQuota;
  const eu = quota?.eu || (quota ? { ...quota.latest, history: quota.history } : null);
  const uk = quota?.uk;
  return {
    eu: eu ? { balance: eu.summary.balance_t, usedPct: eu.summary.initial_amount_t ? eu.summary.used_t / eu.summary.initial_amount_t * 100 : null, remainingPct: eu.summary.remaining_pct, asOf: eu.as_of } : null,
    uk: uk ? { balance: uk.summary.balance_t, usedPct: uk.summary.opening_balance_t ? uk.summary.used_t / uk.summary.opening_balance_t * 100 : null, remainingPct: uk.summary.remaining_pct, asOf: uk.as_of } : null,
  };
}

function buildConclusionItems(data: StrategyDataBundle, spread: MorningBriefModel['spread'], metrics: BriefMetric[], risks: RiskSignal[], remedy: BriefRemedy | null, quota: MorningBriefModel['quota'], news: BriefNewsItem[]): BriefConclusionItem[] {
  const items: BriefConclusionItem[] = [];
  if (spread.status === '待补') items.push({ id: 'spread', label: '国内外价差', text: morningBriefCorpus.spread.missing[0], tone: 'neutral' });
  else {
    const spreadText = spread.status === '扩大' ? choosePhrase(morningBriefCorpus.spread.wider, Math.round(spread.value || 0)) : spread.status === '收窄' ? choosePhrase(morningBriefCorpus.spread.narrower, Math.round(spread.value || 0)) : morningBriefCorpus.spread.stable[0];
    items.push({ id: 'spread', label: '国内外价差', text: `${spreadText} 当前约 ${spread.value == null ? '—' : `${spread.value >= 0 ? '+' : ''}${fixed(spread.value)} USD/t`}，按共同截止日截至口径计算。`, tone: spread.status === '扩大' ? 'green' : spread.status === '收窄' ? 'amber' : 'blue' });
  }
  const trackedMetrics = metrics.filter((metric) => metric.change !== '—').slice(0, 5);
  if (trackedMetrics.length) items.push({ id: 'indicators', label: '核心指标', text: `${trackedMetrics.map((metric) => `${metric.label} ${metric.changePeriod || '最新变动'} ${metric.change}`).join('；')}。热轧、冷轧、硅钢及冷轧镀层业务量均按已接入口径跟踪。`, tone: trackedMetrics.some((metric) => metric.direction === 'down') ? 'amber' : 'blue' });
  const activeRisks = risks.filter((risk) => risk.level !== 'normal' && risk.review_status !== 'dismissed');
  if (news.length) items.push({ id: 'news', label: '行业快讯', text: `已从我的钢铁网按业务词条筛出 ${news.length} 条核心快讯，当前优先关注${news[0].matchedTopics.slice(0, 2).join('、') || '行业变化'}；正文和原文入口见下方。`, tone: 'blue' });
  items.push({ id: 'risk', label: '风险闸门', text: activeRisks.length ? `${morningBriefCorpus.risk.gate[activeRisks.length % morningBriefCorpus.risk.gate.length]} 当前置顶 ${activeRisks.length} 项：${activeRisks.slice(0, 2).map((risk) => factorLabel[risk.factor] || risk.factor).join('、')}。` : morningBriefCorpus.risk.clear[0], tone: activeRisks.some((risk) => risk.level === 'critical') ? 'red' : activeRisks.length ? 'amber' : 'green' });
  if (remedy) items.push({ id: 'remedy', label: '贸易救济', text: `当前活动案件 ${remedy.activeCaseCount}/${remedy.totalCaseCount} 项；主导事项为${remedy.caseItem.country} ${remedy.caseItem.case_type}，${remedy.linkedDestinations.length ? `与内部目的国${remedy.linkedDestinations.join('、')}存在交集，` : '暂未匹配内部目的国聚合，'}相关报价先做 HS、措施和生效期核验。`, tone: remedy.linkedDestinations.length ? 'red' : 'amber' });
  const quotaTight = [quota.eu?.remainingPct, quota.uk?.remainingPct].some((value) => value != null && value < 30);
  const quotaParts = [quota.eu && `EU 剩余 ${fixed(quota.eu.remainingPct)}%`, quota.uk && `UK 剩余 ${fixed(quota.uk.remainingPct)}%`].filter(Boolean);
  if (quotaParts.length) items.push({ id: 'quota', label: '配额状态', text: `${quotaParts.join('；')}。${quotaTight ? morningBriefCorpus.quota.tight[0] : morningBriefCorpus.quota.watch[0]}`, tone: quotaTight ? 'amber' : 'green' });
  const business = data.internalBusiness;
  const latestMonth = business?.monthly[business.monthly.length - 1];
  const topDestination = business?.by_destination[0];
  const topProduct = business?.by_product[0];
  if (business && latestMonth && topDestination && topProduct) {
    const growthText = latestMonth.actual_growth_pct == null ? '当前月度基线已建立' : `最近月实际出口${latestMonth.actual_growth_pct >= 0 ? '环比增长' : '环比下降'} ${fixed(Math.abs(latestMonth.actual_growth_pct))}%`;
    items.push({ id: 'business', label: '内部业务', text: `2025 年脱敏聚合：${growthText}；目的国 Top1 为${topDestination.label}（${tons(topDestination.volume_t)}），产品 Top1 为${topProduct.label}（${tons(topProduct.volume_t)}）。用于确定关注顺序，不替代订单级判断。`, tone: latestMonth.actual_growth_pct != null && latestMonth.actual_growth_pct < 0 ? 'amber' : 'blue' });
  }
  const degraded = Object.entries(data.syncStatus?.sources || {}).filter(([, source]) => source.state !== 'fresh').map(([sourceId]) => sourceId);
  const newsQualityDegraded = Boolean(data.fastNews?.source.truncation_detected || data.fastNews?.quality.warnings.length);
  if (degraded.length) items.push({ id: 'data-state', label: '数据状态', text: morningBriefCorpus.degraded, tone: 'amber' });
  else if (newsQualityDegraded) items.push({ id: 'data-state', label: '数据状态', text: '我的钢铁网本期已完成抓取，但源站报告量高于当前分页采集范围；下方只使用已采集且命中业务词条的内容。', tone: 'amber' });
  return items;
}

export function buildMorningBrief(data: StrategyDataBundle): MorningBriefModel {
  const advice = buildDataDrivenAdvice(data);
  const salesPlan = buildDataDrivenSalesPlan(data);
  const activeRisks = data.risks.filter((risk) => risk.level !== 'normal' && risk.review_status !== 'dismissed');
  const risks = activeRisks.sort((a, b) => b.score - a.score).slice(0, 4);
  const latestPolicyDate = [...data.policies].sort((a, b) => b.publish_date.localeCompare(a.publish_date))[0]?.publish_date;
  const policyWindow = latestPolicyDate ? data.policies.filter((policy) => policy.publish_date >= latestPolicyDate.slice(0, 7) + '-01').sort((a, b) => b.severity - a.severity) : [];
  const policies = policyWindow.slice(0, 3);
  const spread = buildSpread(data);
  const quota = buildQuota(data);
  const remedy = buildRemedy(data);
  const news = buildNews(data);
  const metrics = [
    buildQuoteMetric(data.quotes, 'carbon', '碳价', (row) => row.indicator_code === 'CARBON_EUA', 'EU ETS'),
    buildShippingMetric(data.shippingIndices, 'BDI', '干散货指数', 'BDI 波罗的海'),
    buildShippingMetric(data.shippingIndices, 'CCFI', '集装箱指数', 'CCFI 中国出口'),
    ...buildForexMetrics(data),
    ...buildSteelMetrics(data.quotes, data.internalBusiness),
  ].filter(Boolean) as BriefMetric[];
  const conclusionItems = buildConclusionItems(data, spread, metrics, risks, remedy, quota, news);
  const sourceEntries = Object.entries(data.syncStatus?.sources || {});
  const degradedSources = data.syncStatus ? sourceEntries.filter(([, source]) => source.state !== 'fresh').map(([sourceId]) => sourceId) : ['sync-status-unavailable'];
  const fallbackSources = sourceEntries.filter(([, source]) => source.state === 'fallback').map(([sourceId]) => sourceId);
  if (data.fastNews?.source.truncation_detected || data.fastNews?.quality.warnings.length) degradedSources.push('mysteel-fast-news:quality');
  const dataState = !data.quotes.length && !data.internalBusiness && !data.fastNews ? 'unavailable' : !data.syncStatus || degradedSources.length || Boolean(data.fastNews?.source.truncation_detected || data.fastNews?.quality.warnings.length) ? 'partial' : 'ready';
  const metricStatus = (metric: BriefMetric): BriefMetric => {
    if (metric.sourceState === 'local' || !metric.sourceId) return metric;
    return { ...metric, sourceState: data.syncStatus?.sources[metric.sourceId]?.state || 'unavailable' };
  };
  const business = data.internalBusiness ? {
    totalVolume: data.internalBusiness.summary.total_volume_t,
    topDestination: data.internalBusiness.by_destination[0] || null,
    topProduct: data.internalBusiness.by_product[0] || null,
    growthTargetPct: data.internalBusiness.business_assumptions.target_growth_pct,
  } : null;
  return {
    generatedAt: new Date().toISOString(),
    dataSyncGeneratedAt: data.syncStatus?.generated_at || null,
    conclusion: conclusionItems.map((item) => item.text).join(' '),
    conclusionItems,
    spread,
    metrics: metrics.map(metricStatus),
    monthlyPulse: data.internalBusiness?.monthly || [],
    business,
    advice: advice.filter((item) => item.category !== '经营' || item.id === 'internal-business-pulse').slice(0, 5),
    salesPlan,
    news,
    newsSource: data.fastNews,
    risks,
    riskTotalCount: activeRisks.length,
    policies,
    policyWindowCount: policyWindow.length,
    remedy,
    quota,
    dataState,
    degradedSources,
    fallbackSources,
  };
}

export function shippingPoint(snapshot: ShippingIndexSnapshot | null | undefined, code: string): ShippingIndexPoint | null {
  return latestShipping(snapshot, code) || null;
}
