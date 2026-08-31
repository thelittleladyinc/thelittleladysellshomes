#!/usr/bin/env bash
#
# Netlify build step for thelittleladysellshomes.com.
#
# 2026-08-15: Netlify regenerates the site on each deploy instead of only
# publishing the committed site/ fallback. Environmental failures may still use
# the committed fallback; generator or quality-gate failures stop the deploy so
# a partially generated/regressed site never replaces the last good production
# version.
#
# 2026-08-31: after the SEO/technical audit gate passes, a second narrow ROI gate
# adds lead attribution and conversion paths to proven organic winners. Keeping
# it after the main audit means conversion work cannot quietly undo URL,
# freshness, analytics, or migration protections.

set -uo pipefail   # NOT -e: failures are handled explicitly below.

PY="${PYTHON_BIN:-python3}"
BUILD="${BUILD_SCRIPT:-build/build.py}"
POSTPROCESS="${POSTPROCESS_SCRIPT:-build/postprocess_audit_fixes_v2.py}"
ROI_POSTPROCESS="${ROI_POSTPROCESS_SCRIPT:-build/postprocess_roi_conversion_v2.py}"
REQS="${REQS_FILE:-requirements.txt}"

echo "--- netlify-build: using PY=$PY BUILD=$BUILD POSTPROCESS=$POSTPROCESS ROI_POSTPROCESS=$ROI_POSTPROCESS"

# Restore site/ from git so a partial write can never reach the CDN. Best effort:
# outside a git checkout this is a no-op and the committed files are already the
# fallback we want.
restore_site() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git checkout -- site 2>/dev/null \
      && echo "    restored committed site/ from git" \
      || echo "    could not restore site/ from git"
  else
    echo "    not a git work tree; using committed site/"
  fi
}

# 1. Environment failures fall back to the committed site.
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "!! netlify-build: '$PY' not found. Publishing committed site/ unchanged."
  restore_site
  exit 0
fi

if [ ! -f "$BUILD" ]; then
  echo "!! netlify-build: $BUILD not found. Publishing committed site/."
  restore_site
  exit 0
fi

if [ -f "$REQS" ]; then
  if "$PY" -m pip install --quiet --disable-pip-version-check -r "$REQS"; then
    echo "--- netlify-build: dependencies installed"
  else
    echo "!! netlify-build: pip install failed. Trying with installed dependencies."
  fi
fi

# 2. Generator failures are real defects and stop deployment.
echo "--- netlify-build: regenerating site/ from $BUILD"
if ! "$PY" "$BUILD"; then
  echo "!! netlify-build: $BUILD FAILED."
  echo "!! Restoring committed site/ and keeping the last good production deploy."
  restore_site
  exit 1
fi
echo "--- netlify-build: generator OK"

# 3. Technical/SEO output guardrail.
if [ -f "$POSTPROCESS" ]; then
  echo "--- netlify-build: applying post-build audit gate"
  if ! "$PY" "$POSTPROCESS"; then
    echo "!! netlify-build: $POSTPROCESS FAILED."
    echo "!! Refusing to publish output that violates audit guardrails."
    restore_site
    exit 1
  fi
  echo "--- netlify-build: audit gate OK"
else
  echo "!! netlify-build: $POSTPROCESS is missing."
  restore_site
  exit 1
fi

# 4. ROI/conversion output guardrail.
if [ -f "$ROI_POSTPROCESS" ]; then
  echo "--- netlify-build: applying ROI conversion gate"
  if ! "$PY" "$ROI_POSTPROCESS"; then
    echo "!! netlify-build: $ROI_POSTPROCESS FAILED."
    echo "!! Refusing to publish output with broken attribution or conversion funnels."
    restore_site
    exit 1
  fi
  echo "--- netlify-build: ROI conversion gate OK"
else
  echo "!! netlify-build: $ROI_POSTPROCESS is missing."
  restore_site
  exit 1
fi

echo "--- netlify-build: build + audit + ROI gates OK, publishing freshly generated site/"
exit 0
