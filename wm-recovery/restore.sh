#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# HIGH-HANDS (World Monitor) sandbox RESET RECOVERY — self-healing edition v2
# ---------------------------------------------------------------------------
# The sandbox periodically resets and wipes /home/z/worldmonitor (the cloned
# repo + its two vite servers on :3001/:3002), while /home/z/my-project
# (Next gateway + sandbox API layer) survives and keeps auto-starting.
#
# Triggered automatically by:
#   - src/instrumentation.ts (on Next server boot)
#   - src/proxy.ts (throttled, when an upstream fetch fails)
# Both go through src/lib/wm-selfheal.ts (lockfile-guarded, detached).
#
# Recovery paths:
#   FAST  (~10 s): branded dist/ + start-prod.sh intact, only servers dead
#                  → restart servers only.
#   FULL  (~5 min): PRIMARY  — clone the private HIGH-HANDS GitHub repo
#                             (token from /home/z/my-project/.env, key
#                             WM_GITHUB_TOKEN) — single source of truth,
#                             complete tree, no patching.
#                   FALLBACK — clone upstream koala73/worldmonitor, pin the
#                             FULL SHA patch base, apply the patch bundle.
#                   Either way: npm ci → vite build → VERIFY the bundle is
#                   branded HIGH-HANDS (never ship vanilla by accident) →
#                   start servers.
#
# Usage: bash /home/z/my-project/wm-recovery/restore.sh
# ---------------------------------------------------------------------------
set -euo pipefail

RECOVERY_DIR="$(cd "$(dirname "$0")" && pwd)"
WM_DIR=/home/z/worldmonitor
LOCK_DIR=/tmp/wm-restore.lockdir
ENV_FILE=/home/z/my-project/.env
HH_REPO="mahmoudmohamedxx1-hue/high-hands"
# FULL 40-char SHA — GitHub rejects fetches of abbreviated SHAs, which is
# exactly what silently broke restores once upstream drifted past the
# depth-50 clone window (the "vanilla rebuild" incident).
BASE_SHA="6dc2b6324aefc28a38f0b9477cbfe034fc235ba8"

log() { echo "[restore $(date +%H:%M:%S)] $*"; }

# ── atomic mutex: only one restore at a time ────────────────────────────
# mkdir is atomic — whoever creates the dir owns the recovery. A stale dir
# (crashed restore) older than 10 min is reclaimed.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  lock_age=$(( $(date +%s) - $(stat -c %Y "$LOCK_DIR" 2>/dev/null || date +%s) ))
  if [ "$lock_age" -lt 600 ]; then
    log "another restore is running (lock age ${lock_age}s) — exiting"
    exit 0
  fi
  log "reclaiming stale lock (age ${lock_age}s)"
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" 2>/dev/null || { log "cannot reclaim lock — exiting"; exit 0; }
fi
# Always release the lock, even on failure paths.
trap 'rm -rf "$LOCK_DIR" 2>/dev/null || true' EXIT

# ── manual-build guard: never fight a human-driven rebuild ────────────────
# While an operator rebuilds dist/ by hand (vite build wipes dist/ at the
# start), the fast-path check below would see a missing dist/index.html and
# the FULL path would wipe the operator's patched tree. Skip instead.
if [ -f /tmp/wm-build-in-progress ]; then
  flag_age=$(( $(date +%s) - $(stat -c %Y /tmp/wm-build-in-progress) ))
  if [ "$flag_age" -lt 900 ]; then
    log "manual build in progress (flag age ${flag_age}s) — skipping heal"
    exit 0
  fi
  log "stale build flag (age ${flag_age}s) — ignoring"
  rm -f /tmp/wm-build-in-progress
fi

branded_dist() {  # dist bundle carries the HIGH-HANDS brand?
  local f="$WM_DIR/dist/dashboard.html"
  [ -f "$f" ] || f="$WM_DIR/dist/index.html"
  [ -f "$f" ] && grep -q "HIGH-HANDS" "$f"
}

