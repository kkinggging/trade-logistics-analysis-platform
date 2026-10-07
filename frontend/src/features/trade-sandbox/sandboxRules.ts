import type {
  InternalBusinessCustomerSnapshot,
  PolicyEvent,
  TradeRemedySnapshot,
} from '@/core/store/types';
import type {
  SandboxConfig,
  SandboxCountry,
  SandboxDataBundle,
  SandboxDirection,
  SandboxFlow,
  SandboxImpactLevel,
  SandboxMarker,
  SandboxScenarioResult,
  SandboxVariable,
} from './sandboxTypes';

export interface SandboxFeature {
  type?: string;
  geometry: { type: string; coordinates: unknown };
  properties?: { name?: string; [key: string]: unknown };
}

export interface Coordinate { lat: number; lng: number }

const aliases: Record<string, string> = {
  china: 'China', 中国: 'China', korea: 'Korea', 韩国: 'Korea', 'south korea': 'Korea',
  vietnam: 'Vietnam', 越南: 'Vietnam', japan: 'Japan', 日本: 'Japan', india: 'India', 印度: 'India',
  'united states': 'United States', 'united states of america': 'United States', 美国: 'United States',
  'united kingdom': 'United Kingdom', 英国: 'United Kingdom', russia: 'Russia', 俄罗斯: 'Russia',
  germany: 'Germany', 德国: 'Germany', france: 'France', 法国: 'France', italy: 'Italy', 意大利: 'Italy',
  spain: 'Spain', 西班牙: 'Spain', portugal: 'Portugal', 葡萄牙: 'Portugal', turkey: 'Turkey', 土耳其: 'Turkey',
  'saudi arabia': 'Saudi Arabia', 沙特阿拉伯: 'Saudi Arabia', mexico: 'Mexico', 墨西哥: 'Mexico',
  brazil: 'Brazil', 巴西: 'Brazil', canada: 'Canada', 加拿大: 'Canada', australia: 'Australia', 澳大利亚: 'Australia',
  thailand: 'Thailand', 泰国: 'Thailand', indonesia: 'Indonesia', 印度尼西亚: 'Indonesia',
  malaysia: 'Malaysia', 马来西亚: 'Malaysia', singapore: 'Singapore', 新加坡: 'Singapore',
  philippines: 'Philippines', 菲律宾: 'Philippines', pakistan: 'Pakistan', 巴基斯坦: 'Pakistan',
  bangladesh: 'Bangladesh', 孟加拉国: 'Bangladesh', 'united arab emirates': 'United Arab Emirates', 阿联酋: 'United Arab Emirates',
  egypt: 'Egypt', 埃及: 'Egypt', 'south africa': 'South Africa', 南非: 'South Africa', morocco: 'Morocco', 摩洛哥: 'Morocco',
  belgium: 'Belgium', 比利时: 'Belgium', netherlands: 'Netherlands', 荷兰: 'Netherlands', poland: 'Poland', 波兰: 'Poland',
  greece: 'Greece', 希腊: 'Greece', switzerland: 'Switzerland', 瑞士: 'Switzerland', austria: 'Austria', 奥地利: 'Austria',
  sweden: 'Sweden', 瑞典: 'Sweden', norway: 'Norway', 挪威: 'Norway', denmark: 'Denmark', 丹麦: 'Denmark',
  finland: 'Finland', 芬兰: 'Finland', ireland: 'Ireland', 爱尔兰: 'Ireland', ukraine: 'Ukraine', 乌克兰: 'Ukraine',
  israel: 'Israel', 以色列: 'Israel', iran: 'Iran', 伊朗: 'Iran', qatar: 'Qatar', 卡塔尔: 'Qatar', oman: 'Oman', 阿曼: 'Oman',
  colombia: 'Colombia', 哥伦比亚: 'Colombia', peru: 'Peru', 秘鲁: 'Peru', chile: 'Chile', 智利: 'Chile',
  'czech rep.': 'Czech Rep.', 'czech republic': 'Czech Rep.', 捷克: 'Czech Rep.', romania: 'Romania', 罗马尼亚: 'Romania',
  hungary: 'Hungary', 匈牙利: 'Hungary', bulgaria: 'Bulgaria', 保加利亚: 'Bulgaria', serbia: 'Serbia', 塞尔维亚共和国: 'Serbia',
  croatia: 'Croatia', 克罗地亚: 'Croatia', slovakia: 'Slovakia', 斯洛伐克: 'Slovakia', slovenia: 'Slovenia', 斯洛文尼亚: 'Slovenia',
  taiwan: 'Taiwan', 中国台湾: 'Taiwan', myanmar: 'Myanmar', 缅甸: 'Myanmar', cambodia: 'Cambodia', 柬埔寨: 'Cambodia',
  'sri lanka': 'Sri Lanka', 斯里兰卡: 'Sri Lanka', nigeria: 'Nigeria', 尼日利亚: 'Nigeria', kenya: 'Kenya', 肯尼亚: 'Kenya',
  ghana: 'Ghana', 加纳: 'Ghana', tanzania: 'Tanzania', 坦桑尼亚: 'Tanzania', algeria: 'Algeria', 阿尔及利亚: 'Algeria',
  tunisia: 'Tunisia', 突尼斯: 'Tunisia', libya: 'Libya', 利比亚: 'Libya', ecuador: 'Ecuador', 厄瓜多尔: 'Ecuador',
  panama: 'Panama', 巴拿马: 'Panama', 'costa rica': 'Costa Rica', 哥斯达黎加: 'Costa Rica', venezuela: 'Venezuela', 委内瑞拉: 'Venezuela',
  'dominican rep.': 'Dominican Rep.', 多米尼加: 'Dominican Rep.', guatemala: 'Guatemala', 危地马拉: 'Guatemala',
  'new zealand': 'New Zealand', 新西兰: 'New Zealand', laos: 'Laos', 老挝: 'Laos',
};

