#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  echo "[check_naming] missing command: rg"
  echo "[check_naming] install ripgrep first."
  exit 2
fi

scan_fixed() {
  local label="$1"
  local pattern="$2"
  echo "[check_naming] scanning: ${label}"
  local matches
  matches="$(rg -n --fixed-strings \
    --glob '!**/node_modules/**' \
    --glob '!**/dist/**' \
    --glob '!.git/**' \
    --glob '!.dev-run/**' \
    --glob '!**/.vite/**' \
    --glob '!backend/data/**' \
    --glob '!scripts/check_naming.sh' \
    -- "$pattern" . || true)"
  if [[ -n "$matches" ]]; then
    echo "[check_naming] FAIL: found legacy/prohibited naming"
    echo "$matches"
    status=1
  else
    echo "[check_naming] PASS: not found"
  fi
  echo
}

scan_regex() {
  local label="$1"
  local pattern="$2"
  echo "[check_naming] scanning: ${label}"
  local matches
  matches="$(rg -n \
    --glob '!**/node_modules/**' \
    --glob '!**/dist/**' \
    --glob '!.git/**' \
    --glob '!.dev-run/**' \
    --glob '!**/.vite/**' \
    --glob '!backend/data/**' \
    --glob '!scripts/check_naming.sh' \
    --regexp "$pattern" . || true)"
  if [[ -n "$matches" ]]; then
    echo "[check_naming] FAIL: found legacy/prohibited naming"
    echo "$matches"
    status=1
  else
    echo "[check_naming] PASS: not found"
  fi
  echo
}

status=0

scan_fixed "frontend/dist" "frontend/dist"
scan_fixed "/opt/tradingRecords/frontend/dist" "/opt/tradingRecords/frontend/dist"
scan_fixed "frontend/package" "frontend/package"
scan_fixed "trading-record-frontend" "trading-record-frontend"
scan_fixed "notes-frontend" "notes-frontend"
scan_fixed "server-monitor" "server-monitor"
scan_regex "cd frontend" 'cd frontend($|[[:space:]])'
scan_regex "./frontend" '\./frontend($|/)'
scan_regex "../frontend" '\.\./frontend($|/)'

if [[ "$status" -ne 0 ]]; then
  echo "[check_naming] result: FAILED"
  exit 1
fi

echo "[check_naming] result: PASSED"
