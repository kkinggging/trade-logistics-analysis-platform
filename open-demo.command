#!/bin/zsh
set -e
cd "$(dirname "$0")/frontend"
PORT="4180"
if curl -fsS "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q '贸易物流一体化分析辅助平台'; then
  open "http://127.0.0.1:$PORT/"
  echo "首钢贸易分析平台已在 http://127.0.0.1:$PORT/ 运行"
  exit 0
fi
if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  echo "端口 $PORT 已被其他服务占用，请先运行 stop-demo.command 或关闭占用该端口的进程。" >&2
  exit 1
fi
node_bin="$(command -v node)"
npm run build >/tmp/shougang-build.log 2>&1
nohup "$node_bin" "$(pwd)/node_modules/vite/bin/vite.js" preview --host 127.0.0.1 --port "$PORT" --strictPort > .demo-server.log 2>&1 &
echo $! > .demo-server.pid
for i in {1..20}; do
  curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break
  sleep 0.25
done
open "http://127.0.0.1:$PORT/"
echo "首钢贸易分析平台已启动：http://127.0.0.1:$PORT/"
