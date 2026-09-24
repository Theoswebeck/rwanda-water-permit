"use client";

import { useEffect, useState } from "react";
import { SITE_CONTENT_DEFAULTS, type SiteContent } from "@/lib/site-content";

/**
 * Admin-managed links and contact details for the public chrome.
 * Starts from the defaults so the header and footer render identically on the
 * server and on first paint, then swaps in whatever the admin has published.
 */
export function useSiteContent(): SiteContent {
  const [content, setContent] = useState<SiteContent>(SITE_CONTENT_DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/site-content")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setContent(data);
      })
      .catch(() => {
        // Defaults already rendered; a failed lookup must not blank the chrome.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return content;
}
