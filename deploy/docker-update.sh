#!/bin/bash
set -euo pipefail

cd /opt/tradingRecords

git pull

docker compose build

docker compose up -d --remove-orphans

docker image prune -f >/dev/null 2>&1 || true

docker compose ps
