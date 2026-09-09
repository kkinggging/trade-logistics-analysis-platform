#!/bin/zsh

set -u

PORT_PIDS="$(lsof -tiTCP:4180 -sTCP:LISTEN 2>/dev/null || true)"

if [[ -z "$PORT_PIDS" ]]; then
  echo "4180 端口当前没有运行贸易分析平台。"
else
  echo "正在关闭 4180 端口的贸易分析平台……"
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done <<< "$PORT_PIDS"

  sleep 1
  if lsof -nP -iTCP:4180 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "主进程仍在退出中，请稍后再次双击关闭文件。"
  else
    echo "贸易分析平台已关闭。"
  fi
fi

read -r "?按回车键关闭窗口。"