export const displayNames: Record<string, string> = {
  China: '中国', Korea: '韩国', Vietnam: '越南', Japan: '日本', India: '印度', 'United States': '美国',
  'United Kingdom': '英国', Russia: '俄罗斯', Germany: '德国', France: '法国', Italy: '意大利', Spain: '西班牙',
  Portugal: '葡萄牙', Turkey: '土耳其', 'Saudi Arabia': '沙特阿拉伯', Mexico: '墨西哥', Brazil: '巴西', Canada: '加拿大',
  Australia: '澳大利亚', Thailand: '泰国', Indonesia: '印度尼西亚', Malaysia: '马来西亚', Singapore: '新加坡', Philippines: '菲律宾',
  Pakistan: '巴基斯坦', Bangladesh: '孟加拉国', 'United Arab Emirates': '阿联酋', Egypt: '埃及', 'South Africa': '南非',
  Morocco: '摩洛哥', Belgium: '比利时', Netherlands: '荷兰', Poland: '波兰', Greece: '希腊', Switzerland: '瑞士', Austria: '奥地利',
  Sweden: '瑞典', Norway: '挪威', Denmark: '丹麦', Finland: '芬兰', Ireland: '爱尔兰', Ukraine: '乌克兰', Israel: '以色列',
  Iran: '伊朗', Qatar: '卡塔尔', Oman: '阿曼', Colombia: '哥伦比亚', Peru: '秘鲁', Chile: '智利', 'Czech Rep.': '捷克',
  Romania: '罗马尼亚', Hungary: '匈牙利', Bulgaria: '保加利亚', Serbia: '塞尔维亚', Croatia: '克罗地亚', Slovakia: '斯洛伐克',
  Slovenia: '斯洛文尼亚', Taiwan: '中国台湾', Myanmar: '缅甸', Cambodia: '柬埔寨', 'Sri Lanka': '斯里兰卡', Nigeria: '尼日利亚',
  Kenya: '肯尼亚', Ghana: '加纳', Tanzania: '坦桑尼亚', Algeria: '阿尔及利亚', Tunisia: '突尼斯', Libya: '利比亚',
  Ecuador: '厄瓜多尔', Panama: '巴拿马', 'Costa Rica': '哥斯达黎加', Venezuela: '委内瑞拉', 'Dominican Rep.': '多米尼加',
  Guatemala: '危地马拉', 'New Zealand': '新西兰', Laos: '老挝',
};

export const EU_COUNTRIES = new Set(['Germany', 'France', 'Italy', 'Spain', 'Portugal', 'Belgium', 'Netherlands', 'Poland', 'Greece', 'Austria', 'Sweden', 'Denmark', 'Finland', 'Ireland', 'Romania', 'Bulgaria', 'Croatia', 'Slovakia', 'Slovenia', 'Hungary']);

export function clean(value: unknown): string {
  return String(value ?? '').trim().replace(/[（）()]/g, '').replace(/\s+/g, ' ');
}

