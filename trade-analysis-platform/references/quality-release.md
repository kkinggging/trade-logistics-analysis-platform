# 质量、预览与发布

## 本地验证

在项目根目录执行：

```bash
cd /Users/ken/work/贸易分析平台/platform/frontend
npm ci
npm run test:smoke
```

`test:smoke` 当前包含 type-check 和 Vite build。需要交互预览时：

```bash
npm run serve:offline
```

打开 `http://127.0.0.1:4180/`；不要双击 `offline-demo/index.html`，因为 `file://` 会阻断模块和 JSON。也可使用项目根目录的 `open-demo.command` 启动、`stop-demo.command` 停止；不要因为端口冲突去修改其他工作台的端口。

## 按任务增加验收

- 数据适配器：运行对应适配器的离线 fixture/回归测试；确认非法输入非零退出且旧快照哈希不变。
- 图表依赖：`node data-ingestion/audit-analysis-chart-dependencies.mjs`。
- 配额完整性：`node data-ingestion/audit-taric-quota-completeness.mjs`。
- 航运适配与映射：`node data-ingestion/test-shipping-index-adapter.mjs`、`node data-ingestion/audit-shipping-index-mapping.mjs`。
- 构建后检查 `offline-demo` 的 JSON、图片、HashRouter 路由和 Pages 子路径；至少打开首页、综合分析、晨报、成本计算器、数据健康、模板库和运输模块。

验收报告要用事实描述：记录数、覆盖起止、快照时间、fresh/fallback、失败原因、图表是否有真实依赖。不要把“页面能打开”写成“数据已实时更新”。

## GitHub Pages

`.github/workflows/deploy-pages.yml` 负责依赖、同步、构建和 Pages；数据同步工作流还会把新的 JSON 快照提交回仓库。当前约定的近似时间为北京时间 18:00 全量、MySteel 08:10/09:00、潮汐早报 09:00。GitHub Actions 可能延迟，源站限制也可能让某来源 fallback。公开仓库不能放 API key、密码、Token 或未确认可公开的原始数据；翻译等可选凭据应使用 Actions Secrets。

除非用户明确要求，完成代码和本地验收不等于授权 push 或公开发布。用户要求发布时，先检查 `git diff --check`、敏感信息、构建，再提交并按要求推送；不要把无关的用户未提交修改一并重写或删除。

## 提交前清单

```bash
git status --short --branch
git diff --check
```

核对：

1. 修改范围是否只覆盖用户要求的模块；
2. 现有路由、Provider、数据快照和其他页面是否仍可构建；
3. 资源路径是否使用 `BASE_URL` 或可部署路径；
4. 是否留下真实凭据、临时日志、伪造数据和无效占位文案；
5. 是否记录了验证结果和尚未解决的源站限制。
