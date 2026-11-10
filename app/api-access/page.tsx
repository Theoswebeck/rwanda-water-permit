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
  Loader2,
  CheckCircle2,
  ChevronRight,
  BookOpen,
  KeyRound,
  ShieldCheck,
  Search,
  BarChart3,
  Copy,
  Check,
  ArrowRight,
  Building2,
  UserCheck,
  Globe2,
} from "lucide-react";
import { motion } from "framer-motion";

/**
 * Public "Request API access" page for government agencies
 * Aligned with the official RWB Enterprise Template.
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
  const [copied, setCopied] = useState(false);

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

  const copyReference = () => {
    if (reference) {
      navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (reference) {
    return (
      <div className="min-h-screen bg-[#f3f5fa] py-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="container mx-auto max-w-2xl px-4"
        >
          <Card className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
            <div className="h-2 w-full bg-[#0072bc]" />
            <CardHeader className="pt-10 text-center">
              <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-10 w-10" />
              </span>
              <CardTitle className="text-2xl font-bold text-gray-900">Request Submitted Successfully</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pb-10 text-center">
              <p className="text-gray-600 leading-relaxed text-sm">
                Thank you for your application. The Rwanda Water Resources Board will review your credentials and contact your designated technical representative via email with claim instructions.
              </p>
              <div className="mx-auto max-w-sm rounded-xl bg-blue-50/60 border border-blue-100 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Your Reference Tracking Number</div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="font-mono text-xl font-bold text-[#0072bc]">{reference}</span>
                  <button
                    type="button"
                    onClick={copyReference}
                    className="p-1.5 rounded-md hover:bg-white text-gray-500 hover:text-[#0072bc] transition-colors"
                    title="Copy reference number"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Link href="/api-access/docs">
                  <Button className="rounded-lg bg-[#0072bc] hover:bg-[#005a96] text-white px-6 font-semibold shadow-sm">
                    <BookOpen className="mr-2 h-4 w-4" /> Explore API Documentation
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" className="rounded-lg border-gray-300 px-6 font-semibold text-gray-700 hover:bg-gray-50">
                    Back to Portal
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f5fa]">
      {/* ── HEADER BANNER (Matching Home's clean white design) ── */}
      <div className="relative overflow-hidden py-14 bg-white text-gray-900 border-b border-gray-100">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-5 font-medium">
            <Link href="/" className="hover:text-[#0072bc] transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-700 font-semibold">Request API Access</span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="max-w-3xl">
              {/* Government Badge */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200/80 px-4 py-1.5 text-xs font-bold tracking-wide text-[#0072bc]"
              >
                <KeyRound className="h-3.5 w-3.5 text-[#0072bc]" />
                <span>FOR GOVERNMENT INSTITUTIONS</span>
              </motion.div>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="mt-4 text-3xl font-extrabold text-gray-900 sm:text-4xl lg:text-5xl tracking-tight"
              >
                Water Permit Data API
              </motion.h1>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mt-4 text-base sm:text-lg text-gray-600 leading-relaxed font-normal"
              >
                Government agencies and public bodies can seamlessly integrate with the Rwanda Water Resources Board permit registry. Verify permits in real time, search public records, and consume authoritative hydrological data through a secure, tokenized API.
              </motion.p>

              {/* Capability Badges matching Home */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="mt-6 flex flex-wrap gap-x-6 gap-y-3"
              >
                {[
                  { icon: <ShieldCheck className="h-5 w-5 text-[#0072bc]" />, label: "Real-time permit verification" },
                  { icon: <Search className="h-5 w-5 text-[#0072bc]" />, label: "Public permit registry search" },
                  { icon: <BarChart3 className="h-5 w-5 text-[#0072bc]" />, label: "Water use statistics" },
                ].map((c) => (
                  <span
                    key={c.label}
                    className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700 bg-gray-50 px-3.5 py-1.5 rounded-lg border border-gray-200/80"
                  >
                    {c.icon}
                    <span>{c.label}</span>
                  </span>
                ))}
              </motion.div>
            </div>

            {/* Action Buttons matching Home */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="flex flex-col sm:flex-row lg:flex-col gap-3.5 shrink-0"
            >
              <a href="#request-form" className="w-full sm:w-auto">
                <button
                  type="button"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-13 px-8 py-3.5 rounded-xl bg-[#0072bc] hover:bg-[#005a96] text-white font-bold text-sm shadow-md hover:shadow-xl hover:scale-105 transition-all cursor-pointer whitespace-nowrap"
                >
                  <KeyRound className="h-4 w-4 text-white" />
                  <span>Jump to Application Form</span>
                </button>
              </a>

              <Link href="/api-access/docs" className="w-full sm:w-auto">
                <button
                  type="button"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-13 px-8 py-3.5 rounded-xl border-2 border-[#0072bc] bg-white text-[#0072bc] hover:bg-blue-50 font-bold text-sm shadow-xs hover:shadow-md transition-all cursor-pointer whitespace-nowrap"
                >
                  <BookOpen className="h-4 w-4 text-[#0072bc]" />
                  <span>API Documentation</span>
                </button>
              </Link>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── CONTENT AREA ── */}
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Endpoint catalogue */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-[#0072bc]">Available Endpoint Groups</span>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">Select the Data Scopes You Require</h2>
            </div>
            <span className="text-xs text-gray-500 hidden sm:inline">Click any card to select/unselect</span>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Access is principle-of-least-privilege: only the endpoint groups you request and substantiate will be activated.
          </p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {ENDPOINT_GROUPS.map((g, i) => {
            const isSelected = scopes.includes(g.scope);
            return (
              <motion.div
                key={g.scope}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                onClick={() => toggleScope(g.scope)}
                className="cursor-pointer"
              >
                <div
                  className={`h-full rounded-2xl bg-white p-6 transition-all duration-200 border-2 ${
                    isSelected
                      ? "border-[#0072bc] shadow-md ring-2 ring-[#0072bc]/20"
                      : "border-transparent shadow-sm hover:shadow-md hover:border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-xl ${isSelected ? "bg-[#0072bc] text-white" : "bg-blue-50 text-[#0072bc]"}`}>
                      <g.icon className="h-6 w-6" />
                    </div>
                    <div className="flex items-center">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleScope(g.scope)}
                        aria-label={`Select ${g.label}`}
                        className="data-[state=checked]:bg-[#0072bc] data-[state=checked]:border-[#0072bc]"
                      />
                    </div>
                  </div>
                  <div className="font-bold text-gray-900 text-base">{g.label}</div>
                  <code className="mt-2 block break-all text-xs font-mono font-medium text-[#0072bc] bg-blue-50/70 px-2 py-1 rounded">
                    {g.endpoints}
                  </code>
                  <p className="mt-3 text-xs leading-relaxed text-gray-600">{g.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Request Form */}
        <motion.div
          id="request-form"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-12"
        >
          <Card className="rounded-2xl border border-gray-100 bg-white shadow-md overflow-hidden">
            <div className="h-1.5 w-full bg-[#0072bc]" />
            <CardHeader className="pt-8 px-6 sm:px-10 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0072bc] flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-xl sm:text-2xl font-bold text-gray-900">
                    Institutional API Access Application
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-gray-500 mt-1">
                    Please provide complete details. Applications from non-government domains are not eligible.
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 sm:p-10">
              <form onSubmit={submit} className="space-y-8">
                {/* Section 1: Institution Info */}
                <div>
                  <h3 className="text-sm font-bold text-[#0072bc] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0072bc] text-xs flex items-center justify-center font-bold">1</span>
                    Institution Information
                  </h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Institution Name *</Label>
                      <Input
                        required
                        value={form.institution_name}
                        onChange={set("institution_name")}
                        placeholder="e.g. Rwanda Land Management and Use Authority"
                        className="rounded-lg border-gray-200 focus:border-[#0072bc] focus:ring-[#0072bc]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Institution Type *</Label>
                      <Select
                        required
                        value={form.institution_type}
                        onValueChange={(v) => setForm((f) => ({ ...f, institution_type: v }))}
                      >
                        <SelectTrigger className="rounded-lg border-gray-200 focus:border-[#0072bc] focus:ring-[#0072bc]">
                          <SelectValue placeholder="Select institution type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ministry">Ministry</SelectItem>
                          <SelectItem value="district">District</SelectItem>
                          <SelectItem value="agency">Government Agency / Authority</SelectItem>
                          <SelectItem value="parastatal">Parastatal / Public Company</SelectItem>
                          <SelectItem value="other">Other Public Institution</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Tax Identification Number (TIN)</Label>
                      <Input
                        value={form.tin}
                        onChange={set("tin")}
                        placeholder="e.g. 1000123456"
                        className="rounded-lg border-gray-200 focus:border-[#0072bc] focus:ring-[#0072bc]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Declared Egress Static IP (Optional)</Label>
                      <Input
                        value={form.static_ip}
                        onChange={set("static_ip")}
                        placeholder="Fixed egress IP of your server, if configured"
                        className="rounded-lg border-gray-200 focus:border-[#0072bc] focus:ring-[#0072bc]"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Contact Persons */}
                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-[#0072bc] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0072bc] text-xs flex items-center justify-center font-bold">2</span>
                    Authorized Contacts
                  </h3>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Institutional Contact Person *</Label>
                      <Input
                        required
                        value={form.contact_name}
                        onChange={set("contact_name")}
                        placeholder="Full Name and Title"
                        className="rounded-lg border-gray-200 focus:border-[#0072bc] focus:ring-[#0072bc]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Official Institutional Email *</Label>
                      <Input
                        required
                        type="email"
                        value={form.contact_email}
                        onChange={set("contact_email")}
                        placeholder="name@institution.gov.rw"
                        className="rounded-lg border-gray-200 focus:border-[#0072bc] focus:ring-[#0072bc]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Phone Number *</Label>
                      <Input
                        required
                        value={form.contact_phone}
                        onChange={set("contact_phone")}
                        placeholder="+250 788 000 000"
                        className="rounded-lg border-gray-200 focus:border-[#0072bc] focus:ring-[#0072bc]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Technical Contact Email (For API Key Claim) *</Label>
                      <Input
                        required
                        type="email"
                        value={form.technical_email}
                        onChange={set("technical_email")}
                        placeholder="developer@institution.gov.rw"
                        className="rounded-lg border-gray-200 focus:border-[#0072bc] focus:ring-[#0072bc]"
                      />
                      <p className="text-[11px] text-gray-500">The one-time secure key claim URL will be sent to this email.</p>
                    </div>
                  </div>
                </div>

                {/* Section 3: Purpose & Validity */}
                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-[#0072bc] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0072bc] text-xs flex items-center justify-center font-bold">3</span>
                    Integration Scope & Purpose
                  </h3>
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Specific Integration Purpose *</Label>
                      <Textarea
                        required
                        rows={3}
                        value={form.purpose}
                        onChange={set("purpose")}
                        placeholder="Describe the institutional software system, workflow, or regulatory function that requires this permit registry data..."
                        className="rounded-lg border-gray-200 focus:border-[#0072bc] focus:ring-[#0072bc] text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-gray-700">Requested Validity Period *</Label>
                      <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger className="w-full md:w-64 rounded-lg border-gray-200 focus:border-[#0072bc] focus:ring-[#0072bc]">
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
                      <p className="text-xs text-gray-500">
                        RWB evaluates the validity term based on statutory needs. Access keys can be extended before expiration.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Selected scopes indicator */}
                <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-4">
                  <div className="text-xs font-semibold text-[#0072bc]">
                    Selected Endpoints ({scopes.length} of {ENDPOINT_GROUPS.length}):
                  </div>
                  {scopes.length === 0 ? (
                    <p className="text-xs text-amber-700 mt-1">
                      ⚠️ Please select at least one endpoint group from the cards above to proceed.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {scopes.map((s) => (
                        <span key={s} className="bg-white border border-blue-200 text-[#0072bc] text-xs font-mono font-semibold px-2.5 py-1 rounded-md">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Compliance Agreement */}
                <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                  <Checkbox
                    checked={accepted}
                    onCheckedChange={(c) => setAccepted(c === true)}
                    className="mt-0.5 data-[state=checked]:bg-[#0072bc] data-[state=checked]:border-[#0072bc]"
                  />
                  <span className="text-xs sm:text-sm text-gray-700 leading-relaxed select-none">
                    I confirm this request is made on behalf of an official government institution. I accept the data-use terms and agree that permit data will only be utilized for the specified institutional purpose in strict compliance with <strong>Rwanda&apos;s Law №058/2021</strong> on the Protection of Personal Data and Privacy.
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
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Questions about integration? Contact <a href="mailto:info@rwb.rw" className="text-[#0072bc] font-semibold underline">info@rwb.rw</a> or Toll Free 9977.
                  </p>
                  <Button
                    type="submit"
                    disabled={submitting || scopes.length === 0 || !accepted}
                    className="w-full sm:w-auto h-12 rounded-xl bg-[#0072bc] hover:bg-[#005a96] text-white px-8 text-sm font-bold shadow-md disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Access Request
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
