/**
 * Next.js instrumentation — runs once when the dev server boots.
 *
 * The sandbox auto-starts `next dev` after every reset; this hook checks the
 * World Monitor stack (:3002) and, when the reset wiped it, spawns the
 * detached recovery so the site heals itself without anyone in the loop.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { triggerWmRestore } = await import("./lib/wm-selfheal");
    const result = await triggerWmRestore("instrumentation-boot");
    console.log(`[wm-instrumentation] stack check: ${result.status}`);
  } catch (error) {
    console.warn("[wm-instrumentation] selfheal check failed:", error);
  }
}
