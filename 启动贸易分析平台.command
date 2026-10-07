#!/bin/zsh

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm，请先安装 Node.js。"
  read -r "?按回车键关闭窗口。"
  exit 1
fi

if ! cd "$FRONTEND_DIR"; then
  echo "找不到前端目录：$FRONTEND_DIR"
  read -r "?按回车键关闭窗口。"
  exit 1
fi

echo "正在构建并启动贸易分析平台……"
if ! npm run build; then
  echo "构建失败，未启动或替换现有服务。"
  read -r "?按回车键关闭窗口。"
  exit 1
fi

# 不复用旧服务。只有确认端口进程就是本项目 frontend 下的 Vite preview，才停止它；
# 其他程序占用端口时安全退出，避免误杀用户的其他 Node 服务。
PORT_PIDS="$(lsof -tiTCP:4180 -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$PORT_PIDS" ]]; then
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    process_cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$process_cmd" == *"$FRONTEND_DIR/node_modules/.bin/vite preview"* || "$process_cmd" == *"$FRONTEND_DIR/node_modules/vite/bin/vite.js preview"* || "$process_cmd" == *"$FRONTEND_DIR/node_modules/vite/dist/node/cli.js preview"* ]]; then
      echo "正在停止旧的本项目预览服务（PID $pid）……"
      kill "$pid" 2>/dev/null || true
    else
      echo "4180 端口已被其他服务占用，未强制终止：$process_cmd"
      read -r "?按回车键关闭窗口。"
      exit 1
    fi
  done <<< "$PORT_PIDS"
  for _ in {1..20}; do
    lsof -nP -iTCP:4180 -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 0.25
  done
  if lsof -nP -iTCP:4180 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "旧预览服务未能退出，未启动新服务。"
    read -r "?按回车键关闭窗口。"
    exit 1
  fi
fi

BUILD_ID="$(date +%Y%m%d-%H%M%S)"
OPEN_URL="http://127.0.0.1:4180/?build=$BUILD_ID#/analysis"
echo "本次构建已完成，构建编号：$BUILD_ID"
echo "正在启动新预览服务：$OPEN_URL"

SERVER_LOG="$FRONTEND_DIR/.demo-server.log"
SERVER_PID_FILE="$FRONTEND_DIR/.demo-server.pid"
SERVER_LABEL="com.shougang.trade-analysis.preview"
SERVER_UID="$(id -u)"
launchctl bootout "gui/$SERVER_UID/$SERVER_LABEL" >/dev/null 2>&1 || true
launchctl submit -l "$SERVER_LABEL" -p /bin/zsh -o "$SERVER_LOG" -e "$SERVER_LOG" -- launchd-zsh -lc "cd '$FRONTEND_DIR' && exec '$(command -v node)' '$FRONTEND_DIR/node_modules/vite/bin/vite.js' preview --host 127.0.0.1 --port 4180 --strictPort"

SERVER_READY=0
for _ in {1..40}; do
  SERVER_PID="$(lsof -tiTCP:4180 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if curl -fsS "http://127.0.0.1:4180/" >/dev/null 2>&1 && [[ -n "$SERVER_PID" ]]; then
    SERVER_READY=1
    break
  fi
  sleep 0.25
done

if [[ "$SERVER_READY" -ne 1 ]]; then
  echo "预览服务启动失败，未打开页面。日志：$SERVER_LOG"
  tail -40 "$SERVER_LOG" 2>/dev/null || true
  launchctl bootout "gui/$SERVER_UID/$SERVER_LABEL" >/dev/null 2>&1 || true
  rm -f "$SERVER_PID_FILE"
  read -r "?按回车键关闭窗口。"
  exit 1
fi

echo "$SERVER_PID" > "$SERVER_PID_FILE"
echo "服务已稳定运行（PID $SERVER_PID），正在打开本次构建页面。"
open "$OPEN_URL"
echo "验收地址：$OPEN_URL"

echo
echo "关闭服务请双击：关闭贸易分析平台.command"
read -r "?按回车键关闭窗口。"
