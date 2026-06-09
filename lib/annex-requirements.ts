export type AnnexRequiredAttachment = {
  label: string;
  fieldName: string;
  required: boolean;
};

export type AnnexRequirement = {
  annexTitle?: string;
  attachments: AnnexRequiredAttachment[];
};

export function getAnnexRequirementForActivity(
  activity: string,
  ctx: { irrigationTotalArea?: number; isGroundwater?: boolean }
): AnnexRequirement {
  const irrigationArea = ctx.irrigationTotalArea ?? 0;
  const groundwater = ctx.isGroundwater === true;
  const req = (label: string, fieldName: string): AnnexRequiredAttachment => ({ label, fieldName, required: true });
  const opt = (label: string, fieldName: string): AnnexRequiredAttachment => ({ label, fieldName, required: false });
  const applicationLetterLabel = "Application letter addressed to RWB DG through District Mayor";

  switch (activity) {
    // Annex A (Irrigation)
    case "irrigation":
      return {
        annexTitle: "ANNEX A (Only for Irrigation)",
        attachments:
          irrigationArea > 10
            ? [
                req(applicationLetterLabel, "irrigationGeneralRequirements"),
                req("Environmental Impact Assessment certificate", "irrigationEIA"),
                req("Feasibility study", "irrigationFeasibilityStudy"),
                ...(groundwater ? [opt("Geophysical Survey", "irrigationGeophysicalSurvey")] : []),
              ]
            : [
                req(applicationLetterLabel, "irrigationGeneralRequirements"),
                ...(groundwater ? [opt("Geophysical Survey", "irrigationGeophysicalSurvey")] : []),
              ],
      };

    // Annex B (District Water Supply — application letter only, no feasibility study)
    case "district_water_supply":
      return {
        annexTitle: "ANNEX B (Only for Water Supply)",
        attachments: [
          req("Application letter addressed to RWB", "waterSupplyGeneralRequirements"),
        ],
      };

    // Annex B (Water Supply)
    case "water_supply":
      return {
        annexTitle: "ANNEX B (Only for Water Supply)",
        attachments: [
          req(applicationLetterLabel, "waterSupplyGeneralRequirements"),
          req("Feasibility study", "waterSupplyFeasibilityStudy"),
          ...(groundwater ? [opt("Geophysical Survey", "waterSupplyGeophysicalSurvey")] : []),
        ],
      };

    // Annex C (Aquaculture / fish farming)
    case "fish_farming_lakes":
      return {
        annexTitle: "ANNEX C (Only for Aquaculture) — Aquaculture in lakes",
        attachments: [
          req(applicationLetterLabel, "aquacultureGeneralRequirements"),
          req("Recommendation Letter from MINAGRI/RAB", "aquacultureRecommendationLetter"),
          req("Polygon area map", "aquaculturePolygonAreaMap"),
        ],
      };
    case "fish_farming_ponds":
      return {
        annexTitle: "ANNEX C (Only for Aquaculture) — Aquaculture in ponds",
        attachments: [
          req(applicationLetterLabel, "aquacultureGeneralRequirements"),
          req("Recommendation Letter from MINAGRI/RAB", "aquacultureRecommendationLetter"),
          groundwater
            ? req("Geophysical Survey", "aquacultureHydrologicalReport")
            : req("Hydrological report", "aquacultureHydrologicalReport"),
        ],
      };

    // Annex D (Coffee Washing)
    case "coffee_washing":
      return {
        annexTitle: "ANNEX D (Only for Coffee Washing)",
        attachments: [
          req(applicationLetterLabel, "coffeeWashingGeneralRequirements"),
          groundwater
            ? req("Geophysical Survey", "coffeeWashingHydrologicalReport")
            : req("Hydrological report", "coffeeWashingHydrologicalReport"),
        ],
      };

    // Annex E (Industries)
    case "industry":
      return {
        annexTitle: "ANNEX E (Only for Industries)",
        attachments: [
          req(applicationLetterLabel, "industrialGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "industrialEIA"),
          groundwater
            ? req("Geophysical Survey", "industrialHydrologicalReport")
            : req("Hydrological report", "industrialHydrologicalReport"),
        ],
      };

    // Annex F (Hydropower)
    case "electricity_generation":
      return {
        annexTitle: "ANNEX F (Only for Hydropower)",
        attachments: [
          req(applicationLetterLabel, "hydropowerGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "hydropowerEIA"),
          req("Feasibility study (Hydrological assessment)", "hydropowerFeasibilityStudy"),
        ],
      };

    // Annex G (Mining)
    case "mining":
      return {
        annexTitle: "ANNEX G (Only for Mining)",
        attachments: [
          req(applicationLetterLabel, "miningGeneralRequirements"),
          req("Mining license", "miningLicense"),
          req("Environmental Impact Assessment certificate", "miningEIA"),
          groundwater
            ? req("Geophysical Survey", "miningHydrologicalReport")
            : req("Hydrological report", "miningHydrologicalReport"),
        ],
      };

    // Annex H (Construction of a dam, ports, and infrastructure in water bodies)
    case "construction_of_dam":
      return {
        annexTitle: "ANNEX H (Construction of a dam, ports, and infrastructure in water bodies)",
        attachments: [
          req(applicationLetterLabel, "constructionDamGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "constructionDamEIA"),
          req("Feasibility study", "constructionDamFeasibilityStudy"),
        ],
      };
    case "construction_of_infrastructures":
      return {
        annexTitle: "ANNEX H (Construction of a dam, ports, and infrastructure in water bodies)",
        attachments: [
          req(applicationLetterLabel, "infrastructureGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "infrastructureEIA"),
          req("Feasibility study", "infrastructureFeasibilityStudy"),
        ],
      };

    // Annex I (Recreational activities)
    case "recreation_activities":
      return {
        annexTitle: "ANNEX I (Only for Recreational activities)",
        attachments: [
          req(applicationLetterLabel, "recreationGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "recreationEIA"),
          req("Polygon area map", "recreationPolygonAreaMap"),
        ],
      };

    // Annex J (Gaz extraction)
    case "gaz_extraction":
      return {
        annexTitle: "ANNEX J (Only for gaz extraction)",
        attachments: [
          req(applicationLetterLabel, "gazExtractionGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "gazExtractionEIA"),
          req("Feasibility study", "gazExtractionFeasibilityStudy"),
        ],
      };

    // Annex K (Livestock)
    case "livestock":
      return {
        annexTitle: "ANNEX K (Only for Livestock)",
        attachments: [
          req(applicationLetterLabel, "livestockGeneralRequirements"),
          req("Feasibility study", "livestockFeasibilityStudy"),
          ...(groundwater ? [opt("Geophysical Survey", "livestockGeophysicalSurvey")] : []),
        ],
      };

    // No annex specified in the original annex list for these activities
    case "navigation":
    case "other":
    default:
      return { annexTitle: undefined, attachments: [] };
  }
}

export function getAnnexRequirementsForSelection(
  selectedActivities: string[] | undefined,
  ctx: { irrigationTotalArea?: number; isGroundwater?: boolean }
) {
  const selected = Array.isArray(selectedActivities) ? selectedActivities : [];
  return selected
    .filter((a) => typeof a === "string" && a.trim() !== "")
    .map((a) => ({ activity: a, requirement: getAnnexRequirementForActivity(a, ctx) }))
    .filter((x) => x.requirement.attachments.length > 0);
}

export function getRequiredAttachmentFieldNames(
  selectedActivities: string[] | undefined,
  ctx: { irrigationTotalArea?: number; isGroundwater?: boolean }
) {
  const requirements = getAnnexRequirementsForSelection(selectedActivities, ctx);
  const fieldNames = new Set<string>();
  for (const { requirement } of requirements) {
    for (const att of requirement.attachments) {
      if (att.required) fieldNames.add(att.fieldName);
    }
  }
  return fieldNames;
}


