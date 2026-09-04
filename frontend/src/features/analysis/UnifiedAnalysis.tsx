import { useEffect, useMemo, useState } from 'react';
import { useRef } from 'react';
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
  internalBusiness: InternalBusinessSnapshot | null;
  steelExport: SteelExportSnapshot | null;
  taricQuota: TaricQuotaSnapshot | null;
  advice: DataDrivenAdvice[];
  tradeRemedy: TradeRemedySnapshot | null;
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
    const quotaText = quota ? `${quota.sourceLabel}；余额 ${formatNumber(quota.balance, 0)} 吨，剩余 ${quota.remainingPct == null ? '—' : `${quota.remainingPct.toFixed(1)}%`}${quota.critical ? '，临界' : ''}` : '该市场配额数据未接入，不能视为无配额限制';
    const remedyText = remedy ? `案件 ${remedy.case_count} 件；执行中 ${remedy.measures_in_force} 件；调查中 ${remedy.investigating} 件；${remedySafety.status}` : '未匹配到该市场案件，仍需国家/产品/HS级核验';
    const historyText = hasHistory ? `海关 ${externalQty == null ? '—' : `${formatNumber(externalQty, 0)} 吨`}；内部 ${internalQty == null ? '—' : `${formatNumber(internalQty, 0)} 吨`}；历史基础 ${historyScore!.toFixed(1)} 分` : '暂无可匹配的历史出口数据';
    const missingItems = [
      !externalQty ? '海关出口' : '',
      !internalQty ? '内部业务' : '',
      !hasHistory ? '历史出口（海关/内部）' : '',
      !remedy ? (tradeRemedy ? '贸易救济国家/产品/HS匹配' : '贸易救济数据源') : '',
      !quota ? '配额' : '',
    ].filter(Boolean);
    const dataScope = euMemberWorldNames.has(worldName) ? '国家出口事实；欧盟案件/配额不复制到成员国' : worldName === 'European Union' ? '欧盟区域主体汇总；不拆分为成员国独立配额' : '市场级出口、案件与配额匹配；产品/HS级仍需复核';
    const freshness = `海关抓取 ${steelExport?.source.captured_at || steelExport?.source.generated_at || '—'}；内部业务快照 ${internalBusiness?.source.captured_at || '2025-12'}；贸易救济抓取 ${tradeRemedy?.source.captured_at || tradeRemedy?.source.generated_at || '—'}；配额抓取 ${taricQuota?.source.captured_at || '—'}`;
    const scoreText = score == null ? '不输出可比综合分' : scoreKind === 'full' ? `${score} 分（满条件可比）` : `${score} 分（市场级参考，不与满条件分横比）`;
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
      detail: `评估状态：${status}<br/>适用规则：${opportunityRuleLabel(rule)}<br/>评分输出：${scoreText}${isRestricted ? '（执行中措施封顶 20 分）' : ''}<br/>${historyText}<br/>配额：${quotaText}<br/>贸易救济：${remedyText}<br/>缺失项：${missingItems.length ? missingItems.join('、') : '无'}<br/>数据时间：${freshness}<br/>匹配口径：${dataScope}`,
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
      tooltip: { trigger: 'item', formatter: (params: any) => `${params.data?.chineseName || opportunityWorldChinese[params.name] || params.name}<br/>${params.data?.detail || (params.value == null ? '暂无数据：尚未匹配到已接入数据源' : `数值：${params.value}`)}` },
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
      return { name: indicatorChinese[code] || humanizeDisplay(code), type: 'line' as const, smooth: true, showSymbol: false, data: trendDates.map((date) => seriesQuotes.get(date) ?? null) };
    });
    const text = chartTheme.text;
    chart.setOption({
      color: [chartTheme.blue, chartTheme.lightBlue, chartTheme.orange, chartTheme.green],
      grid: { left: 48, right: 18, top: 30, bottom: 34, containLabel: true },
      tooltip: { trigger: 'axis' },
      legend: { top: 0, type: 'scroll', textStyle: { color: text, fontSize: 12 } },
      xAxis: { type: 'category', data: trendDates, axisLabel: { color: text, fontSize: 11, interval: Math.max(0, Math.ceil(trendDates.length / 7) - 1), hideOverlap: true }, axisLine: { lineStyle: { color: chartTheme.grid } } },
      yAxis: { type: 'value', name: '基期=100', nameTextStyle: { color: text, fontSize: 12 }, axisLabel: { color: text, fontSize: 11 }, splitLine: { lineStyle: { color: chartTheme.grid } } },
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

interface InternalBusinessChartsProps {
  snapshot: InternalBusinessSnapshot;
  variant: 'concern' | 'compare';
}

function InternalBusinessCharts({ snapshot, variant }: InternalBusinessChartsProps) {
  const firstRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  const themeKey = useThemeKey();

  useEffect(() => {
    const firstNode = firstRef.current;
    const secondNode = secondRef.current;
    if (!firstNode || !secondNode) return;
    const first = echarts.getInstanceByDom(firstNode) || echarts.init(firstNode);
    const second = echarts.getInstanceByDom(secondNode) || echarts.init(secondNode);
    const chartTheme = chartThemeFromCss();
    const text = chartTheme.text;
    const grid = chartTheme.grid;
    const actual = snapshot.monthly;
    const number = (value: number) => formatNumber(value, 0);

    if (variant === 'concern') {
      first.setOption({
        color: [chartTheme.blue, chartTheme.orange],
        grid: { left: 52, right: 22, top: 28, bottom: 34, containLabel: true },
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const row = actual[params[0]?.dataIndex];
            return `${row?.month || ''}<br/>实际出口量：${number(row?.actual_volume_t || 0)} 吨<br/>目标出口量：${number(row?.target_volume_t || 0)} 吨<br/>实际环比：${row?.actual_growth_pct == null ? '—' : `${row.actual_growth_pct >= 0 ? '+' : ''}${row.actual_growth_pct.toFixed(2)}%`}<br/>目标达成：${row?.actual_growth_met == null ? '基线月' : row.actual_growth_met ? '已达成' : '未达成'}`;
          },
        },
        legend: { top: 0, textStyle: { color: text, fontSize: 12 } },
        xAxis: { type: 'category', data: actual.map((row) => row.label), axisLabel: { color: text, fontSize: 12 }, axisLine: { lineStyle: { color: grid } } },
        yAxis: { type: 'value', name: '吨', nameTextStyle: { color: text, fontSize: 12 }, axisLabel: { color: text, fontSize: 12 }, splitLine: { lineStyle: { color: grid } } },
        series: [
          { name: '实际出口量', type: 'bar', barWidth: '42%', data: actual.map((row) => row.actual_volume_t), itemStyle: { color: chartTheme.blue, borderRadius: [4, 4, 0, 0] } },
          { name: '目标线 · +1%', type: 'line', smooth: true, symbolSize: 7, data: actual.map((row) => row.target_volume_t), lineStyle: { color: chartTheme.orange, type: 'dashed', width: 2 }, itemStyle: { color: chartTheme.orange } },
        ],
      }, true);

      const rows = snapshot.by_product.slice(0, 8).reverse();
      second.setOption({
        grid: { left: 88, right: 30, top: 18, bottom: 28, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => { const row = rows[params[0]?.dataIndex]; return `${row?.label || ''}<br/>出口量：${number(row?.volume_t || 0)} 吨<br/>占年度：${row?.share_pct?.toFixed(1) || '0.0'}%<br/>记录数：${row?.record_count || 0}`; } },
        xAxis: { type: 'value', name: '吨', nameTextStyle: { color: text, fontSize: 12 }, axisLabel: { color: text, fontSize: 12 }, splitLine: { lineStyle: { color: grid } } },
        yAxis: { type: 'category', inverse: true, data: rows.map((row) => row.label), axisLabel: { color: text, fontSize: 12 }, axisLine: { lineStyle: { color: grid } } },
        series: [{ name: '出口量', type: 'bar', barWidth: '58%', data: rows.map((row) => row.volume_t), itemStyle: { color: chartTheme.lightBlue, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: text, fontSize: 11, formatter: (params: any) => number(params.value) } }],
      }, true);
    } else {
      const regionRows = snapshot.by_region.slice(0, 8).reverse();
      const destinationRows = snapshot.by_destination.slice(0, 10).reverse();
      const horizontalBar = (rows: typeof regionRows, color: string, unit: string): echarts.EChartsOption => ({
        grid: { left: 88, right: 30, top: 18, bottom: 28, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => { const row = rows[params[0]?.dataIndex]; return `${row?.label || ''}<br/>出口量：${number(row?.volume_t || 0)} ${unit}<br/>占年度：${row?.share_pct?.toFixed(1) || '0.0'}%<br/>记录数：${row?.record_count || 0}`; } },
        xAxis: { type: 'value', name: unit, nameTextStyle: { color: text, fontSize: 12 }, axisLabel: { color: text, fontSize: 12 }, splitLine: { lineStyle: { color: grid } } },
        yAxis: { type: 'category', inverse: true, data: rows.map((row) => row.label), axisLabel: { color: text, fontSize: 12 }, axisLine: { lineStyle: { color: grid } } },
        series: [{ type: 'bar', barWidth: '56%', data: rows.map((row) => row.volume_t), itemStyle: { color, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: text, fontSize: 11, formatter: (params: any) => number(params.value) } }],
      });
      first.setOption(horizontalBar(regionRows, chartTheme.blue, '吨'), true);
      second.setOption(horizontalBar(destinationRows, chartTheme.lightBlue, '吨'), true);
    }

    const resize = () => { first.resize(); second.resize(); };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(firstNode);
    observer?.observe(secondNode);
    window.addEventListener('resize', resize);
    const frame = window.requestAnimationFrame(resize);
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', resize); first.dispose(); second.dispose(); };
  }, [snapshot, themeKey, variant]);

  const summary = snapshot.summary;
  const concentration = snapshot.customer_concentration;
  return (
    <section className="internal-business-panel" aria-label={variant === 'concern' ? '内部出口业务关注' : '内部出口与市场综合对照'}>
      <div className="internal-business-heading">
        <div><span className="internal-business-kicker">INTERNAL BUSINESS · 2025</span><h3>{variant === 'concern' ? '内部出口业务关注' : '企业出口结构对照'}</h3></div>
        <span>{variant === 'concern' ? '脱敏聚合' : '企业内部结构 · 与外部行情分开展示'} · {snapshot.source.coverage_start} 至 {snapshot.source.coverage_end}</span>
      </div>
      <div className="internal-business-kpis">
        <div><span>年度出口量</span><strong>{formatNumber(summary.total_volume_t / 10000, 2)} 万吨</strong><small>{summary.record_count.toLocaleString('zh-CN')} 条记录</small></div>
        <div><span>目的国覆盖</span><strong>{summary.country_count} 个</strong><small>已纳入 2025 全年</small></div>
        <div><span>产品品种</span><strong>{summary.product_count} 类</strong><small>另有 {summary.fine_product_count} 类细分</small></div>
        <div><span>渠道结构</span><strong>{(snapshot.by_direct_supply.find((row) => row.label.includes('非直供'))?.share_pct || 0).toFixed(1)}%</strong><small>中间商渠道占比 · Top10客户 {concentration.top10_share_pct.toFixed(1)}%</small></div>
      </div>
      <div className="internal-business-chart-grid">
        <article className="internal-business-chart-card"><div className="internal-business-chart-title"><strong>{variant === 'concern' ? '月度出口量与增长目标' : '区域出口结构'}</strong><span>{variant === 'concern' ? '实线为实际 · 虚线为业务目标 +1%' : '按二级区域分类 · 年度占比'}</span></div><div ref={firstRef} className="internal-business-chart" /></article>
        <div className="internal-business-destination-stack">
          <article className="internal-business-chart-card"><div className="internal-business-chart-title"><strong>{variant === 'concern' ? '产品结构贡献' : '目的国出口 Top 10'}</strong><span>{variant === 'concern' ? '前 8 类 · 出口量' : '国家/地区 · 出口量'}</span></div><div ref={secondRef} className="internal-business-chart" /></article>
        </div>
      </div>
      <div className="internal-business-note"><span>口径说明</span><p>{snapshot.business_assumptions.note} 实际出口量按装船数量（吨）有符号求和；3 条负数调整记录保留在质量口径中，未被删除或取绝对值。</p></div>
    </section>
  );
}

