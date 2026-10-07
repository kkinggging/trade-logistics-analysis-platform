#!/bin/zsh
set -e
cd "$(dirname "$0")/frontend"
PORT="4180"
if ! npm run build >/tmp/shougang-build.log 2>&1; then
  echo "构建失败，未启动新服务。详见 /tmp/shougang-build.log" >&2
  exit 1
fi

PORT_PIDS="$(lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$PORT_PIDS" ]]; then
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    process_cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$process_cmd" == *"$PWD/node_modules/.bin/vite preview"* || "$process_cmd" == *"$PWD/node_modules/vite/bin/vite.js preview"* ]]; then
      kill "$pid" 2>/dev/null || true
    else
      echo "端口 $PORT 已被其他服务占用，未强制终止：$process_cmd" >&2
      exit 1
    fi
  done <<< "$PORT_PIDS"
  for _ in {1..20}; do
    lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.25
  done
fi

BUILD_ID="$(date +%Y%m%d-%H%M%S)"
OPEN_URL="http://127.0.0.1:$PORT/?build=$BUILD_ID#/analysis"
SERVER_LOG="$(pwd)/.demo-server.log"
SERVER_PID_FILE="$(pwd)/.demo-server.pid"
SERVER_LABEL="com.shougang.trade-analysis.preview"
SERVER_UID="$(id -u)"
launchctl bootout "gui/$SERVER_UID/$SERVER_LABEL" >/dev/null 2>&1 || true
launchctl submit -l "$SERVER_LABEL" -p /bin/zsh -o "$SERVER_LOG" -e "$SERVER_LOG" -- launchd-zsh -lc "cd '$(pwd)' && exec '$(command -v node)' '$(pwd)/node_modules/vite/bin/vite.js' preview --host 127.0.0.1 --port '$PORT' --strictPort"
server_pid=""
ready=0
for i in {1..20}; do
  server_pid="$(lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && [[ -n "$server_pid" ]]; then
    ready=1
    break
  fi
  sleep 0.25
done
if [[ "$ready" -ne 1 ]]; then
  echo "成品服务启动失败，未打开页面。日志：$SERVER_LOG" >&2
  tail -40 "$SERVER_LOG" 2>/dev/null || true
  launchctl bootout "gui/$SERVER_UID/$SERVER_LABEL" >/dev/null 2>&1 || true
  rm -f "$SERVER_PID_FILE"
  exit 1
fi
echo "$server_pid" > "$SERVER_PID_FILE"
open "$OPEN_URL"
echo "首钢贸易分析平台已启动（PID $server_pid）：$OPEN_URL"
