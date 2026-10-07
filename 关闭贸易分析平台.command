#!/bin/zsh

set -u

SERVER_LABEL="com.shougang.trade-analysis.preview"
SERVER_UID="$(id -u)"
launchctl bootout "gui/$SERVER_UID/$SERVER_LABEL" >/dev/null 2>&1 || true

PORT_PIDS="$(lsof -tiTCP:4180 -sTCP:LISTEN 2>/dev/null || true)"

if [[ -z "$PORT_PIDS" ]]; then
  echo "4180 端口当前没有运行贸易分析平台。"
else
  echo "正在关闭 4180 端口的贸易分析平台……"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    process_cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$process_cmd" == *"/Users/ken/work/贸易分析平台/platform/frontend/node_modules/vite/bin/vite.js preview"* || "$process_cmd" == *"/Users/ken/work/贸易分析平台/platform/frontend/node_modules/.bin/vite preview"* ]]; then
      kill "$pid" 2>/dev/null || true
    else
      echo "检测到 4180 由其他程序占用，未终止：$process_cmd"
    fi
  done <<< "$PORT_PIDS"

  sleep 1
  if lsof -nP -iTCP:4180 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "主进程仍在退出中，请稍后再次双击关闭文件。"
  else
    echo "贸易分析平台已关闭。"
  fi
fi

read -r "?按回车键关闭窗口。"
