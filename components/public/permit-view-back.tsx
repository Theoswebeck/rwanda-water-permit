"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { safeInternalPath } from "@/lib/safe-internal-path";

/**
 * Back control for the public permit verification page.
 *
 * The page is public (QR scans, anonymous verification), so we only show a Back
 * button when the visit clearly originated inside the app:
 *  - an explicit `?back=` internal target threaded by a staff list, or
 *  - a same-origin `document.referrer` (staff navigated here from any portal page).
 * External / direct / QR visits render nothing and use the page's "Back to portal"
 * link instead. Rendering nothing on the server and on the first client render
 * keeps hydration stable (the decision is made in an effect, client-only).
 */
export function PermitViewBack() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const back = safeInternalPath(new URLSearchParams(window.location.search).get("back"));
    if (back) {
      setTarget(back);
      setVisible(true);
      return;
    }
    try {
      const ref = document.referrer;
      if (ref && new URL(ref).origin === window.location.origin) setVisible(true);
    } catch {
      // ignore a malformed referrer
    }
  }, []);

  if (!visible) return null;

  const handleBack = () => {
    if (target) {
      router.push(target);
    } else if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <div className="mx-auto mb-4 max-w-4xl">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
    </div>
  );
}
