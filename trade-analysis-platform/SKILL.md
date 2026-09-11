---
name: trade-analysis-platform
description: "在首钢国际贸易物流一体化分析平台中延续既有架构、数据契约、业务口径与中文视觉风格，适用于功能开发、数据接入、界面优化、动效调整和发布验收。"
---

# 首钢国际贸易物流一体化分析平台开发规范

本 Skill 用于把本项目交接给新的开发者或 Claude Code Sonnet。它不是通用 React 教程，而是项目的决策索引：先识别任务所属领域，再读取对应参考文档，最后在不破坏既有能力的前提下实施、验证并汇报。

## 项目边界

- 项目根目录：`/Users/ken/work/贸易分析平台/platform`。
- 前端是静态发布应用；浏览器读取 `frontend/public/data/*.json` 快照，不能把 GitHub Pages 当作运行时抓取服务器。
- 默认中文、浅色钢蓝/米白/暖金视觉体系；3D 地球可以保留局部暗色科技风，不代表全局暗色主题。
- 内部业务数据按已完成的 2025 年数据处理，客户名称已经脱敏；不要恢复、猜测或补造真实身份。
- 配额、贸易救济和 CBAM 的缺失、明确不适用、数值为零必须分开表达；任何理论测算必须带免责声明。
- 修改前先检查 `git status --short` 和相关文件；保留用户已有未提交修改。禁止使用 `git reset --hard`、`git checkout --` 等覆盖性操作。
- 未经用户明确要求，不推送 GitHub、不改变 Pages 设置、不安装后台调度器、不改动无关模块。

## 任务路由：先读哪里

| 当前任务 | 必读参考文档 | 重点入口 |
| --- | --- | --- |
| 架构、路由、Provider、构建、模块边界 | [architecture.md](references/architecture.md) | `frontend/src/App.tsx`、`frontend/src/core/data/provider.ts` |
| 抓取、快照、调度、数据完整性、源站失败 | [data-sources.md](references/data-sources.md) | `data-ingestion/`、`frontend/public/data/` |
| 出口条件、成本、配额、贸易救济、CBAM、内部业务 | [domain-rules.md](references/domain-rules.md) | `frontend/src/core/`、`features/cost-calculator/` |
| UI、图表、晨报、地球仪、GSAP、响应式和无障碍 | [ui-motion.md](references/ui-motion.md) | 对应 feature 的 `.tsx/.css` |
| 测试、本地预览、静态发布、提交和线上验收 | [quality-release.md](references/quality-release.md) | `package.json`、`.github/workflows/` |
| Claude Code 接手与当前未完成事项 | [handoff.md](references/handoff.md) | 先复核工作区，不把旧状态当成实时事实 |

只读取与当前任务有关的参考文档；如果任务跨越多个领域，按“数据契约 → 业务计算 → UI → 验收发布”的顺序读取。

## 统一实施流程

1. 先定位真实代码、数据快照和调用链，确认用户要求是新增、替换还是删除；不要仅凭页面截图改写数据逻辑。
2. 对外部数据先确认来源、覆盖期、抓取模式和失败状态，再接入前端；抓取成功不等于数据字段完整，普通新闻成功也不等于历史人物事件成功。
3. 业务计算遵循现有数据契约；缺数据时显示“待补/不适用/未抓取”等事实状态，不用随机值、旧值冒充新值或把税率强行折算成成本。
4. UI 改动优先局部组件和样式隔离，保持路由、Provider、快照 schema 兼容；需要改变 schema 时同步更新抓取器、类型、Provider、前端和验收脚本。
5. 动效必须服务于阅读层级。优先 `transform`、`opacity` 和 GSAP context 清理；必须考虑 `prefers-reduced-motion`、触控降级、键盘操作和原生滚轮。
6. 至少执行与风险相称的 type-check/build；数据接入还要跑对应 adapter/audit；发布前检查 diff、敏感信息和静态资源路径。
7. 最终报告说明：改了哪些文件、数据是否真实/快照/回退、验证命令和结果、仍存在的限制，以及是否需要用户批准发布。

## 不可违背的项目约定

- 快照链路是“抓取 → 校验 → 标准化 → 原子写入 → 前端读取”。失败时保留最近一次成功快照，不能用空数组覆盖；状态必须让用户看出 `fresh` 与 `fallback` 的差别。
- GitHub Pages 只发布静态构建产物。要自动更新，必须由 GitHub Actions 或用户自己的可联网调度环境运行 `data-ingestion` 脚本；不要在浏览器里直接跨域抓取外站来假装实时。
- 贸易救济和关税配额是风险/人工复核信息，不直接进入成本计算器数值；CBAM 仅按规则对欧盟/英国触发。
- 任何“完整抓取”“实时”“全球覆盖”“全部图片”等表述都必须以快照字段和验收结果为依据，不能以 HTTP 200 或板块数量推断。
- 代码、数据和文档应维持可交接性：命名清楚、来源和口径可追溯、不要留下临时调试文案或无意义占位文案。
