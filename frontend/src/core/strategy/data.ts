import { dataProvider } from '@/core/data/provider';
import {
  DataSyncStatus,
  QueryParams,
} from '@/core/store/types';
import { StrategyDataInputs } from './engine';
import { FastNewsSnapshot } from '@/core/store/types';

export type StrategyDataBundle = StrategyDataInputs & {
  syncStatus: DataSyncStatus | null;
  fastNews: FastNewsSnapshot | null;
};

/**
 * 所有“建议、销售方案、晨报”共用这一条数据加载路径。
 * 这里不设置 limit，避免外部行情在生成方案时被截断。
 */
export async function loadStrategyData(params?: QueryParams): Promise<StrategyDataBundle> {
  const [quotes, risks, policies, aggregates, costs, fxScenarios, shippingOptions, steelExport, forex, taricQuota, shippingIndices, fastNews, syncStatus] = await Promise.all([
    dataProvider.getMarketQuotes(params),
    dataProvider.getRiskSignals(params),
    dataProvider.getPolicyEvents(params),
    dataProvider.getInternalAggregates(params),
    dataProvider.getProductCosts(params),
    dataProvider.getFxScenarios(),
    dataProvider.getShippingOptions(params),
    dataProvider.getSteelExportSnapshot(),
    dataProvider.getForexSnapshot(),
    dataProvider.getTaricQuotaSnapshot(),
    dataProvider.getShippingIndexSnapshot(),
    dataProvider.getFastNewsSnapshot(),
    dataProvider.getDataSyncStatus(),
  ]);

  return {
    quotes,
    risks,
    policies,
    aggregates,
    costs,
    fxScenarios,
    shippingOptions,
    steelExport,
    forex,
    taricQuota,
    shippingIndices,
    fastNews,
    syncStatus,
  };
}

export function dataStateLabel(state: StrategyDataBundle['syncStatus']) {
  const sourceStates = Object.values(state?.sources || {}).map((item) => item.state);
  if (sourceStates.includes('fallback')) return '部分沿用上次成功快照';
  if (sourceStates.includes('unavailable')) return '部分数据源不可用';
  if (sourceStates.length && sourceStates.every((item) => item === 'fresh')) return '外部数据已更新';
  return '同步状态待确认';
}
