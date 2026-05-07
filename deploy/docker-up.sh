#!/bin/bash
set -euo pipefail

cd /opt/tradingRecords

git pull

docker compose build --pull

docker compose up -d

docker compose ps
