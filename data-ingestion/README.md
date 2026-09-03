# 钢材市场看板抓取适配器

## 航运指数看板接入与图表映射审查

目标页面：

`https://cb3e42b893e04a0daa4c606705c2dacf.app.codebuddy.work/index.html`

### 已核验的数据入口

页面加载时直接读取同域公开 JSON，而不是通过截图或导出图片取数：

| 源文件 | 业务数据 | 频率 | 单位 | 平台图表角色 |
|---|---|---|---|---|
| `data/ccfi.json` | CCFI 中国出口集装箱运价指数（含各航线，核心口径为“中国出口集装箱运价综合指数”） | 周频 | 指数点 | 航运核心指标卡、集装箱趋势、航线明细 |
| `data/scfi.json` | SCFI 上海集装箱运价指数 | 周频 | 指数点 | 航运核心指标卡、集装箱趋势 |
| `data/bsi.json` | BSI 超灵便型船运价指数 | 日频 | 指数点 | 航运核心指标卡、干散货分面趋势 |
| `data/bdi.json` | BDI 波罗的海干散货指数 | 日频 | 指数点 | 航运核心指标卡、干散货分面趋势、物流建议 |
| `data/brent.json` | Brent 布伦特原油期货收盘价 | 日频 | USD/bbl | 航运核心指标卡、能源分面趋势 |
| `data/nymex.json` | NYMEX 原油期货收盘价 | 日频 | USD/bbl | 航运核心指标卡、能源分面趋势 |

页面上的“导出图表”是 Chart.js 在浏览器内生成 PNG；“导出 Excel”是基于内存数组生成工作簿，未发现独立稳定的导出 API。因此后台定时任务直接抓取上述六个 JSON，导出按钮只用于人工抽样校核。

### 适配器与快照

```bash
cd /Users/ken/work/贸易分析平台/platform/data-ingestion
node fetch-shipping-index-dashboard.mjs
```

离线复现（不访问外网）：

```bash
node fetch-shipping-index-dashboard.mjs \
  --input-dir ./fixtures/shipping-index \
  --output /tmp/external_shipping_indices.json
```

适配器输出 `frontend/public/data/external_shipping_indices.json`，每个序列统一为：

`{ code, label, category, frequency, unit, points[], latest, observationCount }`

其中 `points[]` 的字段为 `date`、`value`、`previousValue`、`previousDate`、`changeRatePct`、`routeName`、`routeCode`。当源站没有 `change_rate` 但提供 `prev_value` 时，适配器按 `(value - prev_value) / prev_value × 100` 补算，保证 CCFI/SCFI 核心指标卡与趋势 tooltip 不出现无依据的空环比。

请求使用有限重试、超时、指数退避；六组数据全部通过校验后才写入，写入采用临时文件原子替换。任意一组抓取或校验失败都会退出非零且不触碰现有快照，因此由统一同步入口继续使用最近一次成功快照。

### 独立图表映射契约

六组数据的图表角色和主前端整合边界记录在 [`shipping-index-chart-mapping.json`](./shipping-index-chart-mapping.json)。主 Agent 应按该契约接入：

- `shipping-kpi-strip`：六张核心卡片；指数点与 USD/bbl 不混用坐标轴；展示最新值、变化、频率和日期。
- `shipping-container-trend`：CCFI/SCFI 周频双线趋势，默认近 12 个月。
- `shipping-bulk-energy-context`：BSI、BDI、Brent、NYMEX 分面展示，指数点和美元/桶分开坐标。
- `shipping-logistics-advice`：建议必须追溯到序列、日期、变化值和快照哈希；指数只代表市场环境，不代替具体路线、舱位或 ETA。

当前已核验的程序链路是 `getShippingIndexSnapshot()` → `shippingIndices` → 综合分析三类航运图表与策略引擎。策略引擎的物流建议采用 BDI/BSI 二选一作为简洁触发信号；六组数据仍通过核心指标卡、CCFI/SCFI 集装箱趋势和 BSI/BDI/Brent/NYMEX 分面趋势完整展示，不应把“策略规则选一个代表指数”误认为“数据未接入”。

### 独立验收

