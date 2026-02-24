import type { Json } from "@/types/database";

export type ContractPlaceholderContext = {
  applicationNumber: string;
  contractNumber: string;
  isIndividual: boolean;
  applicantName: string;
  applicantIdNumber: string;
  organizationName: string;
  representativeName: string;
  representativeTitle: string;
  waterSourceName: string;
  provinceLabel: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  lat: string;
  lng: string;
  volumeLabel: string; // e.g. "12,000 m³/year" or "100 m³/day"
  durationYearsLabel: string; // e.g. "5"
  concessionAreaLabel: string; // e.g. "12 Ha"
  activityLabel: string; // e.g. "Fish farming in lakes"
};

type ApplicationForContract = {
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  coordinates?: Json | null;
  internal_notes?: unknown;

  water_body_name?: string | null;
  water_source?: string | null;

  max_daily_volume_m3?: number | null;
  max_yearly_volume_m3?: number | null;
  estimated_usage_volume?: number | null;
  usage_unit?: string | null;

  proposed_duration_years?: number | null;
  concession_area?: number | null;

  applicant?: {
    account_type?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
    id_number?: string | null;
  } | null;
};

function safeJsonParseObject(s: unknown): Record<string, any> | null {
  if (typeof s !== "string" || !s.trim()) return null;
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, any>;
    return null;
  } catch {
    return null;
  }
}

