#!/usr/bin/env bash
cd "$(dirname "$0")"
PORT=8770
[ -x ".venv/bin/python" ] || { [ -d .venv ] && rm -rf .venv; python3 -m venv .venv || { echo "Install Python 3.12+"; exit 1; }; }
PY="./.venv/bin/python"
mkdir -p data
if ! cmp -s requirements.txt data/.req.stamp; then
  "$PY" -m pip install --no-cache-dir -r requirements.txt || { echo "pip failed"; exit 1; }
  cp requirements.txt data/.req.stamp
fi
[ -f data/inventory.db ] || "$PY" -m scripts.import_excel --dir source
[ -f .env ] || cp .env.example .env
echo "Open http://localhost:$PORT  (Ctrl+C to stop)"
"$PY" -m uvicorn app.main:app --host 0.0.0.0 --port $PORT
