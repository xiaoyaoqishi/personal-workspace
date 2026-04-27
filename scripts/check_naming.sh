#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  echo "[check_naming] missing command: rg"
  echo "[check_naming] install ripgrep first."
  exit 2
fi

declare -a PATTERNS=(
  "frontend/dist"
  "cd frontend"
  "trading-record-frontend"
  "notes-frontend"
  "server-monitor"
)

status=0

for pattern in "${PATTERNS[@]}"; do
  echo "[check_naming] scanning: ${pattern}"
  if [[ "$pattern" == "cd frontend" ]]; then
    matches="$(rg -n \
      --glob '!**/node_modules/**' \
      --glob '!**/dist/**' \
      --glob '!.git/**' \
      --glob '!.dev-run/**' \
      --glob '!**/.vite/**' \
      --glob '!backend/data/**' \
      --glob '!scripts/check_naming.sh' \
      --regexp 'cd frontend($|[[:space:]])' . || true)"
  else
    matches="$(rg -n --fixed-strings \
      --glob '!**/node_modules/**' \
      --glob '!**/dist/**' \
      --glob '!.git/**' \
      --glob '!.dev-run/**' \
      --glob '!**/.vite/**' \
      --glob '!backend/data/**' \
      --glob '!scripts/check_naming.sh' \
      -- "$pattern" . || true)"
  fi
  if [[ -n "$matches" ]]; then
    echo "[check_naming] FAIL: found legacy/prohibited naming"
    echo "$matches"
    status=1
  else
    echo "[check_naming] PASS: not found"
  fi
  echo
done

if [[ "$status" -ne 0 ]]; then
  echo "[check_naming] result: FAILED"
  exit 1
fi

echo "[check_naming] result: PASSED"