function getInternalNotes(application: ApplicationForContract): Record<string, any> | null {
  return safeJsonParseObject(application.internal_notes);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function provinceLabelForContract(provinceRaw: string): string {
  const p = provinceRaw.trim();
  if (!p) return "N/A";
  if (p.toLowerCase() === "kigali") return "City of Kigali";
  return p; // e.g. Northern/Southern/Eastern/Western
}

function resolveApplicantName(application: ApplicationForContract): string {
  const accType = application.applicant?.account_type ?? null;
  if (accType === "individual") {
    const first = (application.applicant?.first_name ?? "").trim();
    const last = (application.applicant?.last_name ?? "").trim();
    const full = `${first} ${last}`.trim();
    return full || "N/A";
  }
  return (application.applicant?.company_name ?? "").trim() || "N/A";
}

function resolveOrganizationName(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  const fromNotes = typeof notes?.fullNameApplicant === "string" ? notes.fullNameApplicant.trim() : "";
  if (fromNotes) return fromNotes;
  const fromUser = (application.applicant?.company_name ?? "").trim();
  if (fromUser) return fromUser;
  // Fallback to individual name if present
  return resolveApplicantName(application);
}

function resolveRepresentativeName(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  const fromNotes = typeof notes?.nameRepresentative === "string" ? notes.nameRepresentative.trim() : "";
  if (fromNotes) return fromNotes;
  // Fallback: sometimes the user record still has first/last for an org account.
  const first = (application.applicant?.first_name ?? "").trim();
  const last = (application.applicant?.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  return full || "N/A";
}

function resolveRepresentativeTitle(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  const fromNotes =
    typeof notes?.representativeTitle === "string"
      ? notes.representativeTitle.trim()
      : typeof notes?.representativePosition === "string"
        ? notes.representativePosition.trim()
        : "";
  return fromNotes || "Representative";
}

function resolveApplicantIdNumber(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  const fromNotes = typeof notes?.nationalIdNumber === "string" ? notes.nationalIdNumber.trim() : "";
  if (fromNotes) return fromNotes;
  const fromUser = typeof application.applicant?.id_number === "string" ? application.applicant.id_number.trim() : "";
  if (fromUser) return fromUser;
  return "N/A";
}

function resolveWaterSourceName(application: ApplicationForContract): string {
  const waterBody = (application.water_body_name ?? "").trim();
  if (waterBody) return waterBody;
  const ws = (application.water_source ?? "").trim();
  if (!ws) return "N/A";
  return ws.replaceAll("_", " ");
}

function resolveActivityLabel(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  const intended = Array.isArray((application as any).intended_activities)
    ? ((application as any).intended_activities as unknown[]).map(String).filter(Boolean)
    : Array.isArray(notes?.intendedActivities)
      ? (notes?.intendedActivities as unknown[]).map(String).filter(Boolean)
      : [];
  const primary = intended?.[0] ?? "";
  const labels: Record<string, string> = {
    fish_farming_lakes: "Fish farming in lakes",
    fish_farming_ponds: "Fish farming in ponds",
    irrigation: "Irrigation",
    water_supply: "Water Supply",
    industry: "Industry",
    coffee_washing: "Coffee Washing",
    electricity_generation: "Electricity Generation",
    mining: "Mining",
    construction_of_dam: "Construction of Dam",
    construction_of_infrastructures: "Construction of Infrastructures",
    navigation: "Navigation",
    recreation_activities: "Recreation Activities",
    other: "Other",
  };
  return labels[primary] || (primary ? primary.replaceAll("_", " ") : "N/A");
}

function resolveLatLng(application: ApplicationForContract): { lat: string; lng: string } {
  const notes = getInternalNotes(application);
  const latRaw = typeof notes?.waterSourceLatitude === "string" ? notes.waterSourceLatitude.trim() : "";
  const lngRaw = typeof notes?.waterSourceLongitude === "string" ? notes.waterSourceLongitude.trim() : "";
  const latNum = latRaw ? Number.parseFloat(latRaw) : NaN;
  const lngNum = lngRaw ? Number.parseFloat(lngRaw) : NaN;
  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    return { lat: latNum.toFixed(6), lng: lngNum.toFixed(6) };
  }

  const geom: any = application.coordinates as any;
  if (geom && geom.type === "Point" && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
    const [lng, lat] = geom.coordinates;
    const latN = Number(lat);
    const lngN = Number(lng);
    if (Number.isFinite(latN) && Number.isFinite(lngN)) {
      return { lat: latN.toFixed(6), lng: lngN.toFixed(6) };
    }
  }

  return { lat: "N/A", lng: "N/A" };
}

function resolveVolumeLabel(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  
  // Priority 1: Assessor recommended volume (from assessor adjustments)
  const assessorAdjustments = notes?._assessorAdjustments;
  if (typeof assessorAdjustments?.recommendedVolumeM3 === "number" && 
      Number.isFinite(assessorAdjustments.recommendedVolumeM3)) {
    return `${formatNumber(assessorAdjustments.recommendedVolumeM3)} m³/year`;
  }
  
  // Priority 2: Fall back to database fields (original applicant values)
  if (typeof application.max_yearly_volume_m3 === "number" && Number.isFinite(application.max_yearly_volume_m3)) {
    return `${formatNumber(application.max_yearly_volume_m3)} m³/year`;
  }
  if (typeof application.max_daily_volume_m3 === "number" && Number.isFinite(application.max_daily_volume_m3)) {
    return `${formatNumber(application.max_daily_volume_m3)} m³/day`;
  }
  if (typeof application.estimated_usage_volume === "number" && Number.isFinite(application.estimated_usage_volume)) {
    const unit = (application.usage_unit ?? "m³").trim() || "m³";
    return `${formatNumber(application.estimated_usage_volume)} ${unit}`;
  }
  
  // Priority 3: Check internal_notes for original form data
  const formVolume = notes?.waterAbstractionDetails?.[0]?.maxAverageYearly;
  if (typeof formVolume === "number" && Number.isFinite(formVolume)) {
    return `${formatNumber(formVolume)} m³/year`;
  }
  
  return "N/A";
}

function resolveDurationYears(application: ApplicationForContract): string {
  const notes = getInternalNotes(application);
  
  // Priority 1: Assessor recommended duration (from assessor adjustments)
  const assessorAdjustments = notes?._assessorAdjustments;
  if (typeof assessorAdjustments?.permitLengthYears === "number" && 
      Number.isFinite(assessorAdjustments.permitLengthYears) &&
      assessorAdjustments.permitLengthYears >= 1 && 
      assessorAdjustments.permitLengthYears <= 15) {
    return String(Math.round(assessorAdjustments.permitLengthYears));
  }
  
  // Priority 2: Database field (may have been updated by assessor)
  if (typeof application.proposed_duration_years === "number" && 
      Number.isFinite(application.proposed_duration_years)) {
    return String(Math.max(1, Math.round(application.proposed_duration_years)));
  }
  
  // Priority 3: Default
  return "5";
}

function resolveConcessionAreaLabel(application: ApplicationForContract): string {
  const n = application.concession_area;
  if (typeof n === "number" && Number.isFinite(n) && n > 0) {
    return `${formatNumber(n)} Ha`;
  }
  return "N/A";
}

export function buildContractPlaceholderContext(
  application: ApplicationForContract,
  applicationNumber?: string
): ContractPlaceholderContext {
  const provinceRaw = (application.province ?? "").trim();
  const { lat, lng } = resolveLatLng(application);
  const isIndividual = (application.applicant?.account_type ?? null) === "individual";
  const appNo = (applicationNumber ?? "").trim();
  const contractNumber = (() => {
    if (!appNo) return "N/A";
    // Common format: "RWB-2025-000025" -> "000025/RWB/2025"
    const m = appNo.match(/^RWB-(\d{4})-(\d+)$/i);
    if (!m) return "N/A";
    const year = m[1];
    const seq = m[2].padStart(6, "0");
    return `${seq}/RWB/${year}`;
  })();
  return {
    applicationNumber: (applicationNumber ?? "").trim() || "N/A",
    contractNumber,
    isIndividual,
    applicantName: resolveApplicantName(application),
    applicantIdNumber: resolveApplicantIdNumber(application),
    organizationName: resolveOrganizationName(application),
    representativeName: resolveRepresentativeName(application),
    representativeTitle: resolveRepresentativeTitle(application),
    waterSourceName: resolveWaterSourceName(application),
    provinceLabel: provinceLabelForContract(provinceRaw),
    district: (application.district ?? "").trim() || "N/A",
    sector: (application.sector ?? "").trim() || "N/A",
    cell: (application.cell ?? "").trim() || "N/A",
    village: (application.village ?? "").trim() || "N/A",
    lat,
    lng,
    volumeLabel: resolveVolumeLabel(application),
    durationYearsLabel: resolveDurationYears(application),
    concessionAreaLabel: resolveConcessionAreaLabel(application),
    activityLabel: resolveActivityLabel(application),
  };
}

export function fillContractText(raw: string, ctx: ContractPlaceholderContext): string {
  let s = raw;

  // Application
  s = s.replaceAll("{{APPLICATION_NUMBER}}", ctx.applicationNumber);
  s = s.replaceAll("{{CONTRACT_NUMBER}}", ctx.contractNumber);

  // Applicant
  s = s.replaceAll("NAME OF APPLICANT", ctx.applicantName);
  s = s.replaceAll("Name of applicant", ctx.applicantName);
  s = s.replaceAll("IZINA RY’USABA", ctx.applicantName);
  s = s.replaceAll("IZINA RY'USABA", ctx.applicantName);
  // Replace ID-number placeholders ONLY when the surrounding text indicates an ID field.
  // Avoid a global X{6,} replacement because templates also use XXXXXX for non-ID placeholders (e.g. water source).
  s = s.replace(
    /(with\s+ID\s+No\.?\s*)X{6,}/gi,
    (_, prefix: string) => `${prefix}${ctx.applicantIdNumber}`
  );
  s = s.replace(
    /(with\s+ID\s+Number:?\s*)X{6,}/gi,
    (_, prefix: string) => `${prefix}${ctx.applicantIdNumber}`
  );
  s = s.replace(
    /(Nomero y[’']?\s+Indangamuntu:\s*)X{6,}/gi,
    (_, prefix: string) => `${prefix}${ctx.applicantIdNumber}`
  );
  s = s.replace(
    /(Nimero y[’']?\s+Indangamuntu:\s*)X{6,}/gi,
    (_, prefix: string) => `${prefix}${ctx.applicantIdNumber}`
  );
  s = s.replaceAll("“XXXXX (IZINA RY’USABA)”", `“${ctx.applicantName}”`);
  s = s.replaceAll("\"XXXXX (IZINA RY’USABA)\"", `"${ctx.applicantName}"`);
  s = s.replaceAll("“XXXXX (IZINA RY'USABA)”", `“${ctx.applicantName}”`);
  s = s.replaceAll("\"XXXXX (IZINA RY'USABA)\"", `"${ctx.applicantName}"`);

  // Organization + representative
  s = s.replaceAll("NAME OF APPLIED ORGANIZATION", ctx.organizationName);
  s = s.replaceAll("NAME OF ORGANIZATION", ctx.organizationName);
  s = s.replaceAll("IZINA RY’ IKIGO/KOPERATIVE/ IKOMPANYI N’IBINDI CYASABYE", ctx.organizationName);
  s = s.replaceAll("IZINA RY' IKIGO/KOPERATIVE/ IKOMPANYI N'IBINDI CYASABYE", ctx.organizationName);
  s = s.replaceAll("NAME OF REPRESENTATIVE", ctx.representativeName);
  s = s.replaceAll("IZINA RY’UHAGARARIYE IKIGO", ctx.representativeName);
  s = s.replaceAll("IZINA RY'UHAGARARIYE IKIGO", ctx.representativeName);
  s = s.replaceAll("TITLE/ POSITION", ctx.representativeTitle);
  s = s.replaceAll("TITLE OF REPRESENTATIVE", ctx.representativeTitle);
  s = s.replaceAll("POSITION", ctx.representativeTitle);
  s = s.replaceAll("ICYO ASHINZWE", ctx.representativeTitle);

  // Water source
  s = s.replaceAll("NAME OF WATER SOURCE", ctx.waterSourceName);
  s = s.replaceAll("IZINA RY’ISOKO Y’AMAZI", ctx.waterSourceName);
  s = s.replaceAll("IZINA RY'ISOKO Y'AMAZI", ctx.waterSourceName);
  // Some templates include a space after the apostrophe: "IZINA RY’ ISOKO..."
  s = s.replaceAll("IZINA RY’ ISOKO Y’AMAZI", ctx.waterSourceName);
  s = s.replaceAll("IZINA RY' ISOKO Y'AMAZI", ctx.waterSourceName);
  s = s.replaceAll("(NAME OF WATER SOURCE)", ctx.waterSourceName);
  s = s.replaceAll("NAME OF LAKE", ctx.waterSourceName);
  s = s.replaceAll("NAME OF THE LAKE", ctx.waterSourceName);
  s = s.replaceAll("IZINA RY’IKIYAGA", ctx.waterSourceName);
  s = s.replaceAll("IZINA RY'IKIYAGA", ctx.waterSourceName);

  // Location placeholders (English)
  s = s.replaceAll("XXX Province", `${ctx.provinceLabel}`);
  s = s.replaceAll("XXXX Province", `${ctx.provinceLabel}`);
  s = s.replaceAll("XXX District", `${ctx.district}`);
  s = s.replaceAll("XXXX District", `${ctx.district}`);
  s = s.replaceAll("XXX Sector", `${ctx.sector}`);
  s = s.replaceAll("XXXX Sector", `${ctx.sector}`);
  s = s.replaceAll("XXX Cell", `${ctx.cell}`);
  s = s.replaceAll("XXXX Cell", `${ctx.cell}`);
  s = s.replaceAll("XXX Village", `${ctx.village}`);
  s = s.replaceAll("XXXX Village", `${ctx.village}`);
  s = s.replaceAll("XXXX Sector", `${ctx.sector}`);

  // Location placeholders (Kinyarwanda)
  s = s.replaceAll("Intara y' XXX", `Intara y' ${ctx.provinceLabel}`);
  s = s.replaceAll("Intara y’ XXX", `Intara y’ ${ctx.provinceLabel}`);
  s = s.replaceAll("Akarere ka XXX", `Akarere ka ${ctx.district}`);
  s = s.replaceAll("Umurenge wa XXX", `Umurenge wa ${ctx.sector}`);
  s = s.replaceAll("Umurenge wa XXXX", `Umurenge wa ${ctx.sector}`);
  s = s.replaceAll("Akagari ka XXX", `Akagari ka ${ctx.cell}`);
  s = s.replaceAll("Umudugudu w’ XXX", `Umudugudu w’ ${ctx.village}`);
  s = s.replaceAll("Umudugudu w' XXX", `Umudugudu w' ${ctx.village}`);

  // Coordinates
  s = s.replace(
    /Latitude:\s*[-0-9.]+°,\s*Longitude:\s*[-0-9.]+°/g,
    `Latitude: ${ctx.lat}°, Longitude: ${ctx.lng}°`
  );
  s = s.replace(
    /Latitide\s*\(Latitude\):\s*[-0-9.]+°,\s*Lonjitide\s*\(Longitude\):\s*[-0-9.]+°/g,
    `Latitide (Latitude): ${ctx.lat}°, Lonjitide (Longitude): ${ctx.lng}°`
  );

  // Volume / flow rate
  s = s.replace(/flow rate of\s+XXX\s+m3\/year\s+OR\s+m3\/day/gi, `flow rate of ${ctx.volumeLabel}`);
  s = s.replace(/flow rate of\s+XXXX\s+m3\/day\s+OR\s+m3\/year/gi, `flow rate of ${ctx.volumeLabel}`);
  s = s.replace(/angana na m3\s+XXX\s+ku mwaka/gi, `angana na ${ctx.volumeLabel.replaceAll("m³", "m3")} ku mwaka`);
  s = s.replace(/angana na\s+m³?\s+XXX\s+ku munsi/gi, `angana na ${ctx.volumeLabel.replaceAll("m³", "m3")} ku munsi`);

  // Duration
  s = s.replace(/period of\s+XXX\s+\(Number\)\s+years/gi, `period of ${ctx.durationYearsLabel} years`);
  s = s.replace(/IN LETTER AND NUMBER\s*\(XXX\)\s*years/gi, `${ctx.durationYearsLabel} years`);
  s = s.replace(/period of\s+XXXX\s+\(NUMBER\)\s+years/gi, `period of ${ctx.durationYearsLabel} years`);
  s = s.replace(/imyaka\s+XXXX\s+\(IMYAKA URUHUSHYA RUZAMARA\)/gi, `imyaka ${ctx.durationYearsLabel}`);
  s = s.replace(/imyaka\s+XXX\s+\(IGIHE URUHUSHYA RUZAMARA\)/gi, `imyaka ${ctx.durationYearsLabel}`);

  // Concession area + activity
  s = s.replaceAll("XXXHa", ctx.concessionAreaLabel);
  s = s.replaceAll("XXX Ha", ctx.concessionAreaLabel);
  s = s.replaceAll("Hegitari XXX", ctx.concessionAreaLabel);
  s = s.replaceAll("NAME OF TYPE OF WATER ACTIVITIES APPLIED FOR", ctx.activityLabel);
  s = s.replaceAll("NAME OF ACTIVITIES APPLIED FOR", ctx.activityLabel);
  s = s.replaceAll("IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA", ctx.activityLabel);

  // Lake cleanup: remove stray "XXXX" next to "Lake" after we’ve filled the lake name.
  // e.g. "Lake XXXX <name>" -> "Lake <name>"
  s = s.replace(/Lake\s+XXXX\s+(?=\S)/g, "Lake ");
  // e.g. "XXXX Lake <name>" -> "<name>"
  s = s.replace(/XXXX\s+Lake\s+(?=\S)/g, "");
  // Collapse accidental duplicates like "<name> <name>" in some templates
  if (ctx.waterSourceName && ctx.waterSourceName !== "N/A") {
    const escaped = ctx.waterSourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const dup = new RegExp(`(${escaped})\\s+\\1`, "g");
    s = s.replace(dup, "$1");
  }

  // Signature placeholder used in some Kinyarwanda templates
  s = s.replaceAll("XXXX (Usaba y’ Usaba uruhushya)", ctx.applicantName);

  // Fix a common template typo: "water from XXXX (NAME OF ACTIVITIES APPLIED FOR)" should reference water source.
  s = s.replace(/water from\s+XXXX\s+\(NAME OF ACTIVITIES APPLIED FOR\)/gi, `water from ${ctx.waterSourceName}`);

  // Strip leftover X-prefixed placeholders around values we have already filled.
  // Example: "XXXX (test)" -> "test", "XXXXX (Acme Ltd)" -> "Acme Ltd"
  function stripXPrefixAroundValue(value: string) {
    const v = (value ?? "").trim();
    if (!v) return;
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Matches: XXXX(<value>) or XXXX (<value>) with any 3+ X's.
    const re = new RegExp(`\\bX{3,}\\s*\\(\\s*${escaped}\\s*\\)`, "g");
    s = s.replace(re, v);
  }

  stripXPrefixAroundValue(ctx.waterSourceName);
  stripXPrefixAroundValue(ctx.applicantName);
  stripXPrefixAroundValue(ctx.organizationName);
  stripXPrefixAroundValue(ctx.representativeName);
  stripXPrefixAroundValue(ctx.activityLabel);

  return s;
}


