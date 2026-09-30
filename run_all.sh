#!/usr/bin/env bash
# Reproduce everything from scratch. About 3 minutes on a laptop.
set -euo pipefail

# macOS often has python3 only; a shell alias for `python` is not visible here.
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "No python3 or python interpreter found on PATH." >&2
  exit 1
fi

"$PY" -m generator.generate --n 10000 --seed 141 --out data   # synthetic households + sealed key
"$PY" -W ignore -m pipeline.run                                # label-free discovery
"$PY" -W ignore -m evaluation.evaluate                         # the only step that opens the key
"$PY" -W ignore -m evaluation.export_demo                      # holdout households for the console
"$PY" -m app.build_console                                     # self-contained out/console.html
"$PY" -m pytest -q tests/
