# 数据源、抓取与快照契约

## 统一链路

所有外部数据按以下链路运行：

```text
公开页面 / JSON / CSV / 内嵌数据
        ↓
data-ingestion 适配器（超时、有限重试、解析）
        ↓
字段与业务质量校验
        ↓
frontend/public/data/external_*.json
        ↓
StaticDataProvider
        ↓
图表、晨报、建议、数据健康中心
```

快照使用临时文件加原子替换。失败、超时、校验失败或进程中断时不得触碰旧快照；`data_sync_status.json` 记录 `fresh`、`fallback` 或 `unavailable`。快照应尽量包含 `captured_at`、源站生成时间、覆盖区间、原始响应哈希、抓取模式、质量警告和统计数量。

## 来源登记与当前角色

| 数据域 | 适配器/快照 | 主要内容 | 默认调度 |
| --- | --- | --- | --- |
| 钢材市场行情 | `fetch-steel-dashboard.mjs` / `external_steel_dashboard.json` | 库存、开工率、铁矿等行情指标 | 每日 18:00 |
| 海关钢材出口 | `fetch-steel-export-dashboard.mjs` / `external_steel_export.json` | 月度出口量、均价、伙伴、区域、集中度 | 每日 18:00 |
| 外汇 | `fetch-forex-dashboard.mjs` / `external_forex.json` | DXY、USDCNY、EURUSD 历史统计 | 每日 18:00 |
| EU/UK 配额 | `fetch-taric-quota.mjs` / `external_taric_quota.json` | CSV 原文、原始行、标准化行、最新期、EU/UK 组 | 每日 18:00 |
| 航运指数 | `fetch-shipping-index-dashboard.mjs` / `external_shipping_indices.json` | CCFI、SCFI、BSI、BDI、Brent、NYMEX | 每日 18:00 |
| 贸易救济 | `fetch-trade-remedy-dashboard.mjs` / `external_trade_remedy.json` | 反倾销、反补贴、保障措施、阶段、HS 和来源 | 每日 18:00 |
| 我的钢铁网快讯 | `fetch-mysteel-fast-news.mjs` / `external_fast_news.json` | 快讯正文、时间、分类和链接 | 每日 08:10、09:00 |
| Kagi 潮汐早报 | `fetch-tide-news.mjs` / `external_tide_news.json` | 世界、商业、科学、运动、历史上的今天 | 每日 09:00 |
| 霍尔木兹专题 | `fetch-hormuz-special.mjs` / `external_hormuz.json` | 独立专题快照，失败不应破坏晨报其他内容 | 全量同步/按工作流 |
| 内部业务 | `internal_business_2025.json`、客户快照 | 已完成的 2025 月度业务、目的地、品类、客户数量 | 内部数据；非外部抓取 |
| CBAM 参数 | `cbam_parameters.json` | EU/UK FAA、排放因子和碳参数 | 内部参数快照 |

真实字段与来源 URL 以各适配器的 `*-source.json`、`README.md` 和输出快照为准；不要把浏览器中的 Excel 导出按钮默认当成稳定 API。能直接读到的公开 JSON/CSV 才能作为自动化入口，页面截图或一次性人工下载只能做抽样核验。

## 关键数据质量规则

- `HTTP 200` 只证明传输成功，不证明结构、日期、记录数、图片或详情正文成功。
- 普通 Kagi 新闻和“历史上的今天”必须分别统计；历史页若为 0 条，要明确报告解析失败或源站结构变化，不能用普通新闻冒充历史事件。
- 新闻图片只展示已验证、可访问且与该条记录关联的资源；缺失时显示缺失状态，不用通用图片占位为真实来源。
- 配额保留 `raw`、`accepted_rows`、`normalized_rows`、`latest.rows` 和质量计数；共享池不能按成员国重复累加。印度、土耳其等国家是否存在，必须从原始行和索引验证，不能按页面默认筛选推断。
- 航运六组序列要分别验证单位、频率、日期和末点；没有 `change_rate` 但有 `prev_value` 时才允许按契约补算。
- 抓取器需要有限重试、超时和日志；不要无限重试、把空结果写入生产快照或在前端静默回退成新数据。

## 调度事实

统一入口是 `node data-ingestion/sync-all.mjs`；需要构建离线成品时使用 `--build`。GitHub Pages 只托管构建产物，定时任务必须在 GitHub Actions、服务器或 Mac 调度器中运行。当前 Actions 约定：全量北京时间 18:00；MySteel 08:10 和 09:00；潮汐早报 09:00。GitHub cron 只提供近似触发，不承诺严格准点。

新增来源前必须更新：来源登记、适配器、快照 schema/质量规则、Provider、数据健康中心依赖、对应工作流（如需要）和离线回归测试。