# ── FAST PATH: branded build intact, only the servers are down ────────────
if { [ -f "$WM_DIR/dist/dashboard.html" ] || [ -f "$WM_DIR/dist/index.html" ]; } \
   && [ -f "$WM_DIR/start-prod.sh" ]; then
  if branded_dist; then
    if curl -sf -o /dev/null --max-time 4 http://localhost:3002/; then
      log "stack already healthy — nothing to do"
      exit 0
    fi
    log "FAST PATH: branded app intact, restarting servers only"
    if bash "$WM_DIR/start-prod.sh" >/tmp/wm-restart.log 2>&1; then
      log "servers restarted (see /tmp/wm-restart.log)"
      exit 0
    fi
    log "fast path failed — falling through to full restore"
  else
    log "dist/ exists but is NOT branded HIGH-HANDS (stale/vanilla) — full restore"
  fi
fi

# ── FULL PATH ──────────────────────────────────────────────────────────────

# Optional GitHub token for cloning the private HIGH-HANDS repo.
GH_TOKEN=""
if [ -f "$ENV_FILE" ]; then
  GH_TOKEN=$(grep -m1 '^WM_GITHUB_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
  GH_TOKEN=${GH_TOKEN//\"/}   # strip double quotes
  GH_TOKEN=${GH_TOKEN//\'/}   # strip single quotes
  GH_TOKEN=$(echo "$GH_TOKEN" | tr -d '[:space:]')
fi

CLONED_HH=0
if [ -n "$GH_TOKEN" ]; then
  log "FULL PATH: clone HIGH-HANDS repo (primary source of truth)"
  for attempt in 1 2 3; do
    rm -rf "$WM_DIR"
    # stderr (which embeds the tokened URL on failure) stays in /tmp only.
    if timeout 150 git clone --quiet --depth 1 \
        "https://${GH_TOKEN}@github.com/${HH_REPO}.git" "$WM_DIR" \
        >/tmp/wm-clone.log 2>&1; then
      break
    fi
    log "HH repo clone attempt $attempt failed — retrying in 10s"
    sleep 10
  done
  # Marker = fork-only files (vanilla upstream has none of these). Checking
  # the HEAD commit subject would break on any later non-branded commit.
  if [ -d "$WM_DIR/.git" ] && [ -f "$WM_DIR/src/services/sandbox-pro.ts" ] \
     && [ -f "$WM_DIR/public/textures/earth-night.jpg" ]; then
    CLONED_HH=1
    log "HIGH-HANDS repo cloned — complete tree, no patching needed"
  else
    log "HH repo unavailable (see /tmp/wm-clone.log) — falling back to upstream+patch"
    rm -rf "$WM_DIR"
  fi
else
  log "FULL PATH: no WM_GITHUB_TOKEN in $ENV_FILE — using upstream+patch bundle"
fi

if [ "$CLONED_HH" != "1" ]; then
  # ── FALLBACK: upstream clone + patch bundle ────────────────────────────
  log "FULL PATH: fresh upstream clone"
  for attempt in 1 2 3; do
    rm -rf "$WM_DIR"
    # timeout guard: the clone occasionally stalls forever on this network
    # (observed 3x) — kill and retry instead of hanging the whole restore.
    if timeout 150 git clone --quiet --depth 50 \
        https://github.com/koala73/worldmonitor.git "$WM_DIR"; then
      break
    fi
    log "clone attempt $attempt failed/stalled — retrying in 10s"
    sleep 10
  done
  [ -d "$WM_DIR/.git" ] || { log "clone failed 3x — aborting"; exit 1; }

  # Pin to the exact FULL SHA the patch bundle was generated against.
  # (Upstream drift past the clone window makes cat-file fail; the fetch
  #  below needs the full 40-char SHA — abbreviated SHAs are rejected.)
  if ! git -C "$WM_DIR" cat-file -e "$BASE_SHA^{commit}" 2>/dev/null; then
    for attempt in 1 2 3; do
      if timeout 120 git -C "$WM_DIR" fetch --quiet --depth 1 origin "$BASE_SHA"; then
        break
      fi
      log "base-commit fetch attempt $attempt failed — retrying in 10s"
      sleep 10
    done
  fi
  if git -C "$WM_DIR" cat-file -e "$BASE_SHA^{commit}" 2>/dev/null; then
    git -C "$WM_DIR" checkout --quiet "$BASE_SHA"
    log "pinned to patch base $BASE_SHA"
  else
    log "FATAL: patch base unavailable — refusing to build (would be vanilla)"
    exit 1
  fi

  log "apply self-host patches"
  cd "$WM_DIR"
  # a) tracked-file changes (premium unlock, layer grouping, live HLS proxy,
  #    map size presets, PRO/footer/auth removal, 3D globe textures,
  #    HIGH-HANDS rebrand incl. HH Analyst, brotli OOM guard).
  # HARD FAIL on patch mismatch: a partially/incorrectly patched tree would
  # build a VANILLA World Monitor — that silently happened once and must
  # never happen again.
  if ! git apply --binary --exclude='start-prod.sh' "$RECOVERY_DIR/worldmonitor.patch"; then
    log "FATAL: patch did not apply cleanly on $BASE_SHA — aborting (never build vanilla)"
    exit 1
  fi
  # b) new files (redundant safety copies of what the patch carries)
  mkdir -p src/services public/textures
  cp "$RECOVERY_DIR/patches/sandbox-pro.ts" src/services/sandbox-pro.ts
  cp "$RECOVERY_DIR/patches/start-prod.sh" start-prod.sh
  chmod +x start-prod.sh
  cp "$RECOVERY_DIR/patches/textures/earth-night.jpg" public/textures/earth-night.jpg
  cp "$RECOVERY_DIR/patches/textures/earth-dark.jpg" public/textures/earth-dark.jpg
fi

# c) gateway webcams catalog backup (self-heal if my-project was touched)
if ! cmp -s "$RECOVERY_DIR/patches/wm-webcams.ts" /home/z/my-project/src/lib/wm-webcams.ts 2>/dev/null; then
  mkdir -p /home/z/my-project/src/lib
  cp "$RECOVERY_DIR/patches/wm-webcams.ts" /home/z/my-project/src/lib/wm-webcams.ts
  log "restored gateway wm-webcams.ts from backup"
fi

log "npm ci (~1 min)"
# RAM guard for the 4 GB sandbox: browser daemons (~0.9 GB) + the gateway
# (~0.5 GB) + npm ci's postinstall peak (~2.3 GB) exceed the budget —
# observed OOM-killed npm ci. Chrome must die before npm ci starts.
pkill -f chrome 2>/dev/null || true
if ! (cd "$WM_DIR" && npm ci --no-audit --no-fund >/tmp/npmci.log 2>&1); then
  log "npm ci failed — retrying once"
  if ! (cd "$WM_DIR" && npm ci --no-audit --no-fund >/tmp/npmci.log 2>&1); then
    log "FATAL: npm ci failed twice — aborting (see /tmp/npmci.log)"
    exit 1
  fi
fi

log "production build (~1–2 min)"
pkill -f chrome 2>/dev/null || true   # RAM guard for the 4 GB sandbox
(cd "$WM_DIR" && NODE_OPTIONS=--max-old-space-size=2000 npx vite build >/tmp/wm-build.log 2>&1) \
  || { log "build failed — see /tmp/wm-build.log"; exit 1; }

# ── NEVER ship vanilla: the bundle must carry the HIGH-HANDS brand ────────
if ! branded_dist; then
  log "FATAL: built bundle is not branded HIGH-HANDS — aborting instead of serving vanilla"
  exit 1
fi
log "bundle verified: HIGH-HANDS branded"

log "start servers (:3001 api + :3002 bundle)"
bash "$WM_DIR/start-prod.sh"

log "recovery complete — HIGH-HANDS is live at / (via the Next gateway)."
log "all features unlocked: every panel, layer, export and AI feature is accessible."