```bash
node audit-shipping-index-mapping.mjs
```

离线回归测试：

```bash
node test-shipping-index-adapter.mjs
```

该测试不访问网络、不修改仓库文件，验证 fixture 生成、CCFI/SCFI 缺失环比时的补算，以及失败时旧快照 SHA-256 保持不变。

验收必须同时满足：

1. 六个序列全部存在，日期合法、值为有限数字、日期/航线组合无重复，`latest` 属于对应序列；CCFI 必须含中国出口集装箱综合指数。
2. 六组分类、频率、单位和 `observationCount` 与契约一致；六组最新点都能提供 `changeRatePct`（源站字段或适配器补算）。
3. 快照含六个源文件哈希、抓取时间、覆盖区间、重试摘要，且 schema 为 `1.1`。
4. `Provider` 与统一策略数据包能读取并传递 `shippingIndices`；综合分析必须按映射契约实际渲染六组图表，不能只渲染 BDI/BSI 一条建议。
5. 用 fixture 成功生成快照；将任一 fixture 改为非法值时，适配器非零退出且既有输出文件 SHA-256 不变。
6. 在线环境抽查时，至少逐项对照页面六张摘要卡的最新日期/数值与 JSON；每周用页面 Excel 导出抽查 CCFI 航线、SCFI、BSI、BDI、Brent、NYMEX 的末点。

## 海关钢材出口看板接入

出口看板：

`https://sleepycat-db612-d4flpypa62d30215-1466100115.tcloudbaseapp.com/steel-export-dashboard/index.html`

已新增独立适配器：

```bash
cd /Users/ken/work/贸易分析平台/platform/data-ingestion
node fetch-steel-export-dashboard.mjs
```

适配器读取公开 `assets/codebook.json` 与 `assets/data_YYYY.bin`，解码后生成：

`/Users/ken/work/贸易分析平台/platform/frontend/public/data/external_steel_export.json`

快照包含月度出口量/加权均价、贸易伙伴、区域、六大区域、品种、商品、注册地聚合，以及 CR5、HHI、伙伴数。前端通过 `DataProvider.getSteelExportSnapshot()` 可选读取，不会替换原有行情、经营、成本、汇率和风险数据。

当前快照验证结果：1,677,485 条明细、55 个月、281 个伙伴，覆盖 2021-01 至 2026-07；其中 200 个伙伴可与平台世界底图名称匹配。

平台 01 客观信息新增/替换展示：

- 「贸易伙伴世界分布」：按中国海关钢材出口量着色，悬停显示中文伙伴与出口量；
- 「出口规模与均价趋势」：月度出口量柱状图 + 出口额除以出口量得到的加权均价折线；
- 「主要贸易伙伴排名」：累计出口量 Top10，并在提示中显示伙伴加权均价。

地图、趋势和排名使用同一份出口快照；由于出口看板当前没有平台产品线编码，出口统计默认代表海关钢材全市场，不与热轧/冷轧内部经营数据混算。

该看板的下载明细按钮适合人工核验；后台任务使用公开数据资源，不依赖浏览器点击下载。正式部署前仍需确认测试域名的长期稳定性、授权与数据使用许可。

## 外汇汇率看板接入

来源：

`https://sleepycat-db612-d4flpypa62d30215-1466100115.tcloudbaseapp.com/forex-dashboard/`

运行抓取：

```bash
cd /Users/ken/work/贸易分析平台/platform/data-ingestion
node fetch-forex-dashboard.mjs
```

输出：

`/Users/ken/work/贸易分析平台/platform/frontend/public/data/external_forex.json`

适配器从公开 `data.json` 读取 DXY（美元指数）、USDCNY（美元兑人民币）和 EURUSD（欧元兑美元），按三者共同近 12 个月交易日收盘价对齐，并计算历史分位、MA20/MA60、20 日动量、等价美元相对收益、波动率、最大回撤、保守/激进风险评分及 30/60/90 天账期回测。所有指标是历史统计，不是预测；USD 是固定基准。

