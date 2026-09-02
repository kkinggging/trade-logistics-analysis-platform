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

推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会自动完成依赖安装、类型检查、构建和 Pages 部署。构建产物来自 `frontend` 的 Vite 配置，输出到仓库根目录的 `offline-demo`（该目录为构建产物，不纳入版本控制）。

平台前端使用静态数据快照。`data-ingestion` 中的抓取脚本需要在具备 Node.js 和网络访问条件的调度环境中运行；GitHub Pages 本身只负责托管页面，不执行定时抓取任务。
