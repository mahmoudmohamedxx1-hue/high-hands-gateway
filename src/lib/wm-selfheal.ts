/**
 * WM stack self-healing.
 *
 * The sandbox periodically resets and wipes /home/z/worldmonitor (the Vite
 * preview :3002 + dev :3001 servers), while this Next.js gateway survives and
 * keeps auto-starting. Until the app stack is rebuilt the user sees a 502/503.
 *
 * This module detects a dead app stack and spawns the detached recovery
 * script (wm-recovery/restore.sh) which either:
 *   - FAST PATH  (~10s): app + dist intact, only servers dead → restart them
 *   - FULL PATH  (~5min): repo wiped → clone → patch → npm ci → build → start
 *
 * Re-triggering is guarded by ACTUAL restore-process liveness (pgrep), so a
 * stack that dies again right after a completed heal is re-healed
 * immediately instead of waiting out a fixed cooldown window.
 */

import { spawn, execFile } from "node:child_process";
import { writeFileSync, openSync, writeSync, closeSync } from "node:fs";

const RESTORE_SCRIPT = "/home/z/my-project/wm-recovery/restore.sh";
const LOCK_FILE = "/tmp/wm-restore.lock";
const STATIC_URL = "http://localhost:3002";
const DEV_URL = "http://localhost:3001";
const SPAWN_DEBOUNCE_MS = 45_000; // covers the spawn→pgrep visibility race

let lastTriggerAt = 0;

async function portUp(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Is the app stack serving? Both the bundle (:3002) and API (:3001). */
export async function wmStackHealthy(): Promise<boolean> {
  const [previewUp, devUp] = await Promise.all([portUp(STATIC_URL), portUp(DEV_URL)]);
  return previewUp && devUp;
}

/** Is a restore.sh process actually alive right now? */
function restoreAlive(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("pgrep", ["-f", "wm-recovery/restore.sh"], (error, stdout) => {
      resolve(!error && stdout.trim().length > 0);
    });
  });
}

export interface HealResult {
  triggered: boolean;
  status: "healthy" | "spawned" | "already-running" | "unavailable";
}

/**
 * Fire-and-forget: check health and spawn the detached restore when needed.
 * Never throws — callers treat healing as best-effort.
 */
export async function triggerWmRestore(reason: string): Promise<HealResult> {
  try {
    if (await wmStackHealthy()) return { triggered: false, status: "healthy" };

    const now = Date.now();
    // Debounce request bursts while the spawn becomes pgrep-visible.
    if (now - lastTriggerAt < SPAWN_DEBOUNCE_MS) {
      return { triggered: false, status: "already-running" };
    }
    // A live restore process owns the recovery — do not double-spawn.
    if (await restoreAlive()) {
      lastTriggerAt = now;
      return { triggered: false, status: "already-running" };
    }

    lastTriggerAt = now;
    writeFileSync(LOCK_FILE, `${now}\n${reason}\n`);

    // Log the healer's restore output so autonomous recoveries are
    // diagnosable after the fact (stdio:"ignore" made them invisible,
    // which hid OOM-killed npm ci runs and wiped-mid-build cascades).
    const healLog = openSync("/tmp/wm-restore-heal.log", "a");
    const stamp = new Date().toISOString();
    writeSync(healLog, `\n===== [wm-selfheal] ${stamp} reason: ${reason} =====\n`);
    const child = spawn("bash", [RESTORE_SCRIPT], {
      detached: true,
      stdio: ["ignore", healLog, healLog],
      cwd: "/home/z/my-project",
    });
    child.unref();
    child.on("close", (code) => {
      try {
        writeSync(healLog, `===== [wm-selfheal] restore exited code=${code} =====\n`);
        closeSync(healLog);
      } catch {
        /* fd may already be closed */
      }
    });

    console.log(`[wm-selfheal] restore spawned (reason: ${reason})`);
    return { triggered: true, status: "spawned" };
  } catch (error) {
    console.warn("[wm-selfheal] trigger failed:", error);
    return { triggered: false, status: "unavailable" };
  }
}