综合分析页新增 DXY 宏观背景、EURUSD/USDCNY 分位与动量、等价美元相对收益、收益风险概览、综合评分和账期回测。外汇快照独立于原有 `FxScenario`，不存在快照时不会影响成本计算器和其他模块。

## 已确认的公开入口

目标看板：

`https://sleepycat-db612-d4flpypa62d30215-1466100115.tcloudbaseapp.com/steel-dashboard/`

页面启动时读取：

`https://sleepycat-db612-d4flpypa62d30215-1466100115.tcloudbaseapp.com/steel-dashboard/data.json`

页面显示的样例生成时间为 `2026-08-28 17:06:25`，当前覆盖至 `2026-08-27`。5 个“下载 Excel”按钮是浏览器端基于这份内存快照生成 Blob 文件，未发现独立的稳定 Excel 下载 API。因此定时任务使用公开 JSON，Excel 只作为人工抽样校核入口。

## 手动抓取

在有网络的部署机器上执行：

```bash
cd /Users/ken/work/贸易分析平台/platform/data-ingestion
node fetch-steel-dashboard.mjs
```

成功后会生成：

`/Users/ken/work/贸易分析平台/platform/frontend/public/data/external_steel_dashboard.json`

输出包括生成时间、抓取时间、覆盖区间、来源、单位、频率、`fetch_mode`、原始响应 SHA-256 和转换后的 `MarketQuote` 记录。失败时不会覆盖最近一次成功快照；写入采用临时文件校验后原子替换。

## 当前同步状态与每日 18:00 调度

当前仓库已经具备“抓取—校验—处理—生成结构化快照—前端读取”的适配器和统一入口。GitHub Pages 工作流已提供每天北京时间 18:00 的 GitHub Actions 定时入口，会在可联网的 Actions runner 上尝试同步并提交新快照；如果不使用该工作流，代码仓库也不会自行安装 cron/launchd，`external_*.json` 会停留在最近一次成功生成的内容。GitHub Actions 的定时触发由平台调度，实际启动时间可能有延迟，不应视为严格准点。

快照不是截图：它是结构化 JSON，包含源站原始数据哈希、源站生成时间（如有）、本地抓取时间、覆盖日期、标准化字段、去重结果、质量告警和面向图表的计算指标。前端读取的是这份数据，不会在浏览器中直接抓取外站。

统一入口：

```bash
cd /Users/ken/work/贸易分析平台/platform/data-ingestion
node sync-all.mjs
```

统一入口使用 [`sync-schedule.json`](./sync-schedule.json) 作为可靠性与调度参数来源：任务级最多重试 2 次，单个适配器内部默认最多重试 3 次；每次请求有超时和指数退避。入口通过 `.sync-all.lock` 保证单实例运行，超过 12 小时的遗留锁会安全清理，避免机器异常断电后永久阻塞。

每个来源完成后都会立即原子写入 `frontend/public/data/data_sync_status.json`。状态含义为：`fresh` 表示本次成功生成新快照，`fallback` 表示本次失败但保留并继续使用上次成功快照，`unavailable` 表示没有可用历史快照。快照文件本身只通过临时文件 + 原子替换更新，失败、校验失败或进程中断均不会覆盖旧文件。统一入口在任一来源失败时返回非零退出码，便于调度器报警，但会继续处理其他来源。

如果平台通过构建后的 `offline-demo` 提供服务，使用 `node sync-all.mjs --build`：同步成功后会重新生成成品包，避免只更新 `frontend/public/data` 而正在运行的静态成品仍读取旧文件。

入口依次调用四个适配器：钢材市场、海关出口、外汇、EU/UK 关税配额。任一来源失败时，该来源不会覆盖最近成功文件，并返回非零状态供告警系统发现；其他来源仍可继续更新。

## 配额全量层与完整性仲裁

配额适配器以源站导出的 `taric_quota_data.csv` 与 `uk_quota_data.csv` 为定时抓取主入口，不依赖页面默认筛选。生成的 `external_taric_quota.json`（schema `2.1`）同时保留：

