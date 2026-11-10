"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BookOpen,
  KeyRound,
  Copy,
  Check,
  ChevronRight,
  ShieldCheck,
  Search,
  BarChart3,
  ExternalLink,
  Code2,
  Terminal,
  FileText,
  AlertCircle,
} from "lucide-react";
import { motion } from "framer-motion";

/**
 * Public API Documentation page for government agencies
 * Aligned with the official RWB Enterprise Template.
 */

const BASE = "https://waterpermit.rwb.rw/api/v1";

function CodeSnippet({
  code,
  title = "cURL Request",
}: {
  code: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl overflow-hidden border border-slate-800 bg-[#0f172a] shadow-md my-3">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs">
        <span className="font-mono text-slate-400 flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-blue-400" />
          {title}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors py-0.5 px-2 rounded hover:bg-slate-800"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-semibold text-[11px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto font-mono text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function JsonResponse({
  data,
  title = "Response (200 OK)",
}: {
  data: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-xs my-3">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs">
        <span className="font-mono text-slate-600 flex items-center gap-1.5 font-semibold">
          <FileText className="w-3.5 h-3.5 text-[#0072bc]" />
          {title}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 text-slate-500 hover:text-gray-900 transition-colors py-0.5 px-2 rounded hover:bg-slate-100"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-600 font-semibold text-[11px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[11px]">Copy JSON</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto font-mono text-xs leading-relaxed text-slate-800 bg-slate-50/50 max-h-[360px]">
        <code>{data}</code>
      </pre>
    </div>
  );
}

function EndpointCard({
  id,
  method = "GET",
  path,
  scope,
  title,
  description,
  example,
  response,
}: {
  id: string;
  method?: string;
  path: string;
  scope: string;
  title: string;
  description: React.ReactNode;
  example: string;
  response?: string;
}) {
  return (
    <div id={id} className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xs mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-100">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#0072bc]">Endpoint</span>
          <h3 className="text-lg font-bold text-gray-900 mt-0.5">{title}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#0072bc] px-2.5 py-1 font-mono text-xs font-bold text-white shadow-xs">
            {method}
          </span>
          <span className="rounded-md bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-mono font-medium text-[#0072bc]">
            scope: {scope}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <code className="block rounded-lg bg-slate-100 px-3.5 py-2 font-mono text-xs sm:text-sm font-semibold text-[#003d6b] break-all border border-slate-200">
          {path}
        </code>
      </div>

      <div className="mt-4 text-xs sm:text-sm leading-relaxed text-gray-600">
        {description}
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Request Example</div>
          <CodeSnippet code={example} title="cURL Command" />
        </div>

        {response && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Sample Response Payload</div>
            <JsonResponse data={response} title="Response Payload (application/json)" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-[#f3f5fa]">
      {/* ── HEADER BANNER (Matching Home's clean white design) ── */}
      <div className="relative overflow-hidden py-14 bg-white text-gray-900 border-b border-gray-100">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-5 font-medium">
            <Link href="/" className="hover:text-[#0072bc] transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/api-access" className="hover:text-[#0072bc] transition-colors">Request API Access</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-700 font-semibold">API Documentation</span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="max-w-3xl">
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200/80 px-4 py-1.5 text-xs font-bold tracking-wide text-[#0072bc]"
              >
                <BookOpen className="h-3.5 w-3.5 text-[#0072bc]" />
                <span>DEVELOPER REFERENCE · API V1</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="mt-4 text-3xl font-extrabold text-gray-900 sm:text-4xl lg:text-5xl tracking-tight"
              >
                Water Permit Data API Documentation
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mt-4 text-base sm:text-lg text-gray-600 leading-relaxed font-normal"
              >
                Technical integration specifications for government agencies and approved public institutions. Read-only, Bearer/Header token authenticated, issued after approval of an institutional access request.
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="flex flex-col sm:flex-row lg:flex-col gap-3.5 shrink-0"
            >
              <Link href="/api-access" className="w-full sm:w-auto">
                <button
                  type="button"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-13 px-8 py-3.5 rounded-xl bg-[#0072bc] hover:bg-[#005a96] text-white font-bold text-sm shadow-md hover:shadow-xl hover:scale-105 transition-all cursor-pointer whitespace-nowrap"
                >
                  <KeyRound className="h-4 w-4 text-white" />
                  <span>Request API Access Key</span>
                </button>
              </Link>
              <Link href="/" className="w-full sm:w-auto">
                <button
                  type="button"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-13 px-8 py-3.5 rounded-xl border-2 border-[#0072bc] bg-white text-[#0072bc] hover:bg-blue-50 font-bold text-sm shadow-xs hover:shadow-md transition-all cursor-pointer whitespace-nowrap"
                >
                  <ArrowLeft className="h-4 w-4 text-[#0072bc]" />
                  <span>Back to Portal Home</span>
                </button>
              </Link>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── TWO-COLUMN DOCUMENTATION LAYOUT ── */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ── STICKY SIDEBAR (TOC) ── */}
          <aside className="lg:col-span-3 lg:sticky lg:top-24">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-[#0072bc] mb-3">
                Quick Navigation
              </div>
              <nav className="space-y-1 text-xs sm:text-sm">
                {[
                  { label: "1. Authentication", href: "#auth" },
                  { label: "2. Response Envelope", href: "#envelope" },
                  { label: "3. Status & Error Codes", href: "#errors" },
                  { label: "4. Verify Permit", href: "#verify" },
                  { label: "5. Permit Details", href: "#details" },
                  { label: "6. Search Registry", href: "#search" },
                  { label: "7. Aggregate Statistics", href: "#stats" },
                  { label: "8. Terms of Use", href: "#terms" },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="block rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-blue-50 hover:text-[#0072bc] transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              <div className="mt-6 pt-5 border-t border-gray-100">
                <Link
                  href="/api-access"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0072bc] text-white py-2.5 px-4 text-xs font-bold hover:bg-[#005a96] transition-colors shadow-sm"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Request Access
                </Link>
              </div>
            </div>
          </aside>

          {/* ── MAIN DOCUMENTATION CONTENT ── */}
          <main className="lg:col-span-9 space-y-8">
            {/* 1. Authentication */}
            <section id="auth" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0072bc]">Security</span>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">1. Authentication</h2>
              <div className="mt-4 text-xs sm:text-sm leading-relaxed text-gray-600 space-y-3">
                <p>
                  Every request requires an active institutional API key passed in the{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[#0072bc] font-semibold">X-API-Key</code>{" "}
                  HTTP header (or alternately as a Bearer token in <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">Authorization: Bearer &lt;key&gt;</code>).
                </p>
                <p>
                  Keys are issued in the format <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">rwb_live_...</code> and are valid for the agreed duration. When an application is approved, the technical representative receives an encrypted one-time claim link via email. Opening the link reveals the private key once.
                </p>
              </div>

              <div className="mt-4">
                <CodeSnippet
                  code={`# Header Authentication:
curl -H "X-API-Key: rwb_live_9a7d3f4e..." \\
     "${BASE}/permits/verify?permit_number=RWB-2024-00123"`}
                  title="Authentication Header Example"
                />
              </div>
            </section>

            {/* 2. Response Envelope */}
            <section id="envelope" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0072bc]">Standards</span>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">2. Response Envelope Format</h2>
              <p className="mt-3 text-xs sm:text-sm leading-relaxed text-gray-600">
                All endpoints return standard JSON responses. Successful single-item responses encapsulate data within <code className="rounded bg-slate-100 px-1 font-mono text-[#0072bc]">data</code>, while paginated lists also provide pagination metadata within <code className="rounded bg-slate-100 px-1 font-mono text-[#0072bc]">meta</code>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                  <div className="text-xs font-bold text-emerald-800 mb-1 flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    Success Envelope (200 OK)
                  </div>
                  <pre className="font-mono text-xs text-slate-700 overflow-x-auto mt-2">
{`{
  "data": { ... },
  "meta": {
    "total": 512,
    "limit": 100,
    "offset": 0
  }
}`}
                  </pre>
                </div>

                <div className="rounded-xl border border-red-100 bg-red-50/40 p-4">
                  <div className="text-xs font-bold text-red-800 mb-1 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    Error Envelope (4xx / 5xx)
                  </div>
                  <pre className="font-mono text-xs text-slate-700 overflow-x-auto mt-2">
{`{
  "error": {
    "code": "INVALID_KEY",
    "message": "Key missing or not recognised"
  }
}`}
                  </pre>
                </div>
              </div>
            </section>

            {/* 3. Status & Error Codes */}
            <section id="errors" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0072bc]">Reference</span>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">3. Status Codes & Error Reference</h2>
              <p className="mt-2 text-xs sm:text-sm text-gray-600">
                Default rate limit: <strong>60 requests per minute</strong> per key. Statistical aggregates are cached for 5 minutes, mirroring the live public Water Use Dashboard.
              </p>

              <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full min-w-[560px] text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-gray-200 text-gray-700">
                    <tr>
                      <th className="py-3 px-4 font-bold">HTTP Code</th>
                      <th className="py-3 px-4 font-bold">Machine Code</th>
                      <th className="py-3 px-4 font-bold">Description & Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[
                      { http: "400", code: "INVALID_PARAMS", meaning: "Missing, malformed, or out-of-range query parameters.", color: "bg-amber-100 text-amber-800" },
                      { http: "401", code: "INVALID_KEY", meaning: "API Key header is absent, expired, or invalid.", color: "bg-red-100 text-red-800" },
                      { http: "403", code: "GRANT_EXPIRED", meaning: "The institutional grant period ended. Contact RWB to extend.", color: "bg-red-100 text-red-800" },
                      { http: "403", code: "GRANT_REVOKED", meaning: "Key was revoked by RWB security administrators.", color: "bg-red-100 text-red-800" },
                      { http: "403", code: "SCOPE_NOT_GRANTED", meaning: "This endpoint requires an authorization scope not included in your grant.", color: "bg-purple-100 text-purple-800" },
                      { http: "404", code: "NOT_FOUND", meaning: "The requested permit number does not exist in registry.", color: "bg-gray-100 text-gray-700" },
                      { http: "429", code: "RATE_LIMITED", meaning: "Exceeded 60 req/min threshold. Honor the Retry-After response header.", color: "bg-amber-100 text-amber-800" },
                    ].map((row) => (
                      <tr key={row.code} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${row.color}`}>
                            {row.http}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">{row.code}</td>
                        <td className="py-3 px-4 text-gray-600">{row.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 4. Endpoints */}
            <div className="pt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0072bc]">API Specifications</span>
              <h2 className="text-2xl font-bold text-gray-900 mt-1 mb-6">4. Available Endpoints</h2>

              <EndpointCard
                id="verify"
                title="Verify Water Concession Permit"
                path={`${BASE}/permits/verify?permit_number=RWB-2024-00123`}
                scope="permits:verify"
                description={
                  <>
                    Checks whether a specific permit number is genuine, currently active, and within its authorized duration. Note that an unknown permit returns a valid 200 response with <code className="rounded bg-slate-100 px-1 font-mono text-[#0072bc]">valid: false</code> and <code className="rounded bg-slate-100 px-1 font-mono text-slate-800">status: &quot;not_found&quot;</code> rather than an HTTP error, allowing seamless offline-friendly client verification.
                  </>
                }
                example={`curl -X GET "${BASE}/permits/verify?permit_number=RWB-2024-00123" \\
     -H "X-API-Key: $RWB_API_KEY" \\
     -H "Accept: application/json"`}
                response={`{
  "data": {
    "permit_number": "RWB-2024-00123",
    "valid": true,
    "status": "active",
    "status_label": "Active",
    "permit_type": "abstraction",
    "holder_name": "ACME Water Ltd",
    "activity": "Industrial use",
    "water_source": "Borehole",
    "issued_date": "2024-03-15",
    "expiry_date": "2027-03-14",
    "location": "Gasabo, Ndera",
    "province": "Kigali City",
    "district": "Gasabo",
    "sector": "Ndera",
    "source": "permits",
    "verified_at": "2026-08-31T10:20:30Z"
  }
}`}
              />

              <EndpointCard
                id="details"
                title="Fetch Full Permit Record"
                path={`${BASE}/permits/{permit_number}`}
                scope="permits:read"
                description={
                  <>
                    Retrieves the complete public regulatory record of an authorized permit, including permitted abstraction volumes (m³/day), coordinates, and catchment classifications. Permit numbers with forward slashes must be standard URL-encoded (e.g. <code className="rounded bg-slate-100 px-1 font-mono text-slate-800">RWB%2F2024%2F00123</code>).
                  </>
                }
                example={`curl -X GET "${BASE}/permits/RWB%2F2024%2F00123" \\
     -H "X-API-Key: $RWB_API_KEY"`}
                response={`{
  "data": {
    "permit_number": "RWB-2024-00123",
    "status": "active",
    "permit_type": "Water Concession",
    "holder": "ACME Water Ltd",
    "purpose": "Industrial Bottling",
    "water_source": "Groundwater (Borehole)",
    "daily_allowance_m3": 450.0,
    "coordinates": {
      "latitude": -1.9441,
      "longitude": 30.0619
    },
    "location": {
      "province": "Kigali City",
      "district": "Gasabo",
      "sector": "Ndera"
    },
    "issued_date": "2024-03-15",
    "expiry_date": "2027-03-14"
  }
}`}
              />

              <EndpointCard
                id="search"
                title="Search Public Permit Registry"
                path={`${BASE}/permits?q=&province=&district=&sector=&water_source=&purpose=&status=&limit=&offset=`}
                scope="permits:read"
                description={
                  <>
                    Queries the national public permit repository with flexible filtering across geography, water source, purpose, and active status. To maintain data privacy, holder names and contact details are omitted in bulk searches. Results are paginated with a maximum <code className="rounded bg-slate-100 px-1 font-mono text-[#0072bc]">limit</code> of 200.
                  </>
                }
                example={`curl -X GET "${BASE}/permits?district=Gasabo&status=active&limit=100" \\
     -H "X-API-Key: $RWB_API_KEY"`}
                response={`{
  "data": [
    {
      "permit_number": "RWB-2024-00123",
      "status": "active",
      "water_source": "borehole",
      "purpose": "irrigation",
      "issued_date": "2024-03-15",
      "expiry_date": "2027-03-14",
      "province": "Kigali City",
      "district": "Gasabo",
      "sector": "Ndera",
      "catchment1": "NNYK",
      "catchment2": "Nyabugogo"
    }
  ],
  "meta": {
    "total": 512,
    "limit": 100,
    "offset": 0,
    "returned": 100
  }
}`}
              />

              <EndpointCard
                id="stats"
                title="National Water Dashboard Summary Statistics"
                path={`${BASE}/statistics/summary`}
                scope="stats:read"
                description={
                  <>
                    Consumes aggregate national statistical metrics as published on the public Water Use Dashboard. Provides active concession counts, status breakdowns, and grouped distributions by economic activity, district, and catchment basin.
                  </>
                }
                example={`curl -X GET "${BASE}/statistics/summary" \\
     -H "X-API-Key: $RWB_API_KEY"`}
                response={`{
  "data": {
    "generatedAt": "2026-08-31T10:15:00Z",
    "totals": {
      "total": 4812,
      "operational": 3901,
      "expired": 640,
      "cancelled": 71,
      "expiringSoon": 200
    },
    "byActivity": [
      { "key": "industrial", "label": "Industrial", "count": 1204, "percentage": 25.0 },
      { "key": "agriculture", "label": "Agriculture", "count": 1820, "percentage": 37.8 }
    ],
    "byDistrict": [
      { "name": "Gasabo", "count": 312 },
      { "name": "Rwamagana", "count": 284 }
    ],
    "byCatchment": [
      { "code": "NNYK", "name": "Nyabarongo", "count": 1640 }
    ]
  }
}`}
              />
            </div>

            {/* 8. Terms of Use */}
            <section id="terms" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0072bc]">Compliance</span>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">8. Institutional Terms of Use</h2>

              <ul className="mt-4 space-y-3 text-xs sm:text-sm text-gray-600 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-50 text-[#0072bc] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">✓</div>
                  <span><strong>Statutory Purpose:</strong> Permit data may only be consumed for the official regulatory purpose approved in your institution&apos;s access agreement, in full accordance with <strong>Rwanda&apos;s Law №058/2021</strong> on personal data protection.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-50 text-[#0072bc] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">✓</div>
                  <span><strong>Credential Confidentiality:</strong> API keys are institutional secrets. Never embed keys inside client-side applications, mobile apps, or public source repositories.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-50 text-[#0072bc] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">✓</div>
                  <span><strong>Revocation Policy:</strong> RWB reserves the right to suspend or revoke keys exhibiting security anomalies, rate abuse, or expired statutory mandates.</span>
                </li>
              </ul>

              <div className="mt-8 flex flex-wrap items-center gap-3 pt-6 border-t border-gray-100">
                <Link href="/api-access">
                  <Button className="rounded-xl bg-[#0072bc] hover:bg-[#005a96] text-white px-6 font-semibold shadow-sm">
                    <KeyRound className="mr-2 h-4 w-4" /> Request API Access Key
                  </Button>
                </Link>
                <Link href="/">
                  <Button variant="outline" className="rounded-xl border-gray-300 text-gray-700 hover:bg-gray-50 px-6 font-semibold">
                    Return to Portal
                  </Button>
                </Link>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
