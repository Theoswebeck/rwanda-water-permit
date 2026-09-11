import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen } from "lucide-react";

/**
 * Public API documentation page (design: docs/api-access-DESIGN.md §8).
 * Content mirrors docs/api/API-GUIDE.md — keep the two in sync; the .md is the
 * deliverable for the contract's "API guides" line, this page is the live copy.
 */

const BASE = "https://waterpermit.rwb.rw/api/v1";

function Endpoint({
  method = "GET",
  path,
  scope,
  description,
  example,
  response,
}: {
  method?: string;
  path: string;
  scope: string;
  description: React.ReactNode;
  example: string;
  response?: string;
}) {
  return (
    <div className="mt-8 border-t pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-primary px-2 py-1 font-mono text-xs text-[#47d198]">{method}</code>
        <code className="font-mono text-sm font-semibold break-all text-primary">{path}</code>
        <span className="rounded-full bg-[#47d198]/15 px-2.5 py-0.5 text-xs font-medium text-primary">
          scope: {scope}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
        {example}
      </pre>
      {response && (
        <pre className="mt-2 overflow-x-auto rounded-lg border bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
          {response}
        </pre>
      )}
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="relative overflow-hidden py-16 text-white">
        <div className="absolute inset-0 z-0">
          <Image
            src="/assets/willy-wo-iDYq_HHXWO0-unsplash.jpg"
            alt="Water surface"
            fill
            style={{ objectFit: "cover" }}
            priority
          />
          <div className="absolute inset-0 bg-black/55" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 z-10 h-2 bg-[#47d198]" />
        <div className="container relative z-10 mx-auto max-w-4xl px-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm">
            <BookOpen className="h-3.5 w-3.5" /> API DOCUMENTATION
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight md:text-4xl">Water Permit Data API</h1>
          <p className="mt-3 max-w-2xl text-white/90">
            Documentation for government agencies integrating with the Rwanda Water Resources
            Board permit registry. Read-only, API-key authenticated, issued after an approved{" "}
            <Link href="/api-access" className="text-white underline underline-offset-4 hover:text-white/80">access request</Link>.
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-10 text-slate-800">
        <section>
          <h2 className="text-lg font-semibold">Authentication</h2>
          <p className="mt-2 text-sm text-slate-600">
            Send your institution&apos;s key in the <code className="rounded bg-slate-100 px-1">X-API-Key</code>{" "}
            header (or as a bearer token). Keys look like{" "}
            <code className="rounded bg-slate-100 px-1">rwb_live_…</code>, are valid for a fixed
            period, and work only for the endpoint groups granted. When access is approved,
            your technical contact receives a one-time claim link by email; opening it
            generates the key and shows it once, to you only — nobody at RWB ever sees it.
            Treat the key like a password; it can be reissued (revoking the old key) on request.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Response envelope &amp; errors</h2>
          <p className="mt-2 text-sm text-slate-600">
            Success: <code className="rounded bg-slate-100 px-1">{`{ "data": …, "meta": … }`}</code>.
            Error: <code className="rounded bg-slate-100 px-1">{`{ "error": { "code": "…", "message": "…" } }`}</code>.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 pr-4">HTTP</th>
                  <th className="py-2 pr-4">code</th>
                  <th className="py-2">meaning</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["400", "INVALID_PARAMS", "Missing or invalid query parameters"],
                  ["401", "INVALID_KEY", "Key missing or not recognised"],
                  ["403", "GRANT_EXPIRED", "Key past its validity period — ask RWB to renew"],
                  ["403", "GRANT_REVOKED", "Key revoked by RWB"],
                  ["403", "SCOPE_NOT_GRANTED", "Key not granted this endpoint group"],
                  ["404", "NOT_FOUND", "Permit number unknown"],
                  ["429", "RATE_LIMITED", "Over the per-minute limit (Retry-After is set)"],
                ].map(([http, code, meaning]) => (
                  <tr key={code} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{http}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{code}</td>
                    <td className="py-2 text-slate-600">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Default rate limit: 60 requests/minute per key. Statistics responses are cached for
            5 minutes — identical numbers to the public Water Use Dashboard.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Endpoints</h2>

          <Endpoint
            path={`${BASE}/permits/verify?permit_number=RWB-2024-00123`}
            scope="permits:verify"
            description={
              <>Verify one permit number: is it real, active, and until when. An unknown
              number is a valid answer (<code className="rounded bg-slate-100 px-1">valid: false</code>,{" "}
              <code className="rounded bg-slate-100 px-1">status: &quot;not_found&quot;</code>), not an error.
              Deactivated permits return status only — no details, mirroring the public QR
              verification page.</>
            }
            example={`curl -H "X-API-Key: $KEY" \\
  "${BASE}/permits/verify?permit_number=RWB-2024-00123"`}
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
    "province": "Kigali City", "district": "Gasabo", "sector": "Ndera",
    "source": "permits",
    "verified_at": "2026-08-31T10:20:30Z"
  }
}`}
          />

          <Endpoint
            path={`${BASE}/permits/{permit_number}`}
            scope="permits:read"
            description={
              <>Full public record for one permit — the verify fields plus water allowance and
              coordinates. Permit numbers containing slashes must be URL-encoded. Returns{" "}
              <code className="rounded bg-slate-100 px-1">404 NOT_FOUND</code> when unknown.</>
            }
            example={`curl -H "X-API-Key: $KEY" \\
  "${BASE}/permits/RWB%2F2024%2F00123"`}
          />

          <Endpoint
            path={`${BASE}/permits?q=&province=&district=&sector=&water_source=&purpose=&status=&limit=&offset=`}
            scope="permits:read"
            description={
              <>Registry search over the public permit registry (no holder/contact fields by
              construction). <code className="rounded bg-slate-100 px-1">q</code> is free text across permit
              number, district, sector and catchments; <code className="rounded bg-slate-100 px-1">limit</code> is
              capped at 200.</>
            }
            example={`curl -H "X-API-Key: $KEY" \\
  "${BASE}/permits?district=Gasabo&status=active&limit=100"`}
            response={`{
  "data": [
    { "permit_number": "…", "status": "active", "water_source": "borehole",
      "purpose": "irrigation", "issued_date": "…", "expiry_date": "…",
      "province": "Kigali City", "district": "Gasabo", "sector": "…",
      "catchment1": "…", "catchment2": "…" }
  ],
  "meta": { "total": 512, "limit": 100, "offset": 0, "returned": 100 }
}`}
          />

          <Endpoint
            path={`${BASE}/statistics/summary`}
            scope="stats:read"
            description={
              <>The Water Use Dashboard machine-readable: headline status totals and permit
              counts by activity, district, and catchment — aggregate counts only. Optional{" "}
              <code className="rounded bg-slate-100 px-1">?by=activity|district|catchment</code> returns just that
              bucket array.</>
            }
            example={`curl -H "X-API-Key: $KEY" "${BASE}/statistics/summary"`}
            response={`{
  "data": {
    "generatedAt": "2026-08-31T10:15:00Z",
    "totals": { "total": 4812, "operational": 3901, "expired": 640,
                "cancelled": 71, "expiringSoon": 200 },
    "byActivity":  [ { "key": "industrial", "label": "Industrial",
                       "count": 1204, "percentage": 25.0 } ],
    "byDistrict":  [ … ], "byCatchment": [ … ],
    "catchmentAttribution": { "fromCoordinates": 4410,
                              "estimatedFromLocation": 302, "unattributed": 100 }
  }
}`}
          />
        </section>

        <section className="mt-10 rounded-xl border bg-slate-50 p-5">
          <h2 className="text-base font-semibold">Terms of use</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>
              Permit data may be used only for the institutional purpose stated in the access
              request, in line with Rwanda&apos;s Law №058/2021 on the protection of personal
              data and privacy.
            </li>
            <li>Keys are institution-wide credentials — store them server-side, never in client code or public repositories.</li>
            <li>RWB can revoke a key at any time; abuse results in revocation.</li>
          </ul>
        </section>

        <div className="mt-10">
          <Link href="/api-access">
            <Button className="h-12 rounded-full px-8 font-medium">
              <ArrowLeft className="mr-2 h-4 w-4" /> Request API access
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
