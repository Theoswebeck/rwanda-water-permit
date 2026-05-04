import { NextRequest, NextResponse } from "next/server";
import { generatePermitPdfBuffer, type PermitApplication } from "@/lib/pdf-permit-server";

export const runtime = "nodejs";

type Variant =
  | "abstraction_individual"
  | "abstraction_organization"
  | "concession_individual"
  | "concession_organization";

type AppType = "standard" | "renewal" | "modification" | "transfer";

const BASE_LOCATION = {
  province: "Southern",
  district: "Muhanga",
  sector: "Rongi",
  cell: "Gacurabwenge",
  village: "Giheta",
};

function baseIndividualApplicant() {
  return {
    first_name: "JEAN",
    last_name: "UWIMANA",
    email: "jean.uwimana@example.rw",
    phone: "+250788000001",
    account_type: "individual",
    id_number: "1199080012345678",
  };
}

function baseOrganizationApplicant() {
  return {
    first_name: "MANAGING",
    last_name: "DIRECTOR",
    email: "contact@example.rw",
    phone: "+250788000002",
    account_type: "organization",
    company_name: "WATER WORKS LTD",
    company_tin: "100123456",
    company_address: "KG 123 St, Kigali",
  };
}

function notesFor(variant: Variant, appType: AppType): Record<string, unknown> {
  const notes: Record<string, unknown> = {
    nameRepresentative: "MUSHIMIYIMANA Virginie",
    representativeTitle: "Managing Director",
    representativePosition: "Director",
    nationalIdNumber: "1199080012345678",
    fullNameApplicant: "WATER WORKS LTD",
    officeSector: "Nyarugenge",
    officeDistrict: "Kigali",
    officeProvince: "Kigali",
    officePhone: "+250788000099",
    nameSourceWater: "Nyabarongo River",
    waterSourceLatitude: -1.9441,
    waterSourceLongitude: 30.0619,
    waterSourceProvince: BASE_LOCATION.province,
    waterSourceDistrict: BASE_LOCATION.district,
    waterSourceSector: BASE_LOCATION.sector,
    waterSourceCell: BASE_LOCATION.cell,
    waterSourceVillage: BASE_LOCATION.village,
    intendedActivities: variant.startsWith("concession") ? ["fish_farming_lakes"] : ["irrigation", "water_supply"],
    _assessorAdjustments: {
      permitLengthYears: 5,
      recommendedVolumeM3: 1200,
      waterSourceLatitude: -1.93433216,
      waterSourceLongitude: 29.60182031,
      ...(variant.startsWith("concession")
        ? {
            waterSourcePolygonPoints: [
              { latitude: -1.93433216, longitude: 29.60182031 },
              { latitude: -1.9345, longitude: 29.6021 },
              { latitude: -1.9348, longitude: 29.6017 },
            ],
          }
        : {}),
    },
  };

  if (appType === "transfer") {
    notes.isTransfer = true;
    notes.originalPermitNumber = "0042/RWB/2025";
    notes.transferFormData = {
      permitNumber: "0042/RWB/2025",
      waterSourceType: variant.startsWith("concession") ? "lake" : "river",
      waterSourceName: "Nyabarongo River",
      waterPurpose: "industry",
      waterAllowance: "1200",
      allowanceUnit: "m3/year",
      abstractionMethod: "pumping",
      transfereeName: "SIBOYINTORE CO.LTD",
      transfereeRepresentativeName: "MUSHIMIYIMANA Virginie",
      transfereeRepresentativePosition: "Managing Director",
      transfereeAddressProvince: "Southern",
      transfereeAddressDistrict: "Muhanga",
      transfereeAddressSector: "Rongi",
      transfereeAddressCell: "Gacurabwenge",
      transfereeAddressVillage: "Giheta",
      transfereeEmail: "transferee@example.rw",
      transfereePhone: "+250788000088",
    };
  }

  if (appType === "renewal") {
    notes.isRenewal = true;
    notes.originalPermitNumber = "0099/RWB/2023";
  }

  if (appType === "modification") {
    notes.isModification = true;
    notes.originalPermitNumber = "0077/RWB/2024";
  }

  return notes;
}

function buildFixture(variant: Variant, appType: AppType): PermitApplication {
  const isOrg = variant.endsWith("_organization");
  const isConcession = variant.startsWith("concession");

  const applicant = isOrg ? baseOrganizationApplicant() : baseIndividualApplicant();
  const notes = notesFor(variant, appType);

  return {
    id: `test-${variant}-${appType}`,
    application_number: `RWB-2026-000${appType === "transfer" ? "4" : "1"}`,
    project_title: `${appType} — ${variant}`,
    status: "approved_pending_permit",
    application_type: appType,
    water_source: isConcession ? "lake" : "river",
    water_purpose: isConcession ? "aquaculture" : "irrigation",
    estimated_usage_volume: 1200,
    usage_unit: "m3/year",
    province: BASE_LOCATION.province,
    district: BASE_LOCATION.district,
    sector: BASE_LOCATION.sector,
    cell: BASE_LOCATION.cell,
    village: BASE_LOCATION.village,
    concession_area: isConcession ? 34 : undefined,
    proposed_duration_years: 5,
    assessor_recommended_volume_m3: 1200,
    max_daily_volume_m3: 3,
    max_yearly_volume_m3: 1200,
    internal_notes: JSON.stringify(notes),
    water_taking_method: isConcession ? "diversion_channel" : "pumping",
    applicant,
  } as unknown as PermitApplication;
}

const VALID_VARIANTS: Variant[] = [
  "abstraction_individual",
  "abstraction_organization",
  "concession_individual",
  "concession_organization",
];
const VALID_APP_TYPES: AppType[] = ["standard", "renewal", "modification", "transfer"];

function parseVariant(v: string | null): Variant {
  return VALID_VARIANTS.includes(v as Variant) ? (v as Variant) : "abstraction_organization";
}

function parseAppType(v: string | null): AppType {
  return VALID_APP_TYPES.includes(v as AppType) ? (v as AppType) : "standard";
}

/**
 * Parse a "YYYY-MM-DD" query param into a local-time Date so that date-math
 * operations (e.g. addYearsSafe) see the intended calendar day regardless of
 * server timezone. Using `new Date("YYYY-MM-DDT00:00:00Z")` would resolve to
 * the prior calendar day on negative-UTC-offset servers.
 */
function parseLocalDate(input: string | null): Date | null {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const variant = parseVariant(url.searchParams.get("variant"));
    const appType = parseAppType(url.searchParams.get("appType"));
    const skipQr = url.searchParams.get("skipQr") === "true";
    const issuedDate = parseLocalDate(url.searchParams.get("issueDate")) ?? new Date();

    const fixture = buildFixture(variant, appType);

    const pdfBuffer = await generatePermitPdfBuffer({
      application: fixture,
      permitNumber: "TEST/RWB/2026",
      permitValidityYears: 5,
      issuedDate,
      skipQr,
      isModified: appType === "modification",
    });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="test-${variant}-${appType}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("test/permit-pdf error:", err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
