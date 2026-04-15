#!/usr/bin/env bash
set -euo pipefail

# Trigger production update from local machine via SSH.
# Required env:
#   PROD_HOST
# Optional env:
#   PROD_USER (default: admin)
#   PROD_PORT (default: 22)
#   PROD_REPO_DIR (default: /opt/tradingRecords)
#   PROD_SSH_KEY (ssh identity file path)

PROD_HOST="${PROD_HOST:-}"
PROD_USER="${PROD_USER:-admin}"
PROD_PORT="${PROD_PORT:-22}"
PROD_REPO_DIR="${PROD_REPO_DIR:-/opt/tradingRecords}"
PROD_SSH_KEY="${PROD_SSH_KEY:-}"

if [[ -z "$PROD_HOST" ]]; then
  echo "缺少 PROD_HOST。"
  echo "示例:"
  echo "  PROD_HOST=1.2.3.4 PROD_USER=admin bash deploy/remote-update.sh"
  exit 1
fi

SSH_CMD=(ssh -p "$PROD_PORT")
if [[ -n "$PROD_SSH_KEY" ]]; then
  SSH_CMD+=(-i "$PROD_SSH_KEY")
fi

REMOTE="$PROD_USER@$PROD_HOST"
REMOTE_CMD="cd '$PROD_REPO_DIR' && bash deploy/update.sh"

echo "开始远端更新: $REMOTE ($PROD_REPO_DIR)"
"${SSH_CMD[@]}" "$REMOTE" "$REMOTE_CMD"
echo "远端更新完成"