export function canonical(value: unknown): string {
  const text = clean(value);
  if (!text) return '';
  const normalized = text.toLowerCase().replace(/[.'’\-]/g, '').replace(/\s+/g, ' ');
  return aliases[normalized] || aliases[text.toLowerCase()] || text;
}

function coordinatesFrom(value: unknown): number[][] {
  const points: number[][] = [];
  const collect = (candidate: unknown): void => {
    if (Array.isArray(candidate) && typeof candidate[0] === 'number' && typeof candidate[1] === 'number') points.push(candidate as number[]);
    else if (Array.isArray(candidate)) candidate.forEach(collect);
  };
  collect(value);
  return points;
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function cleanRing(value: unknown): number[][] | null {
  if (!Array.isArray(value)) return null;
  const points = value.filter(isCoordinate).map(([lng, lat]) => [lng, lat]);
  const deduped = points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);
  if (deduped.length < 3) return null;
  if (deduped[0][0] !== deduped[deduped.length - 1][0] || deduped[0][1] !== deduped[deduped.length - 1][1]) deduped.push([...deduped[0]]);
  return deduped.length >= 4 ? deduped : null;
}

/** 只清理非法环，不简化坐标，避免小国和岛屿在 globe.gl 中丢失。 */
export function cleanGeometry(feature: SandboxFeature): SandboxFeature | null {
  if (feature.geometry.type === 'Polygon') {
    const rings = Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates.map(cleanRing).filter((ring): ring is number[][] => Boolean(ring))
      : [];
    return rings.length ? { ...feature, geometry: { ...feature.geometry, coordinates: rings } } : null;
  }
  if (feature.geometry.type === 'MultiPolygon') {
    const polygons = Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates.map((polygon) => Array.isArray(polygon) ? polygon.map(cleanRing).filter((ring): ring is number[][] => Boolean(ring)) : []).filter((polygon): polygon is number[][][] => polygon.length > 0)
      : [];
    return polygons.length ? { ...feature, geometry: { ...feature.geometry, coordinates: polygons } } : null;
  }
  return null;
}

export function centroid(feature: SandboxFeature): Coordinate {
  const points = coordinatesFrom(feature.geometry.coordinates);
  if (!points.length) return { lat: 0, lng: 0 };
  return { lat: points.reduce((sum, point) => sum + point[1], 0) / points.length, lng: points.reduce((sum, point) => sum + point[0], 0) / points.length };
}

function countryNamesFromEvent(value: string): string[] {
  return value.split(/[、,，/&；;]+/).map((item) => canonical(item)).filter(Boolean);
}

function countryMatchesRegion(countryKey: string, region: string): boolean {
  const normalized = clean(region).toLowerCase();
  if (normalized === 'eu' || normalized.includes('欧盟') || normalized.includes('european union')) return EU_COUNTRIES.has(countryKey);
  if (normalized === 'uk' || normalized.includes('英国') || normalized.includes('united kingdom')) return countryKey === 'United Kingdom';
  return countryNamesFromEvent(region).includes(countryKey);
}

function activeRemediesByCountry(remedies: TradeRemedySnapshot | null): Map<string, number> {
  const result = new Map<string, number>();
  (remedies?.cases || []).forEach((item) => {
    if (!['正在调查', '措施实施', '复审中', '调查中'].some((label) => item.case_state.includes(label) || item.latest_stage.includes(label))) return;
    const key = canonical(item.country);
    if (key) result.set(key, (result.get(key) || 0) + 1);
  });
  return result;
}

function policyByCountry(policies: PolicyEvent[]): Map<string, number> {
  const result = new Map<string, number>();
  policies.forEach((item) => {
    const keys = [...new Set([...countryNamesFromEvent(item.country_region), ...Array.from(EU_COUNTRIES).filter((key) => countryMatchesRegion(key, item.country_region))])];
    keys.forEach((key) => result.set(key, (result.get(key) || 0) + 1));
  });
  return result;
}

function customerIndex(customers: InternalBusinessCustomerSnapshot | null): Map<string, number> {
  return new Map(Object.entries(customers?.by_destination || {}).map(([name, item]) => [canonical(name), item.customer_count]));
}

export function buildCountries(features: SandboxFeature[], data: SandboxDataBundle): SandboxCountry[] {
  const internalByCountry = new Map((data.internal?.by_destination || []).map((row) => [canonical(row.label), row]));
  const remedies = activeRemediesByCountry(data.remedies);
  const policies = policyByCountry(data.policies);
  const customers = customerIndex(data.customers);
  const positiveTotal = data.internal?.summary.positive_volume_t || 1;
  return features
    .map((feature) => {
      const rawName = clean(feature.properties?.name);
      const key = canonical(rawName);
      const row = internalByCountry.get(key);
      const quotaRegion = key === 'United Kingdom' ? 'UK' : EU_COUNTRIES.has(key) ? 'EU' : null;
      return {
        key,
        name: displayNames[key] || rawName,
        worldName: rawName,
        center: centroid(feature),
        internalVolumeT: row?.volume_t || 0,
        internalSharePct: row?.share_pct || (row ? row.volume_t / positiveTotal * 100 : 0),
        customerCount: customers.get(key) || 0,
        activeRemedyCount: remedies.get(key) || 0,
        policyCount: policies.get(key) || 0,
        highRiskCount: 0,
        hasQuotaRegion: Boolean(quotaRegion && ((quotaRegion === 'EU' && data.quota?.eu) || (quotaRegion === 'UK' && data.quota?.uk))),
        quotaRegion,
        actualStatus: row && row.volume_t > 0 ? 'business' : 'unmatched',
      } satisfies SandboxCountry;
    })
    .filter((country) => country.key);
}

export function buildMarkers(countries: SandboxCountry[], data: SandboxDataBundle): SandboxMarker[] {
  const byKey = new Map(countries.map((country) => [country.key, country]));
  const markers: SandboxMarker[] = [];
  const remedyGroups = new Map<string, { count: number; top: string; type: string; severity: number }>();
  (data.remedies?.cases || []).filter((item) => ['正在调查', '措施实施', '复审中', '调查中'].some((label) => item.case_state.includes(label) || item.latest_stage.includes(label))).forEach((item) => {
    const key = canonical(item.country);
    if (!byKey.has(key)) return;
    const group = remedyGroups.get(key) || { count: 0, top: item.case_name, type: item.case_type, severity: 0 };
    group.count += 1;
    group.severity = Math.max(group.severity, item.final_rate_pct || 8);
    remedyGroups.set(key, group);
  });
  remedyGroups.forEach((group, key) => {
    const country = byKey.get(key);
    if (!country) return;
    markers.push({ id: `remedy-${key}`, lat: country.center.lat, lng: country.center.lng, countryKey: country.key, title: `${country.name} · ${group.type}`, detail: `${group.count} 项活动案件 · ${group.top}`, kind: 'remedy', severity: group.severity, impactLevel: impactLevelFromSeverity(group.severity), polarity: '-' });
  });
  data.policies.filter((item) => item.severity >= 7).forEach((item) => {
    const keys = countries.filter((country) => countryMatchesRegion(country.key, item.country_region));
      keys.forEach((country) => markers.push({ id: `policy-${item.event_id}-${country.key}`, lat: country.center.lat, lng: country.center.lng, countryKey: country.key, title: `${country.name} · 政策事件`, detail: item.title, kind: 'policy', severity: item.severity, impactLevel: impactLevelFromSeverity(item.severity), polarity: item.event_type === 'subsidy' ? '+' : '-' }));
  });
  countries.filter((country) => country.hasQuotaRegion).forEach((country) => markers.push({ id: `quota-${country.key}`, lat: country.center.lat, lng: country.center.lng, countryKey: country.key, title: `${country.name} · ${country.quotaRegion}配额区域`, detail: '来自配额快照的区域关联，仅作风险事件展示，不计入数值推演', kind: 'quota', severity: 6, impactLevel: 4, polarity: '-' }));
  return markers;
}

export function impactLevelFromSeverity(value: number): SandboxImpactLevel {
  if (value >= 8) return 5;
  if (value >= 6) return 4;
  if (value >= 4) return 3;
  if (value >= 2) return 2;
  return 1;
}

export function impactLevelFromDelta(delta: number): SandboxImpactLevel {
  const magnitude = Math.abs(delta);
  if (magnitude >= .35) return 5;
  if (magnitude >= .2) return 4;
  if (magnitude >= .1) return 3;
  if (magnitude >= .03) return 2;
  return 1;
}

export function impactLabel(level: SandboxImpactLevel): string {
  return ['几乎无影响', '轻微影响', '中度影响', '显著影响', '剧烈影响'][level - 1];
}

const variableLabels: Record<SandboxVariable, [string, string]> = {
  remedy: ['贸易救济措施缓解', '贸易救济措施收紧'],
  quota: ['配额放宽', '配额收紧'],
  policy: ['区域政策放宽', '区域政策收紧'],
  fed: ['美联储降息', '美联储加息'],
  chokepoint: ['航运要道风险缓解', '航运要道管控升级'],
  freight: ['国际航运价格下降', '国际航运价格上升'],
};

export function variableLabel(variable: SandboxVariable, direction: SandboxDirection): string {
  return variableLabels[variable][direction === 'up' ? 0 : 1];
}

function regionalFactor(country: SandboxCountry, variable: SandboxVariable, direction: SandboxDirection): number {
  const down = direction === 'down';
  if (variable === 'remedy') return country.activeRemedyCount ? (down ? 0.18 : 1.14) : 1;
  if (variable === 'quota') return country.hasQuotaRegion ? (down ? 0.36 : 1.1) : 1;
  if (variable === 'policy') return country.policyCount ? (down ? 0.52 : 1.08) : 1;
  if (variable === 'fed') return down ? 0.93 : 1.06;
  if (variable === 'chokepoint') return down ? 0.72 : 1.04;
  return down ? 0.82 : 1.08;
}

function strategyFactor(strategy: SandboxConfig['strategy'], country: SandboxCountry): number {
  if (strategy === 'core-first') return country.internalSharePct >= 3 ? 1.08 : .92;
  if (strategy === 'risk-hedge') return country.activeRemedyCount || country.hasQuotaRegion ? .62 : 1.05;
  return 1;
}

function productMixFactor(config: SandboxConfig): number {
  const weights = config.productWeights;
  const weighted = weights.hotRolled * 1 + weights.mediumPlate * .98 + weights.coldCoated * 1.02 + weights.tinplate * .96 + weights.siliconSteel * 1.03 + weights.automotive * 1.01;
  const baseline = 30 * 1 + 15 * .98 + 25 * 1.02 + 10 * .96 + 10 * 1.03 + 10 * 1.01;
  return weighted / Math.max(baseline, 1);
}

export function simulateFlows(countries: SandboxCountry[], baselineTotal: number, config: SandboxConfig, variable?: SandboxVariable, direction?: SandboxDirection): SandboxFlow[] {
  const orderScale = config.orderVolumeT / Math.max(baselineTotal, 1);
  const mixFactor = productMixFactor(config);
  return countries.filter((country) => country.internalVolumeT > 0).map((country) => {
    const isTarget = config.targetKeys.length === 0 || config.targetKeys.includes(country.key);
    const factor = (isTarget ? 1 : .14) * strategyFactor(config.strategy, country) * mixFactor * (variable && direction ? regionalFactor(country, variable, direction) : 1);
    const simulatedVolumeT = country.internalVolumeT * orderScale * factor;
    const isResidual = Boolean((country.activeRemedyCount || country.hasQuotaRegion || country.policyCount) && factor < .7);
    const delta = factor - 1;
    return { ...country, simulatedVolumeT, flowFactor: factor, isTarget, isResidual, isImproved: factor > 1.04, impactLevel: impactLevelFromDelta(delta), polarity: delta >= .03 ? '+' : delta <= -.03 ? '-' : '0' };
  });
}

export function evaluateScenario(flows: SandboxFlow[], variable: SandboxVariable, direction: SandboxDirection, baselineTotal: number): SandboxScenarioResult {
  const impacted = flows.filter((flow) => Math.abs(flow.flowFactor - 1) > .03);
  return {
    variable,
    direction,
    label: variableLabel(variable, direction),
    impactedCountryKeys: impacted.map((flow) => flow.key),
    residualCountryKeys: flows.filter((flow) => flow.isResidual).map((flow) => flow.key),
    totalVolumeT: flows.reduce((sum, flow) => sum + flow.simulatedVolumeT, 0),
    deltaVolumeT: flows.reduce((sum, flow) => sum + flow.simulatedVolumeT, 0) - baselineTotal,
    affectedFlowCount: impacted.length,
    highestImpactLevel: flows.reduce<SandboxImpactLevel>((max, flow) => Math.max(max, flow.impactLevel) as SandboxImpactLevel, 1),
    positiveImpactCount: flows.filter((flow) => flow.polarity === '+').length,
    negativeImpactCount: flows.filter((flow) => flow.polarity === '-').length,
  };
}

export function formatTons(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)} 万吨`;
  return `${Math.round(value).toLocaleString('zh-CN')} 吨`;
}

export function formatPct(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
}

export const defaultConfig: SandboxConfig = {
  orderVolumeT: 1925245.602,
  targetKeys: [],
  productWeights: { hotRolled: 30, mediumPlate: 15, coldCoated: 25, tinplate: 10, siliconSteel: 10, automotive: 10 },
  strategy: 'balanced',
};

export const DEFAULT_COMMAND_ADAPTER = {
  applyCommand: (command: string, config: SandboxConfig): SandboxConfig => {
    const text = command.toLowerCase();
    if (text.includes('加大订单') || text.includes('increase')) return { ...config, orderVolumeT: Math.round(config.orderVolumeT * 1.1) };
    if (text.includes('降低订单') || text.includes('decrease')) return { ...config, orderVolumeT: Math.round(config.orderVolumeT * .9) };
    return config;
  },
};
