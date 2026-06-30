import { resolveDocumentFieldToken } from "./upload-mapping";

type AdditionalDocumentFormEntry = {
  id?: string;
  name?: string;
  category?: string;
  description?: string;
  file?: File | null;
  url?: string;
};

type StoredDocumentRecord = {
  id?: string;
  name?: string | null;
  type?: string | null;
  file_path?: string | null;
};

type GetDocumentUrl = (filePath: string) => string | null;

const ADDITIONAL_DOCUMENT_CATEGORY_PREFIXES: Array<[string, string]> = [
  ["irrigation_", "irrigation"],
  ["water_supply_", "water_supply"],
  ["mining_", "mining"],
  ["fish_farming_", "aquaculture"],
  ["aquaculture_", "aquaculture"],
  ["coffee_washing_", "coffee_washing"],
  ["industry_", "industrial"],
  ["industrial_", "industrial"],
  ["electricity_generation_", "hydropower"],
  ["hydropower_", "hydropower"],
  ["construction_of_dam_", "construction_dam"],
  ["construction_dam_", "construction_dam"],
  ["construction_of_infrastructures_", "infrastructure"],
  ["infrastructure_", "infrastructure"],
  ["port_construction_", "port_construction"],
  ["recreation_activities_", "recreation"],
  ["recreation_", "recreation"],
  ["gaz_extraction_", "gaz_extraction"],
  ["livestock_", "livestock"],
  ["other_", "other"],
];

function inferAdditionalDocumentCategoryFromId(id?: string): string {
  if (!id || typeof id !== "string") return "additional";
  const match = ADDITIONAL_DOCUMENT_CATEGORY_PREFIXES.find(([prefix]) => id.startsWith(prefix));
  if (match) return match[1];
  return "additional";
}

function isStoredDocumentRecord(value: unknown): value is StoredDocumentRecord {
  return typeof value === "object" && value !== null;
}

export function mergeAdditionalDocumentUrls<T extends { additionalDocuments?: AdditionalDocumentFormEntry[] }>(
  formData: T,
  documents: ReadonlyArray<unknown> | null | undefined,
  getDocumentUrl: GetDocumentUrl
): T & { additionalDocuments: AdditionalDocumentFormEntry[] } {
  const additionalDocuments = Array.isArray(formData.additionalDocuments)
    ? formData.additionalDocuments
    : [];

  const byId = new Map<string, AdditionalDocumentFormEntry>();
  const byName = new Map<string, AdditionalDocumentFormEntry>();
  const linkedDocuments = new WeakSet<AdditionalDocumentFormEntry>();

  for (const doc of additionalDocuments) {
    if (doc?.id) byId.set(String(doc.id), doc);
    if (doc?.name) byName.set(String(doc.name), doc);
  }

  for (const doc of documents || []) {
    if (!isStoredDocumentRecord(doc)) continue;
    if (!doc?.file_path || !doc?.name) continue;

    const url = getDocumentUrl(doc.file_path);
    if (!url) continue;

    const fieldToken = resolveDocumentFieldToken(doc.file_path, doc.type || "other");
    if (!fieldToken.startsWith("additional_")) continue;

    const additionalId = fieldToken.replace(/^additional_/, "");
    const match = byId.get(additionalId) || byName.get(doc.name);

    if (match) {
      if (linkedDocuments.has(match)) continue;
      match.url = url;
      match.file = null;
      linkedDocuments.add(match);
      if (!match.category) {
        match.category = inferAdditionalDocumentCategoryFromId(additionalId);
      }
      continue;
    }

    const entry: AdditionalDocumentFormEntry = {
      id: additionalId || doc.id || `additional_${additionalDocuments.length + 1}`,
      name: doc.name,
      category: inferAdditionalDocumentCategoryFromId(additionalId),
      description: "",
      file: null,
      url,
    };
    additionalDocuments.push(entry);
    linkedDocuments.add(entry);
    if (entry.id) byId.set(entry.id, entry);
    if (entry.name) byName.set(entry.name, entry);
  }

  formData.additionalDocuments = additionalDocuments;
  return formData as T & { additionalDocuments: AdditionalDocumentFormEntry[] };
}
