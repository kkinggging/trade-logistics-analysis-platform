# 架构与模块边界

## 总体结构

```text
platform/
├── frontend/                  React + TypeScript + Vite 前端
│   ├── public/data/            构建时随站点发布的 JSON 快照与静态资源
│   └── src/
│       ├── core/data/          DataProvider 与数据读取
│       ├── core/store/         领域类型与状态
│       ├── core/strategy/      晨报语料、指标和业务建议
│       ├── core/cost/          成本计算器类型与计算逻辑
│       ├── features/           页面级业务模块
│       └── shared/             布局、图表、地球仪等可复用组件
├── data-ingestion/             外部来源适配器、校验器、调度入口和契约
├── .github/workflows/          构建、Pages 发布和定时快照任务
└── offline-demo/               构建后静态预览目录，不是源代码目录
```

## 技术选型与原则

- React 18 + TypeScript + Vite：页面组件化、类型约束和静态构建。
- `HashRouter`：适配 GitHub Pages 的静态托管，新增路由不得改成依赖服务器 fallback 的 BrowserRouter。
- ECharts：市场、贸易、政策和指标图表；图表实例必须在卸载时释放，并使用容器尺寸而不是硬编码视口。
- GSAP / `@gsap/react`：首屏、卡片、展开层和联动状态动效；React 中使用 ref/context 清理，不在 render 中创建无限动画。
- `globe.gl` + Three.js：局部暗色 3D 地球展示路线或出口关系；没有统一坐标时明确跳过绘制，不猜坐标。

## 路由清单

`frontend/src/App.tsx` 是权威路由入口：

| 路由 | 模块 |
| --- | --- |
| `/`、`/morning-brief` | 晨报，包含贸易晨报与潮汐早报内容 |
| `/analysis` | 综合分析主板块 |
| `/cost-calculator` | 钢材出口外部附加吨成本估算 |
| `/shipping` | 航运路线筛选与方案 |
| `/globe` | 独立 3D 地球展示 |
| `/data-health` | 数据源状态、覆盖期、回退和依赖解释 |
| `/template-library` | 动效与版式模板研究库 |
| `/dashboard`、`/overview`、`/risk-center`、`/strategy` | 为既有链接保留的兼容别名 |

新增页面要同时更新路由、侧栏/入口、样式和 smoke 验收；不要删除兼容别名来“清理”代码。

## 数据读取边界

`frontend/src/core/data/provider.ts` 中的 `StaticDataProvider` 使用 `import.meta.env.BASE_URL` 拼接 `data/` 路径。可选外部快照读取失败返回 `null`，基础本地数据失败才抛错。新增快照应：

1. 在 `core/store/types.ts` 定义或复用类型；
2. 给 Provider 增加带结构校验的读取方法；
3. 在业务策略中区分 null、空集合、零值和不适用；
4. 在数据依赖审计中登记；
5. 保持 `BASE_URL`、Pages 子路径和 `offline-demo` 预览都能读取。

## 修改隔离

页面级改动优先放在对应 `features/<name>/`；跨页面才放到 `shared/`。不要为了一个页面改全局 `App.css` 或覆盖 Provider 的既有合并规则。涉及内部数据时，优先复用 `getInternalBusinessSnapshot()` 与 `getInternalBusinessCustomerSnapshot()`，不要把原始表格直接放进组件。
