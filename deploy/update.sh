#!/bin/bash
set -e
cd /opt/tradingRecords
VENV_DIR="/opt/tradingRecordsData/venv"
PYTHON_BIN="$VENV_DIR/bin/python"
PIP_BIN="$VENV_DIR/bin/pip"
NODE_MIN_VERSION="22.22.0"

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    # Non-interactive sudo keeps remote automation predictable.
    sudo -n "$@"
    return
  fi

  echo "缺少管理员权限: 请使用 root 执行，或为当前用户配置 sudo。"
  exit 1
}

ensure_node_runtime() {
  local current_version=""
  if command -v node >/dev/null 2>&1; then
    current_version="$(node --version | sed 's/^v//')"
  fi
  if [ -n "$current_version" ] && [ "$(printf '%s\n%s\n' "$NODE_MIN_VERSION" "$current_version" | sort -V | head -n 1)" = "$NODE_MIN_VERSION" ]; then
    echo "Node.js 运行时符合要求: v$current_version"
    return
  fi

  echo "=== 升级 Node.js 至 v$NODE_MIN_VERSION ==="
  run_privileged npm install --global n@10.2.0
  run_privileged n "$NODE_MIN_VERSION"
  hash -r
  node --version
}

clean_frontend_dist() {
  local app_dir="$1"
  cd "$app_dir"
  run_privileged rm -rf dist
}

migrate_upload_dir() {
  local src="$1"
  local dst="/opt/tradingRecordsData/uploads"
  if [ -d "$src" ]; then
    run_privileged cp -an "$src"/. "$dst"/
  fi
}

case "${DEPLOY_SOURCE_MODE:-git}" in
  git)
    echo "=== 拉取最新代码 ==="
    git pull
    ;;
  snapshot)
    echo "=== 校验直接上传的源码快照（不访问 Git 远端） ==="
    test -n "${DEPLOY_SNAPSHOT_MANIFEST:-}" && test -f "$DEPLOY_SNAPSHOT_MANIFEST"
    python3 - "$DEPLOY_SNAPSHOT_MANIFEST" <<'PY'
import hashlib, json, sys
from pathlib import Path
root = Path('/opt/tradingRecords').resolve()
manifest = json.loads(Path(sys.argv[1]).read_text())
if not manifest.get('files'):
    raise SystemExit('快照文件列表为空')
for item in manifest['files']:
    path = (root / item['path']).resolve()
    if root not in path.parents or not path.is_file():
        raise SystemExit('非法或缺失的快照文件: ' + item['path'])
    if hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
        raise SystemExit('源码哈希不匹配: ' + item['path'])
print('源码快照校验通过: ' + manifest['snapshot_id'])
PY
    ;;
  *) echo "不支持的 DEPLOY_SOURCE_MODE"; exit 1 ;;
esac

ensure_node_runtime

echo "=== 安装后端依赖 ==="
run_privileged mkdir -p /opt/tradingRecordsData /opt/tradingRecordsData/uploads /opt/tradingRecordsData/venv
if [ ! -x "$PYTHON_BIN" ]; then
  run_privileged chown "$(id -un)":"$(id -gn)" /opt/tradingRecordsData/venv
  /usr/bin/python3 -m venv "$VENV_DIR"
fi
"$PIP_BIN" install -U pip -q
"$PIP_BIN" install -r /opt/tradingRecords/backend/requirements.txt -q
cd backend
migrate_upload_dir /opt/tradingRecords/backend/services/data/uploads
migrate_upload_dir /opt/tradingRecords/backend/data/uploads

echo "=== 构建交易前端 ==="
cd ../frontend-trading
npm ci
clean_frontend_dist "$(pwd)"
npm run build

echo "=== 构建笔记前端 ==="
cd ../frontend-notes
npm ci
clean_frontend_dist "$(pwd)"
npm run build

echo "=== 构建监控前端 ==="
cd ../frontend-monitor
npm ci
clean_frontend_dist "$(pwd)"
npm run build

echo "=== 构建记账前端 ==="
cd ../frontend-ledger
npm ci
clean_frontend_dist "$(pwd)"
npm run build

echo "=== 构建自律养成前端 ==="
cd ../frontend-discipline
npm ci
clean_frontend_dist "$(pwd)"
npm run build

echo "=== 同步门户页面 ==="
for src in ../portal/*.html; do
  dst="/opt/tradingRecords/portal/$(basename "$src")"
  if [ "$(readlink -f "$src")" = "$(readlink -f "$dst")" ]; then
    continue
  fi
  cp "$src" "$dst"
done

echo "=== 重启服务 ==="
run_privileged cp /opt/tradingRecords/deploy/nginx.conf /etc/nginx/sites-available/trading
run_privileged cp /opt/tradingRecords/deploy/trading.service /etc/systemd/system/
run_privileged cp /opt/tradingRecords/deploy/trading-cert-renew.service /etc/systemd/system/
run_privileged cp /opt/tradingRecords/deploy/trading-cert-renew.timer /etc/systemd/system/
run_privileged ln -sf /etc/nginx/sites-available/trading /etc/nginx/sites-enabled/trading
run_privileged rm -f /etc/nginx/sites-enabled/default
run_privileged nginx -t
run_privileged systemctl daemon-reload
run_privileged systemctl restart nginx
run_privileged systemctl restart trading
run_privileged systemctl enable --now trading-cert-renew.timer

echo "=== 更新完成 ==="
