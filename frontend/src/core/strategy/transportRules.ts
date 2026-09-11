import { ProductLine, ShippingIndexSnapshot, ShippingOption } from '@/core/store/types';

export type VesselType = '集装箱' | '散货船';
export interface TransportDecision { vessel: VesselType; risk: '高' | '中' | '低' | '暂不可评估'; freightMin: number | null; freightMax: number | null; protection: string[]; seasonal: string; timing: string; macro: string; reasons: string[]; gaps: string[]; indexLabel: string; }
const sensitive = (product: ProductLine | '') => product === 'cold-rolled' || product === 'silicon-steel';
const regionOf = (port: string) => /Shanghai|Ningbo|Qingdao/.test(port) ? '华东' : /Tianjin/.test(port) ? '华北' : '其他';
export function buildTransportDecision(input: { product: ProductLine | ''; quantity: number | null; origin: string; deadline: string; route: ShippingOption; indices: ShippingIndexSnapshot | null; month: number }): TransportDecision {
  const flags = input.route.constraint_flags || []; const quantity = input.quantity ?? 0; const strict = Boolean(input.deadline);
  const bulk = quantity >= 5000 || (quantity >= 3000 && flags.includes('large_volume')); const vessel: VesselType = bulk && !(strict && flags.includes('long_transit')) ? '散货船' : '集装箱';
  const index = vessel === '集装箱' ? input.indices?.series?.SCFI || input.indices?.series?.CCFI : input.indices?.series?.BDI || input.indices?.series?.BSI;
  const base = Number(input.route.freight_per_ton); const freightMin = Number.isFinite(base) ? Math.round(base * .9 * 10) / 10 : null; const freightMax = Number.isFinite(base) ? Math.round(base * 1.15 * 10) / 10 : null;
  const humid = (regionOf(input.origin) === '华东' && input.month >= 4 && input.month <= 9) || (regionOf(input.origin) === '华北' && input.month >= 6 && input.month <= 8);
  const protection = sensitive(input.product) ? ['S/A级防护：加强防潮、防锈、防磕碰', '垫木隔离、绑扎防滚动，包装破损不得装船', '装船前完成表面与冷凝水检查'] : ['基础防护：防潮、垫木隔离、绑扎防滚动', '吊装和装舱避免边部磕碰，装船前拍照留痕'];
  const margin = input.deadline ? Math.floor((new Date(input.deadline).getTime() - new Date(input.route.eta).getTime()) / 86400000) : null;
  const highRisk = input.route.status === 'full' || (strict && margin !== null && margin <= 0) || (flags.includes('limited_capacity') && flags.includes('high_demand'));
  const mediumRisk = input.route.status === 'limited' || (margin !== null && margin < 14) || flags.includes('premium_rate') || !index;
  return { vessel, risk: highRisk ? '高' : mediumRisk ? '中' : input.route.status === 'available' && margin !== null && margin >= 14 && !flags.length ? '低' : '暂不可评估', freightMin, freightMax, protection, seasonal: humid ? '湿热季：加强防潮、冷凝水隔离；雨天暂停裸露装卸。' : '常规季：执行基础防潮和防磕碰要求，无额外季节规则触发。', timing: margin === null ? '未设置最晚到港日期，时效风险未完整评估。' : margin <= 0 ? '路线 ETA 不满足最晚到港要求，不应作为承诺方案。' : `${vessel}路线样本交期余量 ${margin} 天；实际船期、待泊和承运人承诺需人工确认。`, macro: index ? `${index.label} 最新值 ${index.latest.value} ${index.unit}，仅作航运市场环境参考。` : '航运指数不可用，当前仅使用路线快照，风险判断降级。', reasons: [bulk ? '货量较大，散货船进入优先候选' : '货量处于中小批量，集装箱时间确定性相对更高', sensitive(input.product) ? '产品防护要求较高' : '产品执行基础钢卷防护', flags.length ? `路线约束：${flags.join('、')}` : '当前路线未标记额外约束'], gaps: ['无真实历史运费分布，区间由路线样本推演', '无航线历史延误和港口待泊数据', '实际舱位、箱源、船期与合同条款需人工确认'], indexLabel: index?.label || '不可用' };
}
