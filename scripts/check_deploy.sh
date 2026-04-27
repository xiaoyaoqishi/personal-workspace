#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  echo "[check_deploy] missing command: rg"
  echo "[check_deploy] install ripgrep first."
  exit 2
fi

status=0

check_file_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if rg -q --fixed-strings -- "$pattern" "$file"; then
    echo "[check_deploy] PASS: ${label}"
  else
    echo "[check_deploy] FAIL: ${label}"
    status=1
  fi
}

check_build_dir() {
  local file="$1"
  local app_dir="$2"
  local label="$3"
  if awk -v app_dir="$app_dir" '
    BEGIN {
      in_block = 0
      found_dir = 0
      found_build = 0
    }
    $0 ~ ("^cd " app_dir "$") {
      in_block = 1
      found_dir = 1
      next
    }
    in_block && $0 ~ "^cd " {
      in_block = 0
    }
    in_block && $0 ~ "^npm run build$" {
      found_build = 1
    }
    END {
      exit !(found_dir && found_build)
    }
  ' "$file"; then
    echo "[check_deploy] PASS: ${label}"
  else
    echo "[check_deploy] FAIL: ${label}"
    status=1
  fi
}

check_file_contains "deploy/setup.sh" "frontend-trading" "setup.sh contains frontend-trading"
check_file_contains "deploy/update.sh" "frontend-trading" "update.sh contains frontend-trading"
check_file_contains "deploy/nginx.conf" "frontend-trading" "nginx.conf contains frontend-trading"
check_file_contains "deploy/setup.sh" "frontend-ledger" "setup.sh contains frontend-ledger"
check_file_contains "deploy/update.sh" "frontend-ledger" "update.sh contains frontend-ledger"
check_file_contains "deploy/nginx.conf" "frontend-ledger" "nginx.conf contains frontend-ledger"

for app in frontend-trading frontend-notes frontend-monitor frontend-ledger; do
  check_build_dir "deploy/setup.sh" "../${app}" "setup.sh builds ${app}"
  check_build_dir "deploy/update.sh" "../${app}" "update.sh builds ${app}"
done

check_file_contains "deploy/nginx.conf" "location /ledger/" "nginx serves /ledger/"
check_file_contains "deploy/nginx.conf" "location = /ledger" "nginx defines /ledger redirect location"
check_file_contains "deploy/nginx.conf" "return 301 /ledger/;" "nginx redirects /ledger to /ledger/"

if [[ "$status" -ne 0 ]]; then
  echo "[check_deploy] result: FAILED"
  exit 1
fi

echo "[check_deploy] result: PASSED"
