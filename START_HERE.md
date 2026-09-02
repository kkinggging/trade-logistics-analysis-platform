# 成品测试入口

`frontend/diagnose.html` 是开发诊断页，不是平台首页。

## 推荐：开发模式

```bash
cd /Users/ken/work/贸易分析平台/platform/frontend
npm install
npm run start
```

浏览器打开 `http://127.0.0.1:5173/`（如果端口被占用，以终端显示地址为准）。

## 推荐：模拟成品环境

```bash
cd /Users/ken/work/贸易分析平台/platform/frontend
npm run serve:offline
```

浏览器打开 `http://127.0.0.1:4180/`。该命令会先构建，再用静态预览服务器提供 `offline-demo`。4180 是首钢平台专用端口，不会和个人工作台的 4173 端口混淆。

macOS 也可以直接双击 [`open-demo.command`](./open-demo.command)，它会自动构建、启动成品预览服务并打开正确地址；停止服务可双击 [`stop-demo.command`](./stop-demo.command)。不要双击 `offline-demo/index.html`，因为 `file://` 会被浏览器安全策略拦截模块脚本和 JSON 数据，表现为黑屏。

## 直接查看构建目录

构建后的入口是 [`offline-demo/index.html`](./offline-demo/index.html)，但不要直接双击 HTML；应在 `offline-demo` 目录启动静态服务器：

```bash
cd /Users/ken/work/贸易分析平台/platform/offline-demo
python3 -m http.server 4180
```

然后打开 `http://127.0.0.1:4180/`。

## 最小验收

```bash
cd /Users/ken/work/贸易分析平台/platform/frontend
npm run test:smoke
```

通过后依次检查：市场仪表盘、产品线/区域切换、成本计算器、风险中心审核按钮、综合总览内部跳转、晨报导出、运输路线搜索、策略生成。
