"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type PermitQrPreviewClientProps = {
  html: string;
};

export function PermitQrPreviewClient({ html }: PermitQrPreviewClientProps) {
  const [showHtml, setShowHtml] = useState(false);

  const iframeStyle = useMemo(() => {
    return { width: "100%", height: "calc(100vh - 240px)", border: "0", borderRadius: "12px" } as const;
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(html);
    } catch {
      // no-op; clipboard can fail depending on browser permissions
    }
  }, [html]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowHtml((v) => !v)} variant="outline">
          {showHtml ? "Hide HTML" : "Show HTML"}
        </Button>
        <Button onClick={handleCopy} variant="default">
          Copy HTML
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permit Preview (HTML)</CardTitle>
          <CardDescription>
            This is a standalone preview. The QR at the bottom should scan to a “view permit” URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border bg-white">
            <iframe title="Permit preview" style={iframeStyle} srcDoc={html} />
          </div>
        </CardContent>
      </Card>

      {showHtml ? (
        <Card>
          <CardHeader>
            <CardTitle>Raw HTML</CardTitle>
            <CardDescription>Useful if you want to paste it into an external HTML viewer.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={html} readOnly className="min-h-[280px] font-mono text-xs" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}



