import {
  MarketQuote,
  InternalAggregate,
  ProductCost,
  FxScenario,
  PolicyEvent,
  RiskSignal,
  ShippingOption,
  QueryParams,
  SteelExportSnapshot,
  ForexSnapshot,
  TaricQuotaSnapshot,
  DataSyncStatus,
  ShippingIndexSnapshot,
  TradeRemedySnapshot,
  FastNewsSnapshot,
} from '@/core/store/types';

export interface DataProvider {
  getMarketQuotes(params?: QueryParams): Promise<MarketQuote[]>;
  getInternalAggregates(params?: QueryParams): Promise<InternalAggregate[]>;
  getProductCosts(params?: QueryParams): Promise<ProductCost[]>;
  getFxScenarios(): Promise<FxScenario[]>;
  getPolicyEvents(params?: QueryParams): Promise<PolicyEvent[]>;
  getRiskSignals(params?: QueryParams): Promise<RiskSignal[]>;
  getShippingOptions(params?: QueryParams): Promise<ShippingOption[]>;
  getSteelExportSnapshot(): Promise<SteelExportSnapshot | null>;
  getForexSnapshot(): Promise<ForexSnapshot | null>;
  getTaricQuotaSnapshot(): Promise<TaricQuotaSnapshot | null>;
  getDataSyncStatus(): Promise<DataSyncStatus | null>;
  getShippingIndexSnapshot(): Promise<ShippingIndexSnapshot | null>;
  getTradeRemedySnapshot(): Promise<TradeRemedySnapshot | null>;
  getFastNewsSnapshot(): Promise<FastNewsSnapshot | null>;
}

export class StaticDataProvider implements DataProvider {
  private baseUrl = `${import.meta.env.BASE_URL}data`;

  /**
   * 外部抓取快照是可选数据源：它不存在、暂时不可读或结构不合格时，
   * 平台继续使用本地演示数据，避免单个外部来源影响现有功能。
   */
  private async fetchOptionalJson<T>(path: string): Promise<T | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${path}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  private async fetchJson<T>(path: string): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}/${path}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${path}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${path}:`, error);
      throw error;
    }
  }

  private filterByParams<T extends Record<string, any>>(
    data: T[],
    params?: QueryParams
  ): T[] {
    let filtered = [...data];

    if (params?.productLine) {
      filtered = filtered.filter(
        (item) =>
          !item.product_line || item.product_line === params.productLine
      );
    }

    if (params?.region && params.region !== 'global') {
      filtered = filtered.filter(
        (item) => !item.region || item.region === params.region
      );
    }

    if (params?.dateRange) {
      const [start, end] = params.dateRange;
      filtered = filtered.filter((item) => {
        const date =
          item.date ||
          item.effective_date ||
          item.start_date ||
          item.end_date ||
          item.as_of ||
          item.publish_date;
        return date >= start && date <= end;
      });
    }

    if (params?.offset !== undefined) {
      filtered = filtered.slice(params.offset);
    }

    if (params?.limit !== undefined) {
      filtered = filtered.slice(0, params.limit);
    }

    return filtered;
  }

  async getMarketQuotes(params?: QueryParams): Promise<MarketQuote[]> {
    const [data, externalSnapshot] = await Promise.all([
      this.fetchJson<MarketQuote[]>('market_quotes.json'),
      this.fetchOptionalJson<{
        schema_version?: string;
        market_quotes?: MarketQuote[];
      }>('external_steel_dashboard.json'),
    ]);

    // 只接受带有关键字段的外部行情，避免损坏快照污染图表和筛选逻辑。
    const externalQuotes = (externalSnapshot?.market_quotes || []).filter(
      (quote): quote is MarketQuote =>
        Boolean(quote) &&
        typeof quote.quote_id === 'string' &&
        typeof quote.date === 'string' &&
        typeof quote.source === 'string' &&
        typeof quote.indicator_code === 'string' &&
        typeof quote.indicator_name === 'string' &&
        Number.isFinite(quote.value) &&
        typeof quote.unit === 'string' &&
        ['daily', 'weekly', 'monthly', 'dekadal'].includes(quote.frequency) &&
        typeof quote.publish_time === 'string' &&
        quote.fetch_mode === 'scrape'
    );

    // 以来源 + 指标 + 日期去重，避免同一来源的不同 quote_id 造成重复点；
    // 不同来源仍然保留，保证市场对比功能的数据关系不变。
    const merged = new Map<string, MarketQuote>();
    [...data, ...externalQuotes].forEach((quote) => {
      const key = `${quote.source}:${quote.indicator_code}:${quote.date}`;
      merged.set(key, quote);
    });

    return this.filterByParams(Array.from(merged.values()), params);
  }

  async getInternalAggregates(
    params?: QueryParams
  ): Promise<InternalAggregate[]> {
    const data = await this.fetchJson<InternalAggregate[]>(
      'internal_aggregates.json'
    );
    return this.filterByParams(data, params);
  }

  async getProductCosts(params?: QueryParams): Promise<ProductCost[]> {
    const data = await this.fetchJson<ProductCost[]>('product_costs.json');
    return this.filterByParams(data, params);
  }

  async getFxScenarios(): Promise<FxScenario[]> {
    return this.fetchJson<FxScenario[]>('fx_scenarios.json');
  }

  async getPolicyEvents(params?: QueryParams): Promise<PolicyEvent[]> {
    const data = await this.fetchJson<PolicyEvent[]>('policy_events.json');
    return this.filterByParams(data, params);
  }

  async getRiskSignals(params?: QueryParams): Promise<RiskSignal[]> {
    const data = await this.fetchJson<RiskSignal[]>('risk_signals.json');
    return this.filterByParams(data, params);
  }

  async getShippingOptions(params?: QueryParams): Promise<ShippingOption[]> {
    const data = await this.fetchJson<ShippingOption[]>(
      'shipping_options.json'
    );
    return this.filterByParams(data, params);
  }

  async getSteelExportSnapshot(): Promise<SteelExportSnapshot | null> {
    return this.fetchOptionalJson<SteelExportSnapshot>('external_steel_export.json');
  }

  async getForexSnapshot(): Promise<ForexSnapshot | null> {
    return this.fetchOptionalJson<ForexSnapshot>('external_forex.json');
  }

  async getTaricQuotaSnapshot(): Promise<TaricQuotaSnapshot | null> {
    return this.fetchOptionalJson<TaricQuotaSnapshot>('external_taric_quota.json');
  }

  async getDataSyncStatus(): Promise<DataSyncStatus | null> {
    return this.fetchOptionalJson<DataSyncStatus>('data_sync_status.json');
  }

  async getShippingIndexSnapshot(): Promise<ShippingIndexSnapshot | null> {
    return this.fetchOptionalJson<ShippingIndexSnapshot>('external_shipping_indices.json');
  }

  async getTradeRemedySnapshot(): Promise<TradeRemedySnapshot | null> {
    return this.fetchOptionalJson<TradeRemedySnapshot>('external_trade_remedy.json');
  }

  async getFastNewsSnapshot(): Promise<FastNewsSnapshot | null> {
    return this.fetchOptionalJson<FastNewsSnapshot>('external_fast_news.json');
  }
}

export const dataProvider = new StaticDataProvider();
