# 贸易物流一体化分析辅助平台

首钢国际贸易物流一体化分析辅助平台，前端采用 React + TypeScript + Vite，使用 Hash Router 适配静态托管，业务数据通过 `frontend/public/data` 中的结构化快照驱动。

## 本地开发

```bash
cd frontend
npm ci
npm run test:smoke
npm run dev
```

## GitHub Pages

推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会自动完成依赖安装、数据同步、类型检查、构建和 Pages 部署；工作流也会在每天北京时间 18:00 自动运行，并提供手动触发入口。抓取失败的数据源由同步入口保留最近一次成功快照，同时以失败状态结束同步步骤，但不阻断可用页面的构建与发布。

同步成功写入的新快照由 `github-actions[bot]` 提交回仓库。机器人提交不会再次触发重复部署，当前一次工作流会直接使用新快照完成构建和发布。

平台前端使用静态数据快照。`data-ingestion` 中的抓取脚本需要在具备 Node.js 和网络访问条件的调度环境中运行；GitHub Pages 本身只负责托管页面，不执行定时抓取任务。
