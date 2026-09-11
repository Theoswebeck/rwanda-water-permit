"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, CheckCircle2, ChevronDown, BookOpen, KeyRound, ShieldCheck, Search, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";

/**
 * Public "Request API access" page for government agencies
 * (design: docs/api-access-DESIGN.md §7.1). Submitting creates a pending
 * api_access_requests row; RWB reviews it in the admin "API Access" tab.
 */

const ENDPOINT_GROUPS = [
  {
    scope: "permits:verify",
    label: "Permit verification",
    endpoints: "GET /api/v1/permits/verify",
    description: "Check one permit number: is it real, active, and until when.",
    icon: ShieldCheck,
  },
  {
    scope: "permits:read",
    label: "Permit records",
    endpoints: "GET /api/v1/permits · GET /api/v1/permits/{number}",
    description: "Search the public permit registry; fetch the full public record of one permit.",
    icon: Search,
  },
  {
    scope: "stats:read",
    label: "Aggregate statistics",
    endpoints: "GET /api/v1/statistics/summary",
    description: "Water Use Dashboard numbers via API: permits by activity, by district, by catchment.",
    icon: BarChart3,
  },
] as const;

const PERIOD_OPTIONS = [
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
  { value: "24", label: "24 months" },
];

export default function ApiAccessPage() {
  const [scopes, setScopes] = useState<string[]>([]);
  const [period, setPeriod] = useState("12");
  const [form, setForm] = useState({
    institution_name: "",
    institution_type: "",
    tin: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    technical_email: "",
    purpose: "",
    static_ip: "",
    website: "", // honeypot — never shown to users
  });
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleScope = (scope: string) =>
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/api-access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          requested_scopes: scopes,
          requested_period_months: Number(period),
          accepted_terms: accepted,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.issues?.join(" · ") ?? json.error ?? "Submission failed. Please try again.");
        return;
      }
      setReference(json.reference_no);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (reference) {
    return (
      <div className="min-h-screen bg-muted/50 py-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="container mx-auto max-w-2xl px-4"
        >
          <Card className="relative overflow-hidden rounded-[2rem] border-none shadow-lg">
            <div className="absolute top-0 left-0 right-0 h-2 bg-[#47d198]" />
            <CardHeader className="pt-10 text-center">
              <span className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#47d198]/15">
                <CheckCircle2 className="h-9 w-9 text-[#47d198]" />
              </span>
              <CardTitle className="text-2xl text-primary">Request submitted</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pb-10 text-center">
              <p className="text-muted-foreground">
                Thank you. The Rwanda Water Resources Board will review your request and contact
                your technical contact by email.
              </p>
              <div className="mx-auto max-w-sm rounded-xl bg-muted p-4">
                <div className="text-xs text-muted-foreground">Your reference number</div>
                <div className="mt-1 font-mono text-lg font-semibold text-primary">{reference}</div>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/api-access/docs">
                  <Button variant="outline" className="rounded-full px-6">
                    <BookOpen className="mr-1 h-4 w-4" /> Read the API documentation
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="ghost" className="rounded-full px-6">Back to portal</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Intro band — hero visual language: water photo under dark overlay */}
      <div className="relative overflow-hidden py-20 text-white md:py-24">
        <div className="absolute inset-0 z-0">
          <Image
            src="/assets/amir-samoh-lzbz9pQaqBI-unsplash.jpg"
            alt="Water surface"
            fill
            style={{ objectFit: "cover" }}
            priority
          />
          <div className="absolute inset-0 bg-black/55" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 z-10 h-2 bg-[#47d198]" />
        <div className="container relative z-10 mx-auto max-w-4xl px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm"
          >
            <KeyRound className="h-3.5 w-3.5" /> FOR GOVERNMENT INSTITUTIONS
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-4 text-3xl font-bold tracking-tight md:text-5xl"
          >
            Water Permit Data API
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-4 max-w-2xl text-lg text-white/90"
          >
            Government agencies can integrate with the Rwanda Water Resources Board permit
            registry: verify permits in real time, search permit records, and consume the same
            aggregate statistics published on the public Water Use Dashboard. Access is granted
            per institution for a fixed period after review.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
          >
            <Link
              href="/api-access/docs"
              className="mt-6 inline-flex items-center text-sm font-medium text-white underline underline-offset-4 hover:text-white/80"
            >
              <BookOpen className="mr-1.5 h-4 w-4" /> Read the API documentation
            </Link>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-14">
        {/* Endpoint catalogue */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-sm font-medium text-primary">AVAILABLE ENDPOINT GROUPS</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Select the groups you need on the form below — only the groups you request can be granted.
          </p>
        </motion.div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {ENDPOINT_GROUPS.map((g, i) => (
            <motion.div
              key={g.scope}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <Card className="h-full rounded-xl border-none shadow-lg transition-shadow hover:shadow-xl">
                <CardContent className="pt-6">
                  <div className="mb-4 text-primary">
                    <g.icon className="h-7 w-7" />
                  </div>
                  <div className="font-semibold text-primary">{g.label}</div>
                  <code className="mt-1 block break-all text-xs text-muted-foreground">{g.endpoints}</code>
                  <p className="mt-3 text-sm text-muted-foreground">{g.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Request form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
        <Card className="relative mt-12 overflow-hidden rounded-[2rem] border-none shadow-lg">
          <div className="absolute top-0 left-0 right-0 h-2 bg-[#47d198]" />
          <CardHeader className="pt-8">
            <CardTitle className="text-xl text-primary">Request API access</CardTitle>
          </CardHeader>
          <CardContent className="pb-8">
            <form onSubmit={submit} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Institution name *</Label>
                  <Input required value={form.institution_name} onChange={set("institution_name")} placeholder="e.g. Rwanda Land Management and Use Authority" />
                </div>
                <div className="space-y-1.5">
                  <Label>Institution type *</Label>
                  <Select required value={form.institution_type} onValueChange={(v) => setForm((f) => ({ ...f, institution_type: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ministry">Ministry</SelectItem>
                      <SelectItem value="district">District</SelectItem>
                      <SelectItem value="agency">Government agency / authority</SelectItem>
                      <SelectItem value="parastatal">Parastatal / public company</SelectItem>
                      <SelectItem value="other">Other public institution</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>TIN (optional)</Label>
                  <Input value={form.tin} onChange={set("tin")} placeholder="Institution TIN" />
                </div>
                <div className="space-y-1.5">
                  <Label>Declared static IP (optional)</Label>
                  <Input value={form.static_ip} onChange={set("static_ip")} placeholder="Egress IP of your systems, if fixed" />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact person *</Label>
                  <Input required value={form.contact_name} onChange={set("contact_name")} placeholder="Full name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Official email *</Label>
                  <Input required type="email" value={form.contact_email} onChange={set("contact_email")} placeholder="name@institution.gov.rw" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone (optional)</Label>
                  <Input value={form.contact_phone} onChange={set("contact_phone")} placeholder="+250…" />
                </div>
                <div className="space-y-1.5">
                  <Label>Technical contact email *</Label>
                  <Input required type="email" value={form.technical_email} onChange={set("technical_email")} placeholder="Who manages the integration" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Intended use *</Label>
                <Textarea
                  required
                  minLength={20}
                  rows={4}
                  value={form.purpose}
                  onChange={set("purpose")}
                  placeholder="Describe what your systems will do with the data (e.g. verify water permits during licensing)…"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Endpoint groups requested * (select at least one)</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal">
                      <span className={scopes.length ? "" : "text-slate-400"}>
                        {scopes.length
                          ? scopes.map((s) => ENDPOINT_GROUPS.find((g) => g.scope === s)?.label).join(", ")
                          : "Select endpoint groups…"}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[26rem]">
                    {ENDPOINT_GROUPS.map((g) => (
                      <DropdownMenuCheckboxItem
                        key={g.scope}
                        checked={scopes.includes(g.scope)}
                        onCheckedChange={() => toggleScope(g.scope)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        <span>
                          <span className="font-medium">{g.label}</span>
                          <span className="block font-mono text-xs text-slate-500">{g.endpoints}</span>
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-1.5">
                <Label>Requested access period *</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  RWB confirms the actual period when granting; keys stop working when the period ends and can be renewed.
                </p>
              </div>

              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={accepted} onCheckedChange={(c) => setAccepted(c === true)} className="mt-0.5" />
                <span className="text-slate-600">
                  I confirm this request is made on behalf of a government institution and accept
                  the data-use terms: permit data is used only for the stated institutional
                  purpose, in line with Rwanda&apos;s Law №058/2021 on the protection of personal
                  data and privacy.
                </span>
              </label>

              {/* Honeypot — hidden from real users */}
              <input
                type="text"
                name="website"
                value={form.website}
                onChange={set("website")}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={submitting || scopes.length === 0 || !accepted}
                className="h-12 w-full rounded-full px-8 font-medium md:w-auto"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit request
              </Button>
            </form>
          </CardContent>
        </Card>
        </motion.div>
      </div>
    </div>
  );
}
