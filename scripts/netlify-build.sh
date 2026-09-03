#!/usr/bin/env bash
#
# Netlify build step for thelittleladysellshomes.com.
#
# 2026-08-15: Netlify regenerates the site on each deploy instead of only
# publishing committed generated HTML.
#
# 2026-08-31: technical/SEO, ROI/conversion, and final traffic-growth output
# gates run in sequence. Any missing runtime/build/gate or any gate failure is a
# hard failure so Netlify keeps the last known-good atomic deploy.

set -uo pipefail   # NOT -e: failures are handled explicitly below.

PY="${PYTHON_BIN:-python3}"
BUILD="${BUILD_SCRIPT:-build/build.py}"
POSTPROCESS="${POSTPROCESS_SCRIPT:-build/postprocess_audit_fixes_v2.py}"
ROI_POSTPROCESS="${ROI_POSTPROCESS_SCRIPT:-build/postprocess_roi_conversion_v2.py}"
TRAFFIC_POSTPROCESS="${TRAFFIC_POSTPROCESS_SCRIPT:-build/postprocess_traffic_growth_v2.py}"
REQS="${REQS_FILE:-requirements.txt}"

echo "--- netlify-build: using PY=$PY BUILD=$BUILD POSTPROCESS=$POSTPROCESS ROI_POSTPROCESS=$ROI_POSTPROCESS TRAFFIC_POSTPROCESS=$TRAFFIC_POSTPROCESS"

# Restore site/ from git after a failed generation attempt. Netlify will not
# publish it because the script exits non-zero; this simply leaves the checkout
# clean and makes local failure behavior predictable.
restore_site() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git checkout -- site 2>/dev/null \
      && echo "    restored committed site/ from git" \
      || echo "    could not restore site/ from git"
  else
    echo "    not a git work tree"
  fi
}

# 1. The runtime/build must exist. Never publish an older committed fallback
# merely because the production correction/validation layers could not run.
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "!! netlify-build: '$PY' not found. Refusing to publish without production gates."
  restore_site
  exit 1
fi

if [ ! -f "$BUILD" ]; then
  echo "!! netlify-build: $BUILD not found. Refusing to publish."
  restore_site
  exit 1
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

# 5. Final traffic-growth/consolidation guardrail. The v2 wrapper runs the base
# engine and then covers the smaller community-market wording variants.
if [ -f "$TRAFFIC_POSTPROCESS" ]; then
  echo "--- netlify-build: applying traffic-growth gate"
  if ! "$PY" "$TRAFFIC_POSTPROCESS"; then
    echo "!! netlify-build: $TRAFFIC_POSTPROCESS FAILED."
    echo "!! Refusing to publish output with duplicate winners, stale local claims, or traffic regressions."
    restore_site
    exit 1
  fi
  echo "--- netlify-build: traffic-growth gate OK"
else
  echo "!! netlify-build: $TRAFFIC_POSTPROCESS is missing."
  restore_site
  exit 1
fi

echo "--- netlify-build: generator + audit + ROI + traffic gates OK, publishing freshly generated site/"
exit 0
