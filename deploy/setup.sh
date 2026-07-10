#!/bin/bash
set -e

echo "=== 1. 系统依赖 ==="
apt update && apt install -y python3 python3-pip nginx nodejs npm certbot python3-certbot-nginx

echo "=== 2. 拉取代码 ==="
cd /opt
git clone https://github.com/xiaoyaoqishi/tradingRecords.git
cd tradingRecords

echo "=== 3. 后端 ==="
VENV_DIR="/opt/tradingRecordsData/venv"
/usr/bin/python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install -U pip
"$VENV_DIR/bin/pip" install -r /opt/tradingRecords/backend/requirements.txt

cd backend
mkdir -p data
mkdir -p /opt/tradingRecordsData/uploads /opt/tradingRecordsData/venv
if [ -d /opt/tradingRecords/backend/services/data/uploads ]; then
  cp -an /opt/tradingRecords/backend/services/data/uploads/. /opt/tradingRecordsData/uploads/
fi
if [ -d /opt/tradingRecords/backend/data/uploads ]; then
  cp -an /opt/tradingRecords/backend/data/uploads/. /opt/tradingRecordsData/uploads/
fi

echo "=== 4. 前端构建 ==="
cd ../frontend-trading
npm ci
npm run build

cd ../frontend-notes
npm ci
npm run build

cd ../frontend-monitor
npm ci
npm run build

cd ../frontend-ledger
npm ci
npm run build

echo "=== 5. 配置 Nginx ==="
cp ../deploy/nginx.conf /etc/nginx/sites-available/trading
ln -sf /etc/nginx/sites-available/trading /etc/nginx/sites-enabled/trading
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo "=== 6. 配置后端服务 ==="
cp ../deploy/trading.service /etc/systemd/system/
cp ../deploy/trading-cert-renew.service /etc/systemd/system/
cp ../deploy/trading-cert-renew.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable trading
systemctl enable --now trading-cert-renew.timer
systemctl start trading

echo "=== 部署完成 ==="
echo "访问 http://$(curl -s ifconfig.me)"
