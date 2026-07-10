#!/bin/bash
set -euo pipefail

echo "Docker 更新入口已停用。"
echo "当前生产环境改为项目直接部署到服务器："
echo "  - 首次部署: bash deploy/setup.sh"
echo "  - 常规更新: bash deploy/update.sh"
exit 1
