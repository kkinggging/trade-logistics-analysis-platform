import { useEffect, useMemo, useState } from 'react';
import { dataProvider } from '@/core/data/provider';
import { DataSyncSourceStatus, DataSyncStatus } from '@/core/store/types';
import { DataStatus } from '@/shared/components/data/DataStatus';
import './DataHealth.css';

type SourceDefinition = {
  id: string;
  label: string;
  kind: 'external' | 'internal';
  dependencies: string[];
  note: string;
};

const sourceDefinitions: SourceDefinition[] = [
  { id: 'steel-dashboard-public', label: '钢材市场数据看板', kind: 'external', dependencies: ['综合分析 · 外部行情走势', '晨报 · 钢材价格', '销售方案 · 行情与定价'], note: '库存、开工率、产能利用率、普氏铁矿石指数' },
  { id: 'steel-export-dashboard-public', label: '海关钢材出口看板', kind: 'external', dependencies: ['综合分析 · 贸易伙伴地图', '综合分析 · 出口趋势与伙伴排名', '晨报 · 出口伙伴摘要'], note: '中国海关钢材出口明细、伙伴、区域与品类聚合' },
  { id: 'forex-dashboard-public', label: '外汇汇率历史看板', kind: 'external', dependencies: ['综合分析 · 汇率进阶图表', '销售方案 · 签约币种建议', '晨报 · 汇率结论'], note: 'DXY、EURUSD、USDCNY 及历史收益风险计算' },
  { id: 'taric-quota-dashboard-public', label: 'EU / UK 关税配额看板', kind: 'external', dependencies: ['综合分析 · 配额图表', '销售方案 · 配额核验闸门', '晨报 · 配额摘要'], note: 'EU / UK 配额余额、Code、国家组与历史快照' },
  { id: 'shipping-index-dashboard-public', label: '航运指数数据看板', kind: 'external', dependencies: ['综合分析 · 航运指数图表', '运输方案 · 物流环境参考', '销售方案 · 运费建议'], note: 'CCFI、SCFI、BSI、BDI、Brent、NYMEX' },
  { id: 'trade-remedy-dashboard-public', label: '出口贸易救济案件看板', kind: 'external', dependencies: ['综合分析 · 贸易救济地图', '综合分析 · 出口条件评估', '销售方案 · 合规风险闸门'], note: '反倾销、反补贴、保障措施、HS 税号与案件阶段' },
  { id: 'mysteel-fast-news', label: '我的钢铁网行业快讯', kind: 'external', dependencies: ['晨报 · 行业快讯'], note: '快讯正文、发布时间、产品归类与原文链接' },
  { id: 'internal-business-snapshot', label: '公司内部业务数据', kind: 'internal', dependencies: ['综合分析 · 经营与成本', '成本计算器 · 成本测算', '运输方案 · 路线样本', '销售方案 · 经营约束'], note: '经营聚合、产品成本、政策事件、风险信号与运输样本' },
];

function formatTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').replace('Z', '').slice(0, 19);
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatCoverage(value?: string | null) {
  return value ? `覆盖至 ${value}` : '未提供覆盖日期';
}

function nextScheduledRun(schedule?: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
  const value = (name: string) => Number(parts.find((part) => part.type === name)?.value || 0);
  const todayRun = new Date(Date.UTC(value('year'), value('month') - 1, value('day'), 10, 0));
  const nextRun = now < todayRun ? todayRun : new Date(todayRun.getTime() + 24 * 60 * 60 * 1000);
  return schedule?.includes('每天') ? formatTime(nextRun.toISOString()) : '按部署环境调度';
}

function stateLabel(source: DataSyncSourceStatus | undefined, kind: SourceDefinition['kind']) {
  if (kind === 'internal') return '已接入';
  if (source?.state === 'fresh') return '最新快照';
  if (source?.state === 'fallback') return '沿用上次快照';
  if (source?.state === 'unavailable') return '暂无可用快照';
  return '待确认';
}

function stateClass(source: DataSyncSourceStatus | undefined, kind: SourceDefinition['kind']) {
  if (kind === 'internal') return 'is-internal';
  return source?.state ? `is-${source.state}` : 'is-unknown';
}

