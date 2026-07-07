"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * URL-backed tab state. The URL (`?tab=`) is the single source of truth, so
 * returning to this page (browser-back or a direct link) restores the tab.
 */
export function useTabParam<T extends string>(
  defaultTab: T,
  validTabs: readonly T[]
): [T, (t: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("tab");
  const tab = raw && (validTabs as readonly string[]).includes(raw) ? (raw as T) : defaultTab;

  const setTab = useCallback(
    (next: T) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return [tab, setTab];
}
