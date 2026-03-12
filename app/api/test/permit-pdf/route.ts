import { NextResponse } from "next/server";
import { generatePermitPdfBuffer } from "@/lib/pdf-permit-server";

export const runtime = "nodejs";

const DUMMY_APPLICATION = {
  id: "test-001",
  application_number: "RWB-2026-000011",
  project_title: "Fish Farming Concession - Kivu Lake",
  status: "approved",
  application_type: "concession",
  water_source: "lake",
  water_purpose: "fish_farming_lakes",
  estimated_usage_volume: 0,
  usage_unit: "m3",
  intended_activities: ["fish_farming_lakes"],
  province: "South",
  district: "Kamonyi",
  sector: "Musambira",
  cell: "Cyambwe",
  village: "Ruvumura",
  concession_area: 5693.05,
  proposed_duration_years: 13,
  internal_notes: JSON.stringify({
    nameSourceWater: "kivu lake",
  }),
  applicant: {
    first_name: "Patience",
    last_name: "NDUWAYEZU",
    email: "patience@example.com",
    phone: "+250788000000",
    account_type: "individual",
    id_number: "1199280169707056",
  },
} as const;

export async function GET() {
  try {
    const issuedDate = new Date(2026, 2, 11);
    const expiryDate = new Date(2039, 2, 12);

    const pdfBuffer = await generatePermitPdfBuffer({
      application: DUMMY_APPLICATION as any,
      permitNumber: "000011/RWB/2026",
      permitValidityYears: 13,
      issuedDate,
      expiryDate,
    });

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="test-permit-000011.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("test permit-pdf error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to generate test permit PDF.", error: String(error) },
      { status: 500 },
    );
  }
}