- `raw`：完整 CSV 原文、表头、逐行原始值、源行号、解析状态与 `raw_record_ref`；
- `accepted_rows`：全部通过结构和业务字段校验的标准化记录；
- `normalized_rows`：按来源业务键去重后的历史记录；
- `latest.rows`：最新 `fetch_date` 的全部记录，用于现有图表；
- `origin_index` / `origin_groups`：将 EU `origin` 按 `|` 拆成可查询的国家/地区/共享组，同时保留原始 `origin` 文本；
- `quality`：raw、accepted、rejected、repaired、deduped 的闭环计数和异常原因。

EU 与 UK 的去重键分别包含原产地/国家组、商品范围和配额期，避免不同国家组被错误覆盖。共享配额池会建立查询索引，但不得把同一余额按国家重复相加。当前源站页面的“25 个 Code”与导出 CSV 可核出的 24 个历史有效 Code 不一致，快照会保留该差异告警，不会静默补造数据。

只读验收命令：

```bash
node data-ingestion/audit-taric-quota-completeness.mjs
```

验收至少要求 raw = accepted + rejected、accepted 与落盘 `accepted_rows` 一致、deduped 与 `normalized_rows` 一致、latest 为最新日期全部记录，并且印度、土耳其、配额 Code `099835` / `099840` 和 UK 国家组 `1100` 均可追溯到源行。

生产调度示例见 [`sync-all.cron.example`](./sync-all.cron.example) 和 macOS 的 [`sync-all.launchd.plist.example`](./sync-all.launchd.plist.example)。GitHub Actions 方案不需要在本机安装调度器；如果改用自有服务器或 Mac，则这些文件只是配置模板，仍需部署人员安装并配置日志、失败告警和权限。cron 示例使用 `CRON_TZ=Asia/Shanghai`；launchd 使用机器本地时区，若机器不是中国标准时间，应在部署环境将时区设为 `Asia/Shanghai` 或改用具备时区字段的调度器。

由部署环境的受控调度器调用：

```cron
CRON_TZ=Asia/Shanghai
0 18 * * * cd /Users/ken/work/贸易分析平台/platform/data-ingestion && /usr/local/bin/node sync-all.mjs >> /var/log/trade-platform-sync.log 2>&1
```

各适配器已实现超时/重试（适配器能力不同）、临时文件原子替换、生成时间与抓取时间分开记录及响应哈希。正式部署还应保留最近成功快照并接入异常告警；不要把这条 cron 自动安装到用户电脑。

## 可映射内容

| 看板数据 | 平台字段 | 说明 |
|---|---|---|
| 钢协会员企业库存 | `MarketQuote` / `STEEL_ASSOC_MEMBER_INVENTORY` | 单位为万吨，旬度序列（平台频率 `dekadal`） |
| 中国钢材社会库存 | `MarketQuote` / `STEEL_SOCIAL_INVENTORY` | 单位为万吨，旬度序列（平台频率 `dekadal`） |
| 高炉开工率 | `MarketQuote` / `BLAST_FURNACE_OPERATING_RATE` | 单位为%，周度序列 |
| 高炉产能利用率 | `MarketQuote` / `BLAST_FURNACE_CAPACITY_UTILIZATION` | 单位为%，周度序列 |
| 普氏指数 | `MarketQuote` / `PLATTS_IRON_ORE_INDEX` | 单位为 USD/ton，日度序列 |

当前数据不含伙伴国家、贸易额、客户利润、订单号等字段，因此不能由此看板生成贸易伙伴地图或业务利润结论。

## 抓取完成性验收

- HTTP 请求成功，响应为 JSON，包含 `generated_at`、`inventory`、`platts_daily`。
- 5 类目标序列均存在，日期合法、数值为有限数字、日期不晚于源快照覆盖日期。
- 单位、频率、币种不混用；原始生成时间和本地抓取时间同时保留。
- 5 类目标序列逐项校验，日期合法、无重复并按日期排序；旬度不转换为月度。
- 连续失败不覆盖最近成功快照，并能通过退出码/日志触发告警。
- 生成的外部快照可被前端读取；无快照时平台仍能完全使用现有本地演示数据。
- 每周至少抽查一次：页面顶部 KPI、图表最后一个点与 Excel 导出数据逐项比对；Excel 只用于校核，不作为后台自动化依赖。
