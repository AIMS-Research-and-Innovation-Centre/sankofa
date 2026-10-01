#!/usr/bin/env bash
set -euo pipefail
echo "🔍 Sankofa verification"
python -c "import sankofa; print('  ✅ package', sankofa.__version__)" 2>&1 | head -1
python scripts/smoke_test.py
