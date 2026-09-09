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

if lsof -nP -iTCP:4180 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "贸易分析平台已经在运行：http://127.0.0.1:4180/#/"
  echo "如需重新启动，请先双击“关闭贸易分析平台.command”。"
  open "http://127.0.0.1:4180/#/"
  read -r "?按回车键关闭窗口。"
  exit 0
fi

echo "正在构建并启动贸易分析平台……"
npm run serve:offline

echo
echo "服务器已停止。"
read -r "?按回车键关闭窗口。"
