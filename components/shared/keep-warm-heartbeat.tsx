"use client";

import { useEffect } from "react";

function getIntervalMs(): number {
  const raw = process.env.NEXT_PUBLIC_CLIENT_HEARTBEAT_INTERVAL_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 30_000;
}

function isEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_CLIENT_HEARTBEAT !== "false";
}

/**
 * Client-side heartbeat that keeps the runtime warm while a user has the app open.
 *
 * Important: This intentionally does NOT update `lastActivity` (your auth/session manager
 * uses `lastActivity` to enforce idle timeouts; updating it here would defeat that).
 */
export function KeepWarmHeartbeat() {
  useEffect(() => {
    if (!isEnabled()) return;

    const intervalMs = getIntervalMs();

    const tick = () => {
      // Only ping when the tab is visible (best-effort; reduces unnecessary traffic).
      if (document.visibilityState !== "visible") return;

      fetch("/api/health", { method: "GET", cache: "no-store" }).catch(() => {
        // best-effort keepalive; ignore errors
      });
    };

    tick();
    const id = window.setInterval(tick, intervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}






