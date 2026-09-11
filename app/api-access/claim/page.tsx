"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Copy, Check, Loader2, ShieldAlert, BookOpen } from "lucide-react";

/**
 * One-time API key claim page, reached from the approval email's secure link.
 * The key is generated server-side only when "Reveal" is pressed and is shown
 * exactly once — to the requester, never to RWB staff.
 */

type Claimed = {
  key: string;
  scopes: string[];
  valid_until: string;
  institution_name: string;
  reference_no: string;
};

function ClaimInner() {
  const token = useSearchParams().get("token") ?? "";
  const [claimed, setClaimed] = useState<Claimed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/api-access-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "This claim link is not valid.");
        return;
      }
      setClaimed(json);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-slate-900 py-12 text-white">
        <div className="container mx-auto max-w-2xl px-4">
          <h1 className="text-2xl font-bold md:text-3xl">Retrieve your API key</h1>
          <p className="mt-2 text-slate-300">
            Rwanda Water Resources Board — Water Permit Data API
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-2xl px-4 py-10">
        {claimed ? (
          <Card className="border-green-200">
            <CardHeader>
              <CardTitle className="text-lg">
                API key for {claimed.institution_name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-slate-950 p-4">
                <code className="block break-all font-mono text-sm text-green-400">
                  {claimed.key}
                </code>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => {
                    void navigator.clipboard.writeText(claimed.key);
                    setCopied(true);
                  }}
                >
                  {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                  {copied ? "Copied" : "Copy key"}
                </Button>
                <span className="text-xs text-slate-500">
                  {claimed.reference_no} · valid until {String(claimed.valid_until).slice(0, 10)}
                </span>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  This is the only time the key is shown — it is not stored and cannot be
                  retrieved again, even by RWB. Save it in your server-side configuration now.
                  If it is lost or leaked, contact RWB for a reissue.
                </span>
              </div>
              <Link href="/api-access/docs" className="inline-flex items-center text-sm text-sky-700 underline">
                <BookOpen className="mr-1 h-4 w-4" /> Read the API documentation
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-4 py-8 text-center">
              <KeyRound className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mx-auto max-w-md text-sm text-slate-600">
                Your institution&apos;s API access was approved. Press the button below to
                generate and reveal your API key. The key is shown <strong>once</strong> and
                this link then stops working — make sure you are ready to store it securely.
              </p>
              {error && (
                <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <Button size="lg" disabled={busy || !token} onClick={() => void reveal()}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Reveal my API key
              </Button>
              {!token && (
                <p className="text-xs text-slate-500">
                  No claim token found — open this page from the link in your approval email.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimInner />
    </Suspense>
  );
}
