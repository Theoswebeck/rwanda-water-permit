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
  ctx: { irrigationTotalArea?: number }
): AnnexRequirement {
  const irrigationArea = ctx.irrigationTotalArea ?? 0;
  const req = (label: string, fieldName: string): AnnexRequiredAttachment => ({ label, fieldName, required: true });

  switch (activity) {
    // Annex A (Irrigation)
    case "irrigation":
      return {
        annexTitle: "ANNEX A (Only for Irrigation)",
        attachments:
          irrigationArea > 10
            ? [
                req("General requirements", "irrigationGeneralRequirements"),
                req("Environmental Impact Assessment certificate", "irrigationEIA"),
                req("Feasibility study", "irrigationFeasibilityStudy"),
              ]
            : [req("General requirements", "irrigationGeneralRequirements")],
      };

    // Annex B (Water Supply)
    case "water_supply":
      return {
        annexTitle: "ANNEX B (Only for Water Supply)",
        attachments: [
          req("General requirements", "waterSupplyGeneralRequirements"),
          req("Feasibility study", "waterSupplyFeasibilityStudy"),
        ],
      };

    // Annex C (Aquaculture / fish farming)
    case "fish_farming_lakes":
      return {
        annexTitle: "ANNEX C (Only for Aquaculture) — Aquaculture in lakes",
        attachments: [
          req("General requirements", "aquacultureGeneralRequirements"),
          req("Recommendation Letter from MINAGRI/RAB", "aquacultureRecommendationLetter"),
          req("Polygon area map", "aquaculturePolygonAreaMap"),
        ],
      };
    case "fish_farming_ponds":
      return {
        annexTitle: "ANNEX C (Only for Aquaculture) — Aquaculture in ponds",
        attachments: [
          req("General requirements", "aquacultureGeneralRequirements"),
          req("Recommendation Letter from MINAGRI/RAB", "aquacultureRecommendationLetter"),
          req("Hydrological report", "aquacultureHydrologicalReport"),
        ],
      };

    // Annex D (Coffee Washing)
    case "coffee_washing":
      return {
        annexTitle: "ANNEX D (Only for Coffee Washing)",
        attachments: [
          req("General requirements", "coffeeWashingGeneralRequirements"),
          req("Hydrological report", "coffeeWashingHydrologicalReport"),
        ],
      };

    // Annex E (Industries)
    case "industry":
      return {
        annexTitle: "ANNEX E (Only for Industries)",
        attachments: [
          req("General requirements", "industrialGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "industrialEIA"),
          req("Hydrological report", "industrialHydrologicalReport"),
        ],
      };

    // Annex F (Hydropower)
    case "electricity_generation":
      return {
        annexTitle: "ANNEX F (Only for Hydropower)",
        attachments: [
          req("General requirements", "hydropowerGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "hydropowerEIA"),
          req("Feasibility study (Hydrological assessment)", "hydropowerFeasibilityStudy"),
        ],
      };

    // Annex G (Mining)
    case "mining":
      return {
        annexTitle: "ANNEX G (Only for Mining)",
        attachments: [
          req("General requirements", "miningGeneralRequirements"),
          req("Mining license", "miningLicense"),
          req("Environmental Impact Assessment certificate", "miningEIA"),
          req("Hydrological report", "miningHydrologicalReport"),
        ],
      };

    // Annex H (Construction of a dam, ports, and infrastructure in water bodies)
    case "construction_of_dam":
      return {
        annexTitle: "ANNEX H (Construction of a dam, ports, and infrastructure in water bodies)",
        attachments: [
          req("General requirements", "constructionDamGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "constructionDamEIA"),
          req("Feasibility study", "constructionDamFeasibilityStudy"),
        ],
      };
    case "construction_of_infrastructures":
      return {
        annexTitle: "ANNEX H (Construction of a dam, ports, and infrastructure in water bodies)",
        attachments: [
          req("General requirements", "infrastructureGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "infrastructureEIA"),
          req("Feasibility study", "infrastructureFeasibilityStudy"),
        ],
      };

    // Annex I (Recreational activities)
    case "recreation_activities":
      return {
        annexTitle: "ANNEX I (Only for Recreational activities)",
        attachments: [
          req("General requirements", "recreationGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "recreationEIA"),
          req("Polygon area map", "recreationPolygonAreaMap"),
        ],
      };

    // Annex J (Gaz extraction)
    case "gaz_extraction":
      return {
        annexTitle: "ANNEX J (Only for gaz extraction)",
        attachments: [
          req("General requirements", "gazExtractionGeneralRequirements"),
          req("Environmental Impact Assessment certificate", "gazExtractionEIA"),
          req("Feasibility study", "gazExtractionFeasibilityStudy"),
        ],
      };

    // Annex K (Livestock)
    case "livestock":
      return {
        annexTitle: "ANNEX K (Only for Livestock)",
        attachments: [
          req("General requirements", "livestockGeneralRequirements"),
          req("Feasibility study", "livestockFeasibilityStudy"),
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
  ctx: { irrigationTotalArea?: number }
) {
  const selected = Array.isArray(selectedActivities) ? selectedActivities : [];
  return selected
    .filter((a) => typeof a === "string" && a.trim() !== "")
    .map((a) => ({ activity: a, requirement: getAnnexRequirementForActivity(a, ctx) }))
    .filter((x) => x.requirement.attachments.length > 0);
}

export function getRequiredAttachmentFieldNames(
  selectedActivities: string[] | undefined,
  ctx: { irrigationTotalArea?: number }
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


