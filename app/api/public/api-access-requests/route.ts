import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db/postgres";

export const runtime = "nodejs";

/**
 * Public submission endpoint for government-agency API access requests
 * (design §6, §7.1). Creates a `pending` row in api_access_requests; approval
 * and key issuance happen exclusively in the admin "API Access" tab.
 *
 * Reachable without a session via PUBLIC_API_PREFIXES in middleware.ts
 * (POST-only by route shape). Zod-validated, honeypot-protected, and
 * IP-throttled — it is, by definition, world-writable.
 */

const SCOPES = ["permits:verify", "permits:read", "stats:read"] as const;

const RequestSchema = z.object({
  institution_name: z.string().trim().min(2).max(200),
  institution_type: z.enum(["ministry", "district", "agency", "parastatal", "other"]),
  tin: z.string().trim().max(40).optional().or(z.literal("")),
  contact_name: z.string().trim().min(2).max(160),
  contact_email: z.string().trim().email().max(200),
  contact_phone: z.string().trim().max(40).optional().or(z.literal("")),
  technical_email: z.string().trim().email().max(200),
  purpose: z.string().trim().min(20, "Describe the intended use (at least 20 characters).").max(4000),
  requested_scopes: z.array(z.enum(SCOPES)).min(1, "Select at least one endpoint group."),
  requested_period_months: z.coerce.number().int().min(1).max(60),
  static_ip: z
    .string()
    .trim()
    .max(64)
    .optional()
    .or(z.literal("")),
  accepted_terms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the data-use terms." }),
  }),
  // Honeypot: real users never fill this hidden field.
  website: z.string().max(0).optional().or(z.literal("")),
});

// Simple per-IP throttle: 5 submissions per hour (design §7.1).
const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 5;
const submissions = new Map<string, number[]>();

function isThrottled(ip: string): boolean {
  const now = Date.now();
  const recent = (submissions.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    submissions.set(ip, recent);
    return true;
  }
  recent.push(now);
  submissions.set(ip, recent);
  return false;
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function newReferenceNo(): string {
  return `APIREQ-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function POST(req: NextRequest) {
  if (isThrottled(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests from this address. Try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }
  const v = parsed.data;

  // Honeypot trips → pretend success, store nothing.
  if (v.website) {
    return NextResponse.json({ reference_no: newReferenceNo() }, { status: 201 });
  }

  const referenceNo = newReferenceNo();
  try {
    await query(
      `insert into api_access_requests
        (reference_no, institution_name, institution_type, tin, contact_name, contact_email,
         contact_phone, technical_email, purpose, requested_scopes, requested_period_months,
         static_ip, accepted_terms_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())`,
      [
        referenceNo,
        v.institution_name,
        v.institution_type,
        v.tin || null,
        v.contact_name,
        v.contact_email,
        v.contact_phone || null,
        v.technical_email,
        v.purpose,
        v.requested_scopes,
        v.requested_period_months,
        v.static_ip || null,
      ]
    );
    return NextResponse.json({ reference_no: referenceNo }, { status: 201 });
  } catch (e) {
    console.error("[public/api-access-requests] insert failed:", e);
    return NextResponse.json(
      { error: "Could not submit the request right now. Please try again." },
      { status: 500 }
    );
  }
}