interface DestinationPolicyPanelProps {
  snapshot: InternalBusinessSnapshot;
  policies: PolicyEvent[];
  steelExport: SteelExportSnapshot | null;
}

function DestinationPolicyPanel({ snapshot, policies, steelExport }: DestinationPolicyPanelProps) {
  const internalChartRef = useRef<HTMLDivElement>(null);
  const customsChartRef = useRef<HTMLDivElement>(null);
  const distributionChartRef = useRef<HTMLDivElement>(null);
  const themeKey = useThemeKey();

  useEffect(() => {
    const internalNode = internalChartRef.current;
    const customsNode = customsChartRef.current;
    const distributionNode = distributionChartRef.current;
    if (!internalNode || !customsNode || !distributionNode) return;
    const charts = [internalNode, customsNode, distributionNode].map((node) => echarts.getInstanceByDom(node) || echarts.init(node));
    const chartTheme = chartThemeFromCss();
    const internalRows = snapshot.by_destination.slice(0, 10).reverse();
    const customsTotal = steelExport?.default_view.partner.reduce((sum, row) => sum + Math.max(0, row.qty_t), 0) || 0;
    const customsRows = (steelExport?.default_view.partner || []).slice(0, 10).reverse().map((row) => ({
      label: row.label,
      volume_t: row.qty_t,
      share_pct: customsTotal ? row.qty_t / customsTotal * 100 : 0,
    }));
    const comparisonNames = [...new Set([
      ...snapshot.by_destination.slice(0, 10).map((row) => row.label),
      ...(steelExport?.default_view.partner || []).slice(0, 10).map((row) => row.label),
    ])]
      .map((label) => ({
        label,
        internal: snapshot.by_destination.find((row) => row.label === label)?.share_pct || 0,
        customs: customsTotal ? ((steelExport?.default_view.partner.find((row) => row.label === label)?.qty_t || 0) / customsTotal) * 100 : 0,
      }))
      .sort((a, b) => (b.internal + b.customs) - (a.internal + a.customs))
      .slice(0, 10)
      .reverse();
    const number = (value: number) => formatNumber(value, 0);
    const volumeBarOption = (rows: Array<{ label: string; volume_t: number; share_pct?: number; record_count?: number }>, name: string, color: string): echarts.EChartsOption => ({
      grid: { left: 96, right: 38, top: 18, bottom: 28, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => { const row = rows[params[0]?.dataIndex]; return `${row?.label || ''}<br/>${name}：${number(row?.volume_t || 0)} 吨<br/>占本组：${row?.share_pct?.toFixed(1) || '—'}%${row?.record_count == null ? '' : `<br/>记录数：${row.record_count}`}`; } },
      xAxis: { type: 'value', name: '吨', nameTextStyle: { color: chartTheme.text, fontSize: 12 }, axisLabel: { color: chartTheme.text, fontSize: 12 }, splitLine: { lineStyle: { color: chartTheme.grid } } },
      yAxis: { type: 'category', inverse: true, data: rows.map((row) => row.label), axisLabel: { color: chartTheme.text, fontSize: 12 }, axisLine: { lineStyle: { color: chartTheme.grid } } },
      series: [{ name, type: 'bar', barWidth: '56%', data: rows.map((row) => row.volume_t), itemStyle: { color, borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: chartTheme.text, fontSize: 11, formatter: (params: any) => number(params.value) } }],
    });
    charts[0].setOption(volumeBarOption(internalRows, '内部出口量', chartTheme.blue), true);
    charts[1].setOption(volumeBarOption(customsRows, '海关出口量', chartTheme.orange), true);
    charts[2].setOption({
      grid: { left: 96, right: 34, top: 34, bottom: 30, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => `${params[0]?.name}<br/>内部业务：${params[0]?.value?.toFixed?.(1) || '0.0'}%<br/>海关出口：${params[1]?.value?.toFixed?.(1) || '0.0'}%` },
      legend: { top: 0, textStyle: { color: chartTheme.text, fontSize: 12 } },
      xAxis: { type: 'value', name: '占各自出口总量（%）', max: 'dataMax', nameTextStyle: { color: chartTheme.text, fontSize: 12 }, axisLabel: { color: chartTheme.text, fontSize: 12, formatter: '{value}%' }, splitLine: { lineStyle: { color: chartTheme.grid } } },
      yAxis: { type: 'category', inverse: true, data: comparisonNames.map((row) => row.label), axisLabel: { color: chartTheme.text, fontSize: 12 }, axisLine: { lineStyle: { color: chartTheme.grid } } },
      series: [
        { name: '内部业务', type: 'bar', barWidth: '34%', data: comparisonNames.map((row) => Number(row.internal.toFixed(1))), itemStyle: { color: chartTheme.blue, borderRadius: [0, 4, 4, 0] } },
        { name: '海关出口', type: 'bar', barWidth: '34%', data: comparisonNames.map((row) => Number(row.customs.toFixed(1))), itemStyle: { color: chartTheme.orange, borderRadius: [0, 4, 4, 0] } },
      ],
    }, true);
    const resize = () => charts.forEach((chart) => chart.resize());
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(internalNode);
    observer?.observe(customsNode);
    observer?.observe(distributionNode);
    window.addEventListener('resize', resize);
    const frame = window.requestAnimationFrame(resize);
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', resize); charts.forEach((chart) => chart.dispose()); };
  }, [snapshot, steelExport, themeKey]);

  return (
    <section className="destination-policy-panel" aria-label="内外部目的国出口对比与政策事件时间线">
      <div className="destination-policy-top-grid">
        <article className="destination-policy-chart-card">
          <div className="internal-business-chart-title"><strong>内部业务 · 目的国出口 Top 10</strong><span>2025 年全年 · 国家/地区出口量</span></div>
          <div ref={internalChartRef} className="destination-policy-chart" />
        </article>
        <article className="destination-policy-chart-card">
          <div className="internal-business-chart-title"><strong>海关出口 · 目的国 Top 10</strong><span>{steelExport ? `${steelExport.default_view.filter.year} 年快照 · 国家/地区出口量` : '暂无海关出口快照'}</span></div>
          {steelExport ? <div ref={customsChartRef} className="destination-policy-chart" /> : <div className="destination-policy-empty">暂无海关出口快照，暂不能进行外部平行对比。</div>}
        </article>
      </div>
      <article className="destination-policy-distribution">
        <div className="internal-business-chart-title"><strong>出口分布分析对比</strong><span>Top 10 目的国占各自出口总量的比例，消除总量规模差异</span></div>
        <div ref={distributionChartRef} className="destination-policy-distribution-chart" />
      </article>
      <article className="destination-policy-timeline">
        <div className="internal-business-chart-title"><strong>政策事件时间线</strong><span>按发布日期展开严重政策事件</span></div>
        <PolicyTimeline policies={policies} />
      </article>
    </section>
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
  const [internalBusiness, setInternalBusiness] = useState<InternalBusinessSnapshot | null>(null);
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
      dataProvider.getInternalBusinessSnapshot(),
    ])
      .then(([nextQuotes, nextAggregates, nextCosts, nextScenarios, nextPolicies, nextSignals, nextSteelExport, nextForex, nextTaricQuota, nextTradeRemedy, nextShippingIndices, nextSyncStatus, nextInternalBusiness]) => {
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
    return items;
  }, [metrics]);

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
      grid: { left: 76, right: 20, top: 48, bottom: 38, containLabel: true },
      tooltip: { trigger: 'axis', formatter: (params: any) => `${params[0]?.axisValue}% 情景变化<br/>${params.map((item: any) => `${item.seriesName}：${item.value}`).join('<br/>')}` },
      legend: { top: 0, left: 'center', right: 8, type: 'scroll', textStyle: { color: chartTheme.text, fontSize: 13 } },
      xAxis: { type: 'category', boundaryGap: false, data: pctValues.map((value) => `${value > 0 ? '+' : ''}${value}%`), axisLabel: { color: chartTheme.text, fontSize: 13, interval: (index: number) => index % 2 === 0, hideOverlap: true }, axisLine: { lineStyle: { color: chartTheme.grid } } },
      yAxis: { type: 'value', name: '相对基准指数', nameLocation: 'middle', nameGap: 48, nameTextStyle: { color: chartTheme.text, fontSize: 12 }, axisLabel: { color: chartTheme.text, fontSize: 13 }, splitLine: { lineStyle: { color: chartTheme.grid } } },
      series: pairs.map((pair) => ({ name: pair, type: 'line' as const, smooth: true, symbolSize: 7, data: pctValues.map((pct) => { const item = scenarios.find((scenario) => `${scenario.base_currency}/${scenario.quote_currency}` === pair && scenario.scenario_pct === pct); return item ? Number((item.scenario_rate / item.base_rate * 100).toFixed(2)) : null; }) })),
    };
  }, [chartTheme, scenarios]);

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
        {!loading && <ObjectiveCharts quotes={quotes} aggregates={aggregates} costs={costs} scenarios={scenarios} internalBusiness={internalBusiness} steelExport={steelExport} taricQuota={taricQuota} tradeRemedy={tradeRemedy} advice={analysisAdvice} />}
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
        <div className="concern-grid">{concernItems.map((item) => <div className={`concern-card concern-${item.tone}`} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div>
        {internalBusiness && <InternalBusinessCharts snapshot={internalBusiness} variant="concern" />}
      </section>

      {internalBusiness && <DestinationPolicyPanel snapshot={internalBusiness} policies={policies} steelExport={steelExport} />}

      <section className="analysis-section conclusion-section">
        <div className="section-heading"><div><h2>总结与风险信号</h2></div><p>风险信号来自客观数据变化，仍需人工审核确认</p></div>
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
