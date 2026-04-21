"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "loading" | "ready" | "error";

interface PermitPreviewFrameProps {
  applicationId: string;
  /** Override src if ever needed (defaults to the staff preview endpoint). */
  src?: string;
  /** Height in px; default 900 to match existing tab height. */
  height?: number;
}

export function PermitPreviewFrame({
  applicationId,
  src,
  height = 900,
}: PermitPreviewFrameProps) {
  const url = src ?? `/api/staff/applications/${applicationId}/permit-preview`;
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  // Bumping reloadKey re-runs the effect (cache-safe way to retry).
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    setStatus("loading");
    setErrorMessage(null);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          const ct = res.headers.get("content-type") || "";
          let message = `Request failed (${res.status})`;
          if (ct.includes("application/json")) {
            const body = await res.json().catch(() => null);
            if (body && typeof body.message === "string") message = body.message;
          }
          setErrorMessage(message);
          setStatus("error");
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Network error");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url, reloadKey]);

  return (
    <div
      className="relative rounded-lg border overflow-hidden bg-muted/30"
      style={{ height: `${height}px` }}
    >
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="text-sm text-muted-foreground">Generating permit preview…</p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="rounded-full bg-red-100 p-3">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <p className="font-medium">Could not generate permit preview</p>
            <p className="text-sm text-muted-foreground mt-1">{errorMessage ?? "Unknown error."}</p>
          </div>
          <button
            type="button"
            onClick={retry}
            className="mt-2 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      )}

      {status === "ready" && blobUrl && (
        <iframe
          src={blobUrl}
          className="w-full h-full"
          style={{ border: "none" }}
          title="Permit Preview"
        />
      )}
    </div>
  );
}
