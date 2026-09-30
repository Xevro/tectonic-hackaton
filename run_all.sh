#!/usr/bin/env bash
# Reproduce everything from scratch. About 3 minutes on a laptop.
set -euo pipefail
python -m generator.generate --n 10000 --seed 141 --out data   # synthetic households + sealed key
python -W ignore -m pipeline.run                                # label-free discovery
python -W ignore -m evaluation.evaluate                         # the only step that opens the key
python -W ignore -m evaluation.export_demo                      # holdout households for the console
python -m app.build_console                                     # self-contained out/console.html
python -m pytest -q tests/
