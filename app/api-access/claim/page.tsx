"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
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
    <div className="min-h-screen bg-muted/50">
      {/* Intro band — matches the portal's water-photo hero language */}
      <div className="relative overflow-hidden py-16 text-white">
        <div className="absolute inset-0 z-0">
          <Image
            src="/assets/faustin-t-cryqKSeLX74-unsplash.jpg"
            alt="Water surface"
            fill
            style={{ objectFit: "cover" }}
            priority
          />
          <div className="absolute inset-0 bg-black/55" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 z-10 h-2 bg-secondary" />
        <div className="container relative z-10 mx-auto max-w-2xl px-4">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-2xl font-bold tracking-tight md:text-4xl"
          >
            Retrieve your API key
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-2 text-white/90"
          >
            Rwanda Water Resources Board — Water Permit Data API
          </motion.p>
        </div>
      </div>

      <div className="container mx-auto max-w-2xl px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {claimed ? (
            <Card className="relative overflow-hidden rounded-[2rem] border-none shadow-lg">
              <div className="absolute top-0 left-0 right-0 h-2 bg-secondary" />
              <CardHeader className="pt-8">
                <CardTitle className="text-lg text-primary">
                  API key for {claimed.institution_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 pb-8">
                <div className="rounded-xl bg-primary p-4">
                  <code className="block break-all font-mono text-sm text-secondary">
                    {claimed.key}
                  </code>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    className="rounded-full px-6"
                    onClick={() => {
                      void navigator.clipboard.writeText(claimed.key);
                      setCopied(true);
                    }}
                  >
                    {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                    {copied ? "Copied" : "Copy key"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {claimed.reference_no} · valid until {String(claimed.valid_until).slice(0, 10)}
                  </span>
                </div>
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    This is the only time the key is shown — it is not stored and cannot be
                    retrieved again, even by RWB. Save it in your server-side configuration now.
                    If it is lost or leaked, contact RWB for a reissue.
                  </span>
                </div>
                <Link
                  href="/api-access/docs"
                  className="inline-flex items-center text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80"
                >
                  <BookOpen className="mr-1.5 h-4 w-4" /> Read the API documentation
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="relative overflow-hidden rounded-[2rem] border-none shadow-lg">
              <div className="absolute top-0 left-0 right-0 h-2 bg-secondary" />
              <CardContent className="space-y-5 py-12 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <KeyRound className="h-8 w-8 text-primary" />
                </span>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  Your institution&apos;s API access was approved. Press the button below to
                  generate and reveal your API key. The key is shown <strong>once</strong> and
                  this link then stops working — make sure you are ready to store it securely.
                </p>
                {error && (
                  <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <Button
                  size="lg"
                  className="h-12 rounded-full px-8 font-medium"
                  disabled={busy || !token}
                  onClick={() => void reveal()}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Reveal my API key
                </Button>
                {!token && (
                  <p className="text-xs text-muted-foreground">
                    No claim token found — open this page from the link in your approval email.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
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
