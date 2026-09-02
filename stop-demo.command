#!/bin/zsh
set -e
cd "$(dirname "$0")/frontend"
if [[ -f .demo-server.pid ]]; then
  pid="$(cat .demo-server.pid)"
  if kill -0 "$pid" 2>/dev/null; then kill "$pid"; echo "已停止首钢贸易分析平台（PID $pid）"; else echo "成品服务进程已结束"; fi
  rm -f .demo-server.pid
else
  echo "没有找到由 open-demo.command 启动的成品服务。"
fi
