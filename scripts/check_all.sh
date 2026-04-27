#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

status=0

resolve_python_cmd() {
  local candidate
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

run_step() {
  local label="$1"
  shift
  echo "[check_all] START: ${label}"
  if "$@"; then
    echo "[check_all] PASS: ${label}"
  else
    local exit_code=$?
    echo "[check_all] FAIL(${exit_code}): ${label}"
    status=1
  fi
  echo
}

require_cmd_or_fail() {
  local cmd="$1"
  local hint="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    return 0
  fi
  echo "[check_all] FAIL: missing command '${cmd}'"
  echo "[check_all] hint: ${hint}"
  status=1
  return 1
}

PYTHON_CMD="$(resolve_python_cmd || true)"
if [[ -z "${PYTHON_CMD}" ]]; then
  echo "[check_all] FAIL: missing python interpreter"
  echo "[check_all] hint: install python3 or python before running checks."
  exit 1
fi

if "$PYTHON_CMD" -m pytest --version >/dev/null 2>&1; then
  run_step "pytest -q backend/tests" bash -lc "cd '$ROOT_DIR/backend' && '$PYTHON_CMD' -m pytest -q tests"
else
  echo "[check_all] FAIL: pytest is not available for ${PYTHON_CMD}"
  echo "[check_all] hint: install backend test dependencies, for example 'cd backend && ${PYTHON_CMD} -m pip install -r requirements.txt pytest'."
  echo
  status=1
fi

if require_cmd_or_fail "npm" "install Node.js and npm first."; then
  for app in frontend frontend-notes frontend-monitor frontend-ledger; do
    if [[ ! -f "${ROOT_DIR}/${app}/package.json" ]]; then
      echo "[check_all] FAIL: missing package.json in ${app}"
      status=1
      echo
      continue
    fi
    if [[ ! -d "${ROOT_DIR}/${app}/node_modules" ]]; then
      echo "[check_all] FAIL: dependencies not installed in ${app}"
      echo "[check_all] hint: run 'cd ${app} && npm install' first."
      status=1
      echo
      continue
    fi
    run_step "npm run build (${app})" bash -lc "cd '$ROOT_DIR/${app}' && npm run build"
  done
fi

run_step "bash scripts/check_naming.sh" bash scripts/check_naming.sh
run_step "bash scripts/check_deploy.sh" bash scripts/check_deploy.sh
run_step "python scripts/check_runtime_size.py" "$PYTHON_CMD" scripts/check_runtime_size.py

if [[ "$status" -ne 0 ]]; then
  echo "[check_all] result: FAILED"
  exit 1
fi

echo "[check_all] result: PASSED"
