#!/bin/bash
set -euo pipefail

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
    return
  fi

  echo "缺少管理员权限: 请使用 root 执行，或为当前用户配置 sudo。"
  exit 1
}

if ! command -v certbot >/dev/null 2>&1; then
  echo "未找到 certbot，请先安装 certbot 和 python3-certbot-nginx。"
  exit 1
fi

run_privileged certbot renew --quiet --deploy-hook "systemctl reload nginx"
