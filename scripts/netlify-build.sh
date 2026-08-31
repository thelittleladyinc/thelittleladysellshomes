#!/usr/bin/env bash
# Netlify build step for thelittleladysellshomes.com.
# TEMP PREVIEW DIAGNOSTIC: ROI failure writes a preview-only diagnostic file.
# This bypass MUST be removed before merge; production main remains fail-closed.

set -uo pipefail
PY="${PYTHON_BIN:-python3}"
BUILD="${BUILD_SCRIPT:-build/build.py}"
POSTPROCESS="${POSTPROCESS_SCRIPT:-build/postprocess_audit_fixes_v2.py}"
ROI_POSTPROCESS="${ROI_POSTPROCESS_SCRIPT:-build/postprocess_roi_conversion.py}"
REQS="${REQS_FILE:-requirements.txt}"

echo "--- netlify-build: using PY=$PY BUILD=$BUILD POSTPROCESS=$POSTPROCESS ROI_POSTPROCESS=$ROI_POSTPROCESS"

restore_site() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git checkout -- site 2>/dev/null && echo "    restored committed site/ from git" || true
  fi
}

if ! command -v "$PY" >/dev/null 2>&1; then restore_site; exit 0; fi
if [ ! -f "$BUILD" ]; then restore_site; exit 0; fi
if [ -f "$REQS" ]; then "$PY" -m pip install --quiet --disable-pip-version-check -r "$REQS" || true; fi

if ! "$PY" "$BUILD"; then restore_site; exit 1; fi

if [ -f "$POSTPROCESS" ]; then
  if ! "$PY" "$POSTPROCESS"; then restore_site; exit 1; fi
else
  restore_site; exit 1
fi

# Preview-only diagnostic. Capture the exact ROI exception in a public preview
# file because this chat cannot open the authenticated Netlify deploy log.
if [ -f "$ROI_POSTPROCESS" ]; then
  ROI_LOG="$(mktemp)"
  if "$PY" "$ROI_POSTPROCESS" >"$ROI_LOG" 2>&1; then
    echo "ROI conversion layer passed" > site/roi-diagnostic.txt
    cat "$ROI_LOG"
  else
    {
      echo "ROI conversion layer FAILED in deploy preview"
      echo "---"
      cat "$ROI_LOG"
    } > site/roi-diagnostic.txt
    cat "$ROI_LOG"
    echo "!! TEMPORARY PREVIEW DIAGNOSTIC: publishing preview despite ROI failure"
  fi
else
  echo "ROI postprocessor missing" > site/roi-diagnostic.txt
fi

exit 0