export function DataHealth() {
  const [status, setStatus] = useState<DataSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus(await dataProvider.getDataSyncStatus());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '同步状态加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadStatus(); }, []);

  const externalSources = Object.values(status?.sources || {});
  const freshCount = externalSources.filter((source) => source.state === 'fresh').length;
  const fallbackCount = externalSources.filter((source) => source.state === 'fallback').length;
  const unavailableCount = externalSources.filter((source) => source.state === 'unavailable').length;
  const nextRun = useMemo(() => nextScheduledRun(status?.schedule), [status?.schedule, status?.generated_at]);

  return (
    <div className="data-health">
      <header className="data-health-header">
        <div>
          <span className="data-health-eyebrow">DATA OPERATIONS / 数据运行状态</span>
          <h1>数据健康中心</h1>
          <p>集中查看数据源的新鲜度、覆盖范围、失败兜底和图表依赖，避免把历史快照误认为实时数据。</p>
        </div>
        <div className="data-health-actions">
          {status && <DataStatus status={status} />}
          <button type="button" className="health-refresh" onClick={() => void loadStatus()} disabled={loading}>{loading ? '读取中…' : '刷新状态'}</button>
        </div>
      </header>

      <section className="health-summary" aria-label="数据健康概览">
        <div className="health-summary-main"><span>当前同步结论</span><strong>{status ? (fallbackCount || unavailableCount ? '部分数据沿用历史快照' : '外部数据状态正常') : '同步状态待确认'}</strong><small>快照状态只反映数据文件，不代表源站一定实时可访问。</small></div>
        <div className="health-summary-item"><span>最新快照</span><strong>{freshCount}</strong><small>个数据源</small></div>
        <div className="health-summary-item is-warning"><span>沿用上次</span><strong>{fallbackCount}</strong><small>个数据源</small></div>
        <div className="health-summary-item is-danger"><span>不可用</span><strong>{unavailableCount}</strong><small>个数据源</small></div>
        <div className="health-summary-item"><span>下次计划</span><strong>{nextRun}</strong><small>Asia/Shanghai</small></div>
      </section>

      {error && <div className="health-error" role="alert">{error} <button type="button" onClick={() => void loadStatus()}>重试</button></div>}

      <section className="health-source-section">
        <div className="health-section-heading"><div><span className="data-health-eyebrow">SOURCE REGISTER / 数据源登记</span><h2>数据源与依赖关系</h2></div><span>{sourceDefinitions.length} 个数据域</span></div>
        <div className="health-source-list">
          {sourceDefinitions.map((definition) => {
            const source = status?.sources[definition.id];
            return (
              <article className={`health-source-card ${stateClass(source, definition.kind)}`} key={definition.id}>
                <div className="health-source-top"><div><span className="health-source-kind">{definition.kind === 'internal' ? '内部数据' : '外部数据'}</span><h3>{definition.label}</h3></div><span className="health-state"><i aria-hidden="true" />{stateLabel(source, definition.kind)}</span></div>
                <p className="health-source-note">{definition.note}</p>
                <div className="health-source-facts">
                  <div><span>最后成功</span><strong>{definition.kind === 'internal' ? '已接入' : formatTime(source?.success_at)}</strong></div>
                  <div><span>覆盖范围</span><strong>{definition.kind === 'internal' ? '项目结构化快照' : formatCoverage(source?.coverage_end)}</strong></div>
                  <div><span>下次计划</span><strong>{definition.kind === 'internal' ? '随内部数据同步' : nextRun}</strong></div>
                </div>
                {source?.error && <div className="health-source-error"><span>最近异常</span>{source.error}</div>}
                <div className="health-dependencies"><span>影响模块</span><div>{definition.dependencies.map((dependency) => <span key={dependency}>{dependency}</span>)}</div></div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="health-guidance">
        <div><span className="data-health-eyebrow">READING GUIDE / 判读口径</span><h2>如何理解这里的状态</h2></div>
        <div className="health-guide-grid"><p><b>最新快照</b>表示本次同步成功生成了新的结构化数据，页面图表会在下一次发布后使用它。</p><p><b>沿用上次快照</b>表示本次抓取失败，但系统没有用半成品覆盖旧数据；相关建议应结合异常说明人工复核。</p><p><b>公司内部数据</b>按当前项目口径视为已完成接入，现以脱敏后的结构化业务快照供成本、经营、风险和运输模块使用。</p></div>
      </section>
    </div>
  );
}
