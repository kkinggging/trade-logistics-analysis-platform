import { InternalBusinessCustomerSnapshot, InternalBusinessSnapshot, SteelExportSnapshot, TradeRemedySnapshot, TaricQuotaSnapshot } from '@/core/store/types';

export type CustomerTier = 'S' | 'A' | 'B' | 'C' | '待补证据';
export type MarketTag = '成熟核心市场' | '潜力拓展市场' | '战略客户市场' | '风险监控市场';

export interface CustomerDecision {
  country: string; customerCount: number; volumeT: number; score: number; tier: CustomerTier;
  continuity: number | null; scale: number; typeValue: number | null; influence: number | null;
  typeLabel: string; evidence: string[]; dataGaps: string[];
}
export interface MarketDecision {
  country: string; marketVolumeT: number; internalVolumeT: number; internalSharePct: number;
  tag: MarketTag; rationale: string; policyFlags: string[]; customerCount: number;
}

const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const normalize = (value: string) => value.replace(/\s/g, '').toLowerCase();
const countryMatch = (a: string, b: string) => normalize(a) === normalize(b) || normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a));

export function buildCustomerDecisions(customers: InternalBusinessCustomerSnapshot | null, business: InternalBusinessSnapshot | null): CustomerDecision[] {
  if (!customers) return [];
  const entries = Object.entries(customers.by_destination);
  const volumes = entries.map(([, item]) => num(item.total_volume_t)).sort((a, b) => a - b);
  const percentile = (value: number) => volumes.length ? volumes.filter((item) => item <= value).length / volumes.length : 0;
  return entries.map(([country, item]) => {
    const volumeT = num(item.total_volume_t); const scale = Math.round(30 * percentile(volumeT));
    // 数据库仅保留目的国/Top5汇总，客户类型、合作年限、订单连续性没有事实字段。
    const inferredType = '客户类型待确认';
    const typeValue = null; const continuity = null; const influence = null;
    const score = scale; // 仅计入可观测的交易规模项，不把缺失字段当成零分或推测分。
    const tier: CustomerTier = '待补证据';
    const businessRow = business?.by_destination.find((row) => countryMatch(row.label, country));
    return { country, customerCount: num(item.customer_count), volumeT, score, tier, continuity, scale, typeValue, influence,
      typeLabel: inferredType,
      evidence: [`近一年汇总 ${Math.round(volumeT).toLocaleString('zh-CN')} 吨`, `${item.customer_count} 个脱敏客户`, businessRow ? `内部目的国汇总 ${Math.round(businessRow.volume_t).toLocaleString('zh-CN')} 吨` : '内部业务目的国未找到匹配行'],
      dataGaps: ['合作连续时长', '订单连续性', '客户类型', '行业标杆标识'] };
  }).sort((a, b) => b.score - a.score || b.volumeT - a.volumeT);
}

export function buildMarketDecisions(business: InternalBusinessSnapshot | null, customs: SteelExportSnapshot | null, customers: InternalBusinessCustomerSnapshot | null, remedies: TradeRemedySnapshot | null, quota: TaricQuotaSnapshot | null): MarketDecision[] {
  const internal = business?.by_destination || [];
  const external = customs?.default_view.partner || customs?.partner || [];
  const countries = Array.from(new Set([...internal.map((row) => row.label), ...external.map((row) => row.label)]));
  const marketValues = external.map((row) => num(row.qty_t)).filter(Boolean).sort((a, b) => a - b);
  const internalValues = internal.map((row) => num(row.volume_t)).filter(Boolean).sort((a, b) => a - b);
  const high = (value: number, values: number[]) => values.length > 0 && value >= (values[Math.floor(values.length * .6)] || Infinity);
  return countries.map((country) => {
    const ext = external.find((row) => countryMatch(row.label, country)); const own = internal.find((row) => countryMatch(row.label, country));
    const marketVolumeT = num(ext?.qty_t); const internalVolumeT = num(own?.volume_t); const customerCount = customers?.by_destination[country]?.customer_count || 0;
    const policyFlags = (remedies?.cases || []).filter((item) => countryMatch(item.country, country) && !/终止|撤销/.test(String(item.case_state))).slice(0, 2).map((item) => item.case_type);
    if (quota && /欧盟|英国|德国|西班牙/.test(country)) policyFlags.push('配额/区域政策核验');
    const strategic = customerCount >= 150;
    const tag: MarketTag = policyFlags.length ? '风险监控市场' : strategic ? '战略客户市场' : high(marketVolumeT, marketValues) && high(internalVolumeT, internalValues) ? '成熟核心市场' : high(marketVolumeT, marketValues) ? '潜力拓展市场' : '潜力拓展市场';
    return { country, marketVolumeT, internalVolumeT, internalSharePct: business?.summary.total_volume_t ? internalVolumeT / business.summary.total_volume_t * 100 : 0, tag, customerCount, policyFlags: Array.from(new Set(policyFlags)), rationale: policyFlags.length ? '存在贸易政策扰动，报价与客户开发需先完成合规核验' : strategic ? '客户数量处于内部目的国高位，先做重点客户经营' : high(marketVolumeT, marketValues) && high(internalVolumeT, internalValues) ? '全国市场大盘与我方出货均处于高位' : high(marketVolumeT, marketValues) ? '全国大盘较大，但我方出货仍有拓展空间' : '当前可观测规模有限，先验证客户与订单连续性' };
  }).sort((a, b) => b.internalVolumeT - a.internalVolumeT);
}
