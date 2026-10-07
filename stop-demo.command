#!/bin/zsh
set -e
cd "$(dirname "$0")/frontend"
server_label="com.shougang.trade-analysis.preview"
server_uid="$(id -u)"
if [[ -f .demo-server.pid ]]; then
  pid="$(cat .demo-server.pid)"
  if kill -0 "$pid" 2>/dev/null; then echo "已停止首钢贸易分析平台（PID $pid）"; else echo "成品服务进程已结束"; fi
  launchctl bootout "gui/$server_uid/$server_label" >/dev/null 2>&1 || true
  rm -f .demo-server.pid
else
  echo "没有找到启动记录，检查 4180 端口……"
  port_pids="$(lsof -tiTCP:4180 -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$port_pids" ]]; then
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      process_cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      if [[ "$process_cmd" == *"$PWD/node_modules/vite/bin/vite.js preview"* || "$process_cmd" == *"$PWD/node_modules/.bin/vite preview"* ]]; then
        kill "$pid" 2>/dev/null || true
      else
        echo "检测到 4180 由其他程序占用，未终止：$process_cmd"
      fi
    done <<< "$port_pids"
    echo "已停止 4180 端口上的预览进程。"
  fi
  launchctl bootout "gui/$server_uid/$server_label" >/dev/null 2>&1 || true
fi
