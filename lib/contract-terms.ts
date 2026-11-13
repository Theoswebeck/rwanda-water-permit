import type { PermitVariant } from "@/lib/permit-variant";

export type ContractTermsSection = {
  title: string;
  paragraphs: string[];
};

export type ContractTerms = {
  heading: string;
  subheading?: string;
  sections: ContractTermsSection[];
  importantNotice?: {
    title: string;
    body: string;
  };
};

export type ContractTermsLanguage = "en" | "rw";

export function getContractSectionLanguage(title: string): ContractTermsLanguage {
  const normalized = title.trim();
  if (!normalized) return "en";

  if (
    normalized.toUpperCase().includes("KINYARWANDA") ||
    normalized.startsWith("AMASEZERANO") ||
    normalized.startsWith("IGICE") ||
    normalized.startsWith("Ingingo") ||
    normalized.startsWith("Ibisobanuro") ||
    normalized.startsWith("Imikono")
  ) {
    return "rw";
  }

  return "en";
}

export function splitContractSectionsByLanguage(sections: ContractTermsSection[]): {
  englishSections: ContractTermsSection[];
  kinyarwandaSections: ContractTermsSection[];
} {
  return sections.reduce(
    (acc, section) => {
      if (getContractSectionLanguage(section.title) === "rw") {
        acc.kinyarwandaSections.push(section);
      } else {
        acc.englishSections.push(section);
      }
      return acc;
    },
    {
      englishSections: [] as ContractTermsSection[],
      kinyarwandaSections: [] as ContractTermsSection[],
    }
  );
}

export function parseSectionHeading(title: string): {
  partHeading: string | null;
  articleHeading: string;
} {
  const parts = title.split("—").map((segment) => segment.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { partHeading: null, articleHeading: title };
  }

  const [candidatePart, ...rest] = parts;
  const isPartHeading = /^(PART|IGICE)\b/i.test(candidatePart);
  if (!isPartHeading || rest.length === 0) {
    return { partHeading: null, articleHeading: title };
  }

  return {
    partHeading: candidatePart,
    articleHeading: rest.join(" — "),
  };
}

// NOTE: We'll progressively fill these with the real contract text per variant.
export const contractTermsByVariant: Record<PermitVariant, ContractTerms | null> = {
  abstraction_individual: {
    heading: "CONTRACT RELATING TO WATER USE PERMIT",
    subheading: "The fields in this contract are auto-filled from your application details.",
    sections: [
      {
        title: "Preamble",
        paragraphs: [
          "CONTRACT RELATING TO WATER USE PERMIT",
          "Contract No {{CONTRACT_NUMBER}}",
          "This contract is made and entered into by and between the Director General of Rwanda Water Resources Board, and hereafter referred to as the (“Director General \") on the one hand;",
          "AND",
          "“NAME OF APPLICANT”, with ID No. XXXXXXXXXXXXXXXX, and hereafter referred to as the (“Water User”) on the other hand;",
          "And all these hereafter collectively referred to as Parties;",
          "Agree as follows:",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article one: Basis of the contract",
        paragraphs: [
          "This contract is concluded in accordance with Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda, and will follow other relevant laws and regulations of the Government of Rwanda.",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 2: Object of the Contract",
        paragraphs: [
          "This Contract is relating to the grant of a Water Use Permit in respect of the provisions of the above-mentioned law and this contract. It thus regulates the rights and obligations of the Parties resulting from the Permit.",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 3: Duration of Water Use Permit",
        paragraphs: [
          "1. The permit will, unless terminated earlier in accordance with the provisions hereof, be for a period of XXX (Number) years calculated with effect from the Commencement Date of this Contract.",
          "2. The Water User can request to extend the duration of the water use permit to the Director General, at least three (3) months prior to expiration of the period referred to in paragraph (1) of this Article.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 4: Right to abstract and use water",
        paragraphs: [
          "1. The Water User is allowed to abstract water from {{WATER_SOURCE_NAME}} located in {{PROVINCE_LABEL}}, {{DISTRICT}} District, {{SECTOR}} Sector, {{CELL}} Cell, {{VILLAGE}} Village at Latitude: {{LAT}}°, Longitude: {{LNG}}°, by {{SYSTEM_TYPE_EN}} with a flow rate of {{VOLUME_LABEL}}.",
          "2. The water abstracted shall be used solely for the {{ACTIVITY_LABEL}} project located in {{SECTOR}} Sector, {{DISTRICT}} District, on a command area of {{COMMAND_AREA}}, in accordance with the Project Documentation which constitutes an integral part of this Contract.",
          "3. The Water User understands and acknowledges that the water from XXXX (NAME OF WATER SOURCE) is multi-purpose water resource and may be subject to other plans as long as that will not affect the use to which water will be put.",
          "4. The Director General makes no guarantee as to the availability, suitability, purity, portability, or fitness of the water to meet Water User’s activities.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 5: Fees to be paid",
        paragraphs: [
          "The Water User shall pay fees in accordance with the provisions of the water Law N°49/2018 of 13/08/2018 determining the use and management of water resources.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 6: Obligation for Environment Protection",
        paragraphs: [
          "1. The Water User must comply with all laws and regulations relating to environmental protection and shall comply with standards in relation to wastewater disposal into water bodies as established by the competent Authority. Particularly the Water User has the duty to protect the catchment area of his operations.",
          "2. The Water User shall use the highest degree of care and all proper safeguards to prevent land or water pollution resulting from the Project activities. The Water User shall use all means at his or her disposal to recapture all escaping pollutants and shall be solely responsible for all damages, if any that may result from any such land, air or water pollution occasioned by his or her operations as provided for by the laws.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 7: Assignment or transfer of the Authorization",
        paragraphs: [
          "The Water User may not assign or transfer the Water Use Permit subject to this Contract, fully or partially, without prior consent by the Director General in writing. Any purported assignment or transfer without such prior written approval by the Director General shall be null and void and deemed to be an event of default of obligations and a reason for termination of this Contract.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 8: Deviation from the water use",
        paragraphs: [
          "If the Water User desires to deviate from the initial plan of the water use in any manner, he/she must request for an amendment of this contract, or enter into a new contract, to encompass the deviations from the initial plan.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 9: Records keeping",
        paragraphs: [
          "The Water User must keep all records related to the use and management of water and produce them for inspection whenever required.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 10: Duty to Provide Information",
        paragraphs: [
          "The Water User must provide needed information related to the water use to the Director General whenever required. The Water User shall provide to the Director General, authorized representatives of the Director General or experts hired by the Director General with all necessary information during the lifetime of the Water Use Permit.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 11: Obligations of the Director General",
        paragraphs: [
          "During the implementation of this contract the obligations of the Director General will be the following:",
          "1. To follow up on the implementation of this contract",
          "2. To participate actively in conflict settlement arising from the implementation of this contract;",
          "3. Control whether the activities of Water User in respect of Water Use Permit comply with Laws and regulations relating to the use and management of water resources.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 12: Access for inspection or monitoring",
        paragraphs: [
          "The Director General, authorized representatives of the Director General or experts hired by the Director General shall be entitled to have access to the Water User’s operations and records, for purposes including ascertaining the use to which water is being put, inspecting water measurement devices, auditing payment, for the limited purpose of ensuring compliance with laws and this contract. The same right shall be entitled to competent local authorities.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 13: Right to suspend the Water Use Permit",
        paragraphs: [
          "The Director General shall have the right to suspend the Water Use Permit for a specified period during which the Water User is required to redress identified issues or when necessary to protect the water source or to prevent substantial damage to the environment or ecological resources.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 14: Cancellation of the Water Use Permit and Termination of the Contract",
        paragraphs: [
          "1. The Water Use Permit shall be cancelled at the expiration date of the duration for which it has been granted provided that the Water Use Permit is not extended in compliance with Article 3 paragraph 2 of this Contract.",
          "2. This contract shall also be totally cancelled for non-execution of proposed works or if the project is abandoned during a continuous period of three (3) years, or if the Director General finds that the Water User is in violation of the terms and conditions of this Contract, the Law determining the use and management of water resources or other relevant laws and regulations or the Water User willfully used wrong information for the purpose of obtaining the Water Use Permit.",
          "3. The Director General reserves the right to cancel the Water Use Permit if there is any significant reduction in the water level of the water source which may adversely affect the priority use of water as provided by the water law.",
          "4. Any action of the Director General relating to the suspension or cancellation of the Water Use Permit or termination of the contract shall be preceded by a written Notice (Suspension/Termination Notice) addressed to the Water User fifteen (15) days prior to the effective date of the proposed action.",
          "5. Upon termination of this Contract, the Water User shall leave the water resources in the same good order as the resources were in at the commencement of this Contract, including restoration of landscape where necessary.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 15: Contract amendment",
        paragraphs: [
          "This contract may be amended only by an Annex to this contract in writing approved by the Parties.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 16: Settlement of disputes",
        paragraphs: [
          "1. If any dispute arises from the implementation of the present contract, the aggrieved Party notifies the other Party in writing.",
          "2. If any dispute arises in connection with this contract, the Parties shall use their best efforts to settle the dispute amicably.",
          "3. If the Parties cannot settle the dispute amicably within thirty (30) days, the matter shall be referred to national courts of competent jurisdiction.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 17: Governing law",
        paragraphs: [
          "This Agreement shall be governed by and construed in accordance with the laws of the Republic of Rwanda.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 18: Commencement Date",
        paragraphs: [
          "This contract takes effect on the date of signature by the Director General.",
        ],
      },
      {
        title: "Signatures",
        paragraphs: [
          "The DIRECTOR GENERAL:",
          "The WATER USER:",
          "Signature",
          "",
          "Name: Dr. Emmanuel RUKUNDO",
          "Name: NAME OF APPLICANT",
          "Position: Director General",
          "",
          "Date: ……………………………",
        ],
      },

      // Kinyarwanda version
      {
        title: "AMASEZERANO YEREKEYE URUHUSHYA RWO GUKORESHA AMAZI",
        paragraphs: ["Contract No {{CONTRACT_NUMBER}}"],
      },
      {
        title: "Ibisobanuro rusange (Preamble)",
        paragraphs: [
          "Aya masezerano akozwe hagati ya Umuyobozi Mukuru w’Ikigo Gishinzwe Umutungo Kamere w’Amazi mu Rwanda, muri aya masezerano witwa (“Umuyobozi Mukuru”) ku ruhande rumwe;",
          "Na",
          "“ XXXX (IZINA RY’USABA)” ufite Nomero y’ Indangamuntu: XXXXXXXXXXXXXXXX, muri aya masezerano witwa “Ukoresha amazi” ku rundi ruhande;",
          'Muri aya masezerano igihe bavugiwe hamwe bitwa "Impande zombi"',
          "Bemeranyijwe ibi bikurikira:",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya mbere: Ishingiro ry’amasezerano",
        paragraphs: [
          "Aya masezerano yakozwe hakurikijwe itegeko No 49/2018 ryo ku wa 13/08/2018 rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi mu Rwanda. Aya masezerano kandi azubahiriza andi mategeko n’ amabwiriza bya Guverinoma y’ u Rwanda",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya 2: Impamvu y’amasezerano",
        paragraphs: [
          "Aya masezerano yerekeye ugutanga uruhushya rwo gukoresha amazi (muri aya mazerano rwitwa “Uruhushya”) hashingiwe ku itegeko ryavuzwe hejuru n’aya masezerano. Agenga uburenganzira n’inshingano by’impande zombi bikomoka ku ruhushya",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya 3: Igihe uruhushya ruzamara",
        paragraphs: [
          "1. Uruhushya ruzamara igihe kingana n’imyaka XXXX (IMYAKA URUHUSHYA RUZAMARA) keretse ruteshejwe agaciro mbere hakurikijwe ingingo zibigenga, ibarwa uhereye itariki aya masezerano yagiriyeho agaciro.",
          "2.Ukoresha amazi ashobora gusaba Umuyobozi Mukuru kongera igihe uruhushya ruzamara habura nibura amezi atatu (3) ngo ruramgire.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 4: Uburenganzira bwo gufata amazi no kuyakoresha",
        paragraphs: [
          "1. Ukoresha amazi yemerewe gukoresha amazi angana na m3 XXX ku mwaka, ava mu XXXXXX (IZINA RY’ISOKO Y’AMAZI) gaherereye mu Intara y' XXX, Akarere ka XXX, Umurenge wa XXX, Akagari ka XXX, Umudugudu w’ XXX kuri Latitide (Latitude): -1.960354°, Lonjitide (Longitude): 30.488364°.",
          "2. Amazi yafashwe azakoreshwa gusa mu bikorwa (IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA) biherereye mu Murenge wa {{SECTOR}}, Akarere ka {{DISTRICT}}, ku buso bwa {{COMMAND_AREA}}, nk’uko bigaragazwa n’inyandiko z’umushinga zigize kandi igice cy’aya masezerano.",
          "3. Ukoresha amazi yemera ko amazi ava mu XXXXXX (IZINA RY’ISOKO Y’AMAZI) akoreshwa mu buryo rusange kandi ko ashobora gusaranganywa mu gihe cyose bitagize uwo bibangamira.",
          "4. Umuyobozi Mukuru ntiyishingira ingano n’ ubuziranenge by’ amazi bikenewe n’ ukoresha amazi mu mirimo ye.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 5: Amafaranga yishyurwa",
        paragraphs: [
          "Ukoresha amazi yishyura amafaranga hakurikijwe ibiteganywa n’itegeko No 49/2018 ryo ku wa 13/08/2018 rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 6: Inshingano yo kurengera ibidukikije",
        paragraphs: [
          "1. Ukoresha amazi agomba kubahiriza amategeko n’amabwiriza ajyanye no kurengera ibidukikije akubahiriza kandi n’ibipimo ngenderwaho mu gutunganya amazi yanduye asubizwa mu mazi yirundiye hamwe nk’uko byemejwe n’ubuyobozi bubifitiye ububasha. By’umwihariko ukoresha amazi afite inshingano yo kurinda icyogogo akoreramo.",
          "2. Ukoresha amazi akoresha uburyo bwose bukwiriye bwo kwita no kubuza ibyanduza ubutaka n’amazi byakomoka ku bikorwa by’umushinga we. Ukoresha amazi kandi yishingira ibyangiritse iyo kwandura k’ubutaka, umwuka cyangwa amazi byakomotse ku bikorwa bye nk’ uko amategeko abiteganya.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 7: Gutanga cyangwa guhererekanya uruhushya",
        paragraphs: [
          "Ukoresha amazi ntashobora gutanga cyangwa guhererekanya Uruhushya ruvugwa muri aya masezerano atabyemerewe n’Umuyobozi Mukuru mu nyandiko. Ibikorwa byo gutanga cyangwa guhererekanya Uruhushya bitabanje kwemezwa n’Umuyobozi Mukuru ni impfabusa, bifatwa nko kutubahiriza aya masezerano kandi ni impamvu zatuma aseswa.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 8: Guhindura imikoreshereze y’ amazi",
        paragraphs: [
          "Ukoresha amazi wifuza guhindura imikoreshereze y’ amazi agomba gusaba guhindura aya masezerano, hagakorwa andi masezerano mashya agaragaza ibigomba guhinduka.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 9: Kubika amakuru",
        paragraphs: [
          "Ukoresha amazi agomba kubika amakuru yose ajyanye no gukoresha no gucunga amazi kandi akayatanga mu igenzura n’igihe cyose bibaye ngombwa.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 10: Inshingano yo gutanga amakuru",
        paragraphs: [
          "Ukoresha amazi agomba gutanga amakuru ajyanye n’ imikoreshereze y’ amazi ku Umuyobozi Mukuru mu gihe cyose bibaye ngombwa. Ukoresha Amazi aha Umuyobozi Mukuru, abahagarariye Umuyobozi Mukuru bemewe cyangwa impuguke zahawe akazi n’Umuyobozi Mukuru amakuru yose akenewe mu gihe cyose bahawemo uruhushya.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’INSHINGANO BY’UMUYOBOZI MUKURU — Ingingo ya 11: Inshingano z’Umuyobozi Mukuru",
        paragraphs: [
          "Mu gihe cyo gushyira mu bikorwa aya masezerano inshingano z'Umuyobozi Mukuru ni izi zikurikira:",
          "1. Gukurikirana ishyirwa mu bikorwa ry’aya masezerano;",
          "2. Kugira uruhare mu gukemura amakimbirane yavuka mu ishyirwamubikorwa ry’aya masezerano",
          "3.Kugenzura niba ibikorwa by’ukoresha amazi byubahiriza amategeko n’amabwiriza yerekeye imikoreshereze n’imicungire y’umutungo kamere w’amazi",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’INSHINGANO BY’UMUYOBOZI MUKURU — Ingingo ya 12: Ubugenzuzi cyangwa Ikurikirana bw’ imikoreshereze y’ uruhushya",
        paragraphs: [
          "Umuyobozi Mukuru, abahagarariye Umuyobozi Mukuru bemewe cyangwa impuguke zahawe akazi n’Umuyobozi Mukuru bafite uburenganzira bwo kugera ku bikorwa by’ukoresha amazi, hagamijwe kumenya imikoreshereze y’amazi, kugenzura ibikoresho bipima amazi, kugenzura ubwishyu, hagamijwe kumenya niba amategeko n’aya masezerano byubahirizwa. Ubwo burenganzira kandi bushobora guhabwa inzego z’ibanze zibifitiye ububasha.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’INSHINGANO BY’UMUYOBOZI MUKURU — Ingingo ya 13: Uburenganzira bwo guhagarika Uruhushya",
        paragraphs: [
          "Umuyobozi Mukuru afite uburenganzira bwo guhagarika Uruhushya mu gihe runaka igihe ukoresha amazi yasabwe gukemura ibibazo byagaragaye cyangwa igihe bibaye ngombwa kurinda amasoko cyangwa gukumira ukwangirika ku bidukikije cyangwa kw’urusobe rw’ibinyabuzima.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’INSHINGANO BY’UMUYOBOZI MUKURU — Ingingo ya 14: Gutesha agaciro uruhushya no guhagarika amasezeno",
        paragraphs: [
          "1.Uruhushya ruta agaciro ku munsi rurangiriyeho mugihe rutongerewe igihe, hubahirijwe ibikubiye mu Ingingo ya 3 y’ cy'aya masezerano.",
          "2. Uruhushya ruteshwa agaciro burundu igihe habayeho kudakora imirimo yateganyijwe mu gihe gikurikirana cy’imyaka Itatu (3) cyangwa igihe Umuyobozi Mukuru asanze uwahawe uruhushya atubahiriza ibikubiye muri aya masezerano, itegeko rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi mu Rwanda cyangwa andi mategeko n’amabwiriza abigenga cyangwa uwahawe uruhushya yaratanze abishaka amakuru atariyo kugirango ahabwe uruhushya.",
          "3. Umuyobozi Mukuru afite uburenganzira bwo gutesha agaciro Uruhushya igihe hari igabanuka rikabije ry’ingano y’amazi mw’isoko ry’amazi rishobora kubangamira imikoreshereze y’ amazi nkuko amategeko abiteganya",
          "4. Icyemezo cy’Umuyobozi Mukuru cyerekeranye no guhagarika uruhushya cyangwa gusesa aya masezerano kibanzirizwa n’integuza yandikiwe ukoresha amazi mu iminsi cumi n'itanu (15) mbere y’itariki yo gufata umwanzuro.",
          "5. Iyo Amasezerano arangiye ukoresha amazi agomba gusiga umutungo kamere w’amazi nk’uko wari umeze mbere y’itangira ry’aya masezerano, harimo no gusubiranya ubutaka igihe bibaye ngombwa.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 15: Guhindura amasezerano",
        paragraphs: [
          "Aya masezerano ashobora guhindurwa gusa numugereka wamasezerano wanditse byemejwe n’impande zombi.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 16: Gukemura amakimbirane",
        paragraphs: [
          "1.Amakimbirane azavuka mu ishyirwa mubikorwa ry’aya masezerano, uruhande rubangamiwe rumenyesha urundi mu nyandiko.",
          "2. Amakimbirane yose azavuka ajyanye n’aya masezerano, impande zombi zikora ibishoboka byose muyakemura mu bwumvikane.",
          "3. Igihe amakimbirane adakemuwe mu bwumvikane mu gihe cy’iminsi 30, uruhande rubangamiwe rushyikiriza ikirego urukiko rubifitiye ububasha",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 17: Amategeko agenga",
        paragraphs: [
          "Aya masezerano azagengwa kandi asobanurwe hakurikijwe amategeko ya Repubulika y'u Rwanda.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 18: Igihe amasezerano atangira gukurikizwa",
        paragraphs: [
          "Aya masezerano atangira gukurikizwa ku munsi yashyizweho umukono n’Umuyobozi Mukuru.",
        ],
      },
      {
        title: "Imikono (Signatures)",
        paragraphs: [
          "UMUYOBOZI MUKURU:",
          "UKORESHA AMAZI:",
          "Umukono: ……………………",
          "Umukono: ……………………",
          "Izina: Dr. Emmanuel RUKUNDO",
          "Izina: (IZINA RY’USABA)",
          "Icyo akora: Umuyobozi Mukuru",
          "",
          "Itariki: ……………………………",
        ],
      },
    ],
    importantNotice: {
      title: "Important Notice",
      body: "By accepting these terms, you acknowledge that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.",
    },
  },
  abstraction_organization: {
    heading: "CONTRACT RELATING TO WATER USE PERMIT",
    subheading: "The fields in this contract are auto-filled from your application details.",
    sections: [
      {
        title: "Preamble",
        paragraphs: [
          "CONTRACT RELATING TO WATER USE PERMIT",
          "No {{CONTRACT_NUMBER}}",
          "This Contract is made and entered into by and between the Director General of Rwanda Water Resources Board, and hereafter referred to as the (“Director General \") on the one hand;",
          "AND",
          "“XXXXX (NAME OF ORGANIZATION)”, with its registered office address as follows: XXX Sector, XXX District, XXX Province; represented by XXXX (NAME OF REPRESENTATIVE) “TITLE OF REPRESENTATIVE”, and hereafter referred to as the (“Water User”) on the other hand;",
          "And all these hereafter collectively referred to as Parties;",
          "Agree as follows:",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article one: Basis of the contract",
        paragraphs: [
          "This contract is concluded in accordance with Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda and will follow other relevant laws and regulations of the Government of Rwanda.",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 2: Object of the Contract",
        paragraphs: [
          "This Contract is relating to the grant of a Water Use Permit in respect of the provisions of the above-mentioned law and this contract. It thus regulates the rights and obligations of the Parties resulting from the Permit.",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 3: Duration of Water Use Permit",
        paragraphs: [
          "1. The permit will, unless terminated earlier in accordance with the provisions hereof, be for a period of XXXX (NUMBER) years calculated with effect from the Commencement Date of this Contract.",
          "2. The Water User can request to extend the duration of the water use permit to the Director General, at least three (3) months prior to expiration of the period referred to in paragraph (1) of this Article.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 4: Right to abstract and use water",
        paragraphs: [
          "1. The Water User is allowed to abstract water from {{WATER_SOURCE_NAME}} on its part located in {{PROVINCE_LABEL}}, {{DISTRICT}} District, {{SECTOR}} Sector, {{CELL}} Cell, {{VILLAGE}} Village at Latitude: {{LAT}}°, Longitude: {{LNG}}°, by {{SYSTEM_TYPE_EN}} with a flow rate of {{VOLUME_LABEL}}.",
          "2. The water abstracted shall be used solely for the {{ACTIVITY_LABEL}} project located in {{SECTOR}} Sector, {{DISTRICT}} District, on a command area of {{COMMAND_AREA}}, in accordance with the Project Documentation which constitutes an integral part of this Contract.",
          "3. The Water User understands and acknowledges that the water from {{WATER_SOURCE_NAME}} is a multi-purpose water resource and may be subject to other plans as long as that will not affect the use to which water will be put.",
          "4. The Director General makes no guarantee as to the availability, suitability, purity, portability, or fitness of the water to meet Water User’s activities.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 5: Fees to be paid",
        paragraphs: [
          "The Water User shall pay fees in accordance with the provisions of the Water Law N°49/2018 of 13/08/2018 determining the use and management of water resources.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 6: Obligation for Environment Protection",
        paragraphs: [
          "1. The Water User must comply with all laws and regulations relating to environmental protection and shall comply with standards in relation to wastewater disposal into water bodies as established by the competent Authority. Particularly the Water User has the duty to protect the catchment area of his operations.",
          "2. The Water User shall use the highest degree of care and all proper safeguards to prevent land or water pollution resulting from the Project activities. The Water User shall use all means at his or her disposal to recapture all escaping pollutants and shall be solely responsible for all damages, if any that may result from any such land, air or water pollution occasioned by his or her operations as provided for by the laws.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 7: Assignment or transfer of the Authorization",
        paragraphs: [
          "The Water User may not assign or transfer the Water Use Permit subject to this Contract, fully or partially, without prior consent by the Director General in writing. Any purported assignment or transfer without such prior written approval by the Director General shall be null and void and deemed to be an event of default of obligations and a reason for termination of this Contract.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 8: Deviation from the water use",
        paragraphs: [
          "If the Water User desires to deviate from the initial plan of the water use in any manner, he/she must request an amendment of this contract or enter into a new contract to encompass the deviations from the initial plan.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 9: Other people’s rights and access to water",
        paragraphs: [
          "1. The Water User may not take any action that restricts the right of the public to reasonably use the Water Resources, including, without limitation, the right to fetch water for domestic use and livestock.",
          "2. The issuance of a Water Use Permit does not authorize any injury to private or public property nor any invasion of personal rights, or any infringement of any applicable law. The Water User shall be responsible for securing authorization, easements, rights-of-way, leases or permission of land owners to obtain access to the locations specified in the Water Use Permit and all land and properties necessary for diversion purposes prior to commencing proposed works.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 10: Records keeping",
        paragraphs: [
          "The Water User must keep all records related to the use and management of water and produce them for inspection whenever required.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 11: Duty to Provide Information",
        paragraphs: [
          "The Water User must provide needed information related to the water use to the Director General whenever required. The Water User shall provide to the Director General, authorized representatives of the Director General or experts hired by the Director General with all necessary information during the lifetime of the Water Use Permit.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 12: Obligations of the Director General",
        paragraphs: [
          "During the implementation of this contract the obligations of the Director General will be the following:",
          "1. To follow up on the implementation of this contract",
          "2. To participate actively in conflict settlement arising from the implementation of this contract;",
          "3. Control whether the activities of Water User in respect of Water Use Permit comply with Laws and regulations relating to the use and management of water resources.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 13: Access for inspection or monitoring",
        paragraphs: [
          "The Director General, authorized representatives of the Director General or experts hired by the Director General shall be entitled to have access to the Water User’s operations and records, for purposes including ascertaining the use to which water is being put, inspecting water measurement devices, auditing payment, for the limited purpose of ensuring compliance with laws and this contract. The same right shall be entitled to competent local authorities.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 14: Right to suspend the Water Use Permit",
        paragraphs: [
          "The Director General shall have the right to suspend the Water Use Permit for a specified period during which the Water User is required to redress identified issues or when necessary to protect the water source or to prevent substantial damage to the environment or ecological resources.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 15: Cancellation of the Water Use Permit and Termination of the Contract",
        paragraphs: [
          "1. The Water Use Permit shall be cancelled at the expiration date of the duration for which it has been granted provided that the Water Use Permit is not extended in compliance with Article 3 paragraph 2 of this Contract.",
          "2. This contract shall also be totally cancelled for non-execution of proposed works or if the project is abandoned during a continuous period of three (3) years, or if the Director General finds that the Water User is in violation of the terms and conditions of this Contract, the Law determining the use and management of water resources or other relevant laws and regulations or the Water User willfully used wrong information for the purpose of obtaining the Water Use Permit.",
          "3. The Director General reserves the right to cancel the Water Use Permit if there is any significant reduction in the water level of the water source which may adversely affect the priority use of water as provided by the water law.",
          "4. Any action of the Director General relating to the suspension or cancellation of the Water Use Permit or termination of the contract shall be preceded by a written Notice (Suspension/Termination Notice) addressed to the Water User fifteen (15) days prior to the effective date of the proposed action.",
          "6. Upon termination of this Contract, the Water User shall leave the water resources in the same good order as the resources were in at the commencement of this Contract, including restoration of landscape where necessary.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 16: Contract amendment",
        paragraphs: [
          "This contract may be amended only by an Annex to this contract in writing approved by the Parties.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 17: Settlement of disputes",
        paragraphs: [
          "1. If any dispute arises from the implementation of the present contract, the aggrieved Party notifies the other Party in writing.",
          "2. If any dispute arises in connection with this contract, the Parties shall use their best efforts to settle the dispute amicably.",
          "3. If the Parties cannot settle the dispute amicably within thirty (30) days, the matter shall be referred to national courts of competent jurisdiction.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 18: Governing law",
        paragraphs: [
          "This Agreement shall be governed by and construed in accordance with the laws of the Republic of Rwanda.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 19: Commencement Date",
        paragraphs: ["This contract takes effect on the date of signature by the Director General."],
      },
      {
        title: "Signatures",
        paragraphs: [
          "The DIRECTOR GENERAL:",
          "The WATER USER:",
          "Signature: ……………………",
          "Signature: ……………………",
          "",
          "Name: Dr. Emmanuel RUKUNDO",
          "Name: XXXXXX (NAME OF REPRESENTATIVE)",
          "Title: Director General",
          "Title/ Icyo akora: XXXXXXXX",
          "Date: ……………………………",
        ],
      },

      // Kinyarwanda version
      {
        title: "AMASEZERANO YEREKEYE URUHUSHYA RWO GUKORESHA AMAZI",
        paragraphs: ["No {{CONTRACT_NUMBER}}"],
      },
      {
        title: "Ibisobanuro rusange (Preamble)",
        paragraphs: [
          "Aya masezerano akozwe hagati ya Umuyobozi Mukuru w’Ikigo Gishinzwe Umutungo Kamere w’Amazi mu Rwanda, muri aya masezerano witwa (“Umuyobozi Mukuru”) ku ruhande rumwe;",
          "Na",
          "“(IZINA RY’ IKIGO/KOPERATIVE/ IKOMPANYI N’IBINDI CYASABYE)”, ifite ibiro biherereye mu Umurenge wa XXXXX, Akarere ka XXXX, Intara y' XXXX; ihagarariwe na XXX (IZINA RY’UHAGARARIYE IKIGO “ICYO ASHINZWE”, muri aya masezerano witwa “Ukoresha amazi” ku rundi ruhande;",
          "Muri aya masezerano igihe bavugiwe hamwe bitwa “Impande zombi”",
          "Bemeranyijwe ibi bikurikira:",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya mbere: Ishingiro ry’amasezerano",
        paragraphs: [
          "Aya masezerano yakozwe hakurikijwe itegeko No 49/2018 ryo ku wa 13/08/2018 rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi mu Rwanda. Aya masezerano kandi azubahiriza andi mategeko n’ amabwiriza bya Guverinoma y’ u Rwanda",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya 2: Impamvu y’amasezerano",
        paragraphs: [
          "Aya masezerano yerekeye ugutanga uruhushya rwo gukoresha amazi (muri aya mazerano rwitwa “Uruhushya”) hashingiwe ku itegeko ryavuzwe hejuru n’aya masezerano. Agenga uburenganzira n’inshingano by’impande zombi bikomoka ku ruhushya",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya 3: Igihe uruhushya ruzamara",
        paragraphs: [
          "1.Uruhushya ruzamara igihe kingana n’ imyaka XXX (IGIHE URUHUSHYA RUZAMARA) keretse ruteshejwe agaciro mbere hakurikijwe ingingo zibigenga, ibarwa uhereye itariki aya masezerano yagiriyeho agaciro.",
          "2.Ukoresha amazi ashobora gusaba Umuyobozi Mukuru kongera igihe uruhushya ruzamara habura nibura amezi atatu (3) ngo ruramgire.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 4: Uburenganzira bwo gufata amazi no kuyakoresha",
        paragraphs: [
          "1. Ukoresha amazi yemerewe gukoresha amazi ava mu {{WATER_SOURCE_NAME}} mu gice cyacyo giherereye mu Intara y' {{PROVINCE_LABEL}}, Akarere ka {{DISTRICT}}, Umurenge wa {{SECTOR}}, Akagari ka {{CELL}}, Umudugudu wa {{VILLAGE}} kuri Latitide (Latitude): {{LAT}}°, Lonjitide (Longitude): {{LNG}}°, hakoreshejwe uburyo bwa {{SYSTEM_TYPE_RW}} ku gipimo cya {{VOLUME_LABEL}}.",
          "2. Amazi yafashwe azakoreshwa gusa mu bikorwa (IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA) biherereye mu Murenge wa {{SECTOR}}, Akarere ka {{DISTRICT}}, ku buso bwa {{COMMAND_AREA}}, nk’uko bigaragazwa n’inyandiko z’umushinga zigize kandi igice cy’aya masezerano.",
          "3. Ukoresha amazi yemera ko amazi ava mu {{WATER_SOURCE_NAME}} akoreshwa mu buryo rusange kandi ko ashobora gusaranganywa mu gihe cyose bitagize uwo bibangamira.",
          "4. Umuyobozi Mukuru ntiyishingira ingano n’ ubuziranenge by’ amazi bikenewe n’ ukoresha amazi mu mirimo ye.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 5: Amafaranga yishyurwa",
        paragraphs: [
          "Ukoresha amazi yishyura amafaranga hakurikijwe ibiteganywa n’itegeko No 49/2018 ryo ku wa 13/08/2018 rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 6: Inshingano yo kurengera ibidukikije",
        paragraphs: [
          "1. Ukoresha amazi agomba kubahiriza amategeko n’amabwiriza ajyanye no kurengera ibidukikije akubahiriza kandi n’ibipimo ngenderwaho mu gutunganya amazi yanduye asubizwa mu mazi yirundiye hamwe nk’uko byemejwe n’ubuyobozi bubifitiye ububasha. By’umwihariko ukoresha amazi afite inshingano yo kurinda icyogogo akoreramo.",
          "2. Ukoresha amazi akoresha uburyo bwose bukwiriye bwo kwita no kubuza ibyanduza ubutaka n’amazi byakomoka ku bikorwa by’umushinga we. Ukoresha amazi kandi yishingira ibyangiritse iyo kwandura k’ubutaka, umwuka cyangwa amazi byakomotse ku bikorwa bye nk’ uko amategeko abiteganya.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 7: Gutanga cyangwa guhererekanya uruhushya",
        paragraphs: [
          "Ukoresha amazi ntashobora gutanga cyangwa guhererekanya Uruhushya ruvugwa muri aya masezerano atabyemerewe n’Umuyobozi Mukuru mu nyandiko. Ibikorwa byo gutanga cyangwa guhererekanya Uruhushya bitabanje kwemezwa n’Umuyobozi Mukuru ni impfabusa, bifatwa nko kutubahiriza aya masezerano kandi ni impamvu zatuma aseswa.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 8: Guhindura imikoreshereze y’ amazi",
        paragraphs: [
          "Ukoresha amazi wifuza guhindura imikoreshereze y’ amazi agomba gusaba guhindura aya masezerano, hagakorwa andi masezerano mashya agaragaza ibigomba guhinduka.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 9: Uburenganzira bw’abandi bantu bwo kugera ku mazi",
        paragraphs: [
          "1.Ukoresha amazi ntashobora gukora ibikorwa bibuza uburenganzira abandi bantu bwo gukoresha umutungo kamere w’amazi, harimo kuvoma amazi akoreshwa murugo no kuhira amatungo.",
          "2. Itangwa ry'Uruhushya ntiritanga uburenganzira bwo kwangiza imitungo y’abantu ku giti cyabo cyangwa iya Leta cyangwa kunyuranya n’amategeko ariho. Ukoresha amazi agomba kuba afite inzira cyangwa ubureganzira bw’abanyirubutaka bumwemererera kugera aho akorera cyangwa aho akura amazi, mbere y’uko atangira imirimo ye.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 10: Kubika amakuru",
        paragraphs: [
          "Ukoresha amazi agomba kubika amakuru yose ajyanye no gukoresha no gucunga amazi kandi akayatanga mu igenzura n’igihe cyose bibaye ngombwa.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 11: Inshingano yo gutanga amakuru",
        paragraphs: [
          "Ukoresha amazi agomba gutanga amakuru ajyanye n’ imikoreshereze y’ amazi ku Umuyobozi Mukuru mu gihe cyose bibaye ngombwa. Ukoresha Amazi aha Umuyobozi Mukuru, abahagarariye Umuyobozi Mukuru bemewe cyangwa impuguke zahawe akazi n’Umuyobozi Mukuru amakuru yose akenewe mu gihe cyose bahawemo uruhushya.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’INSHINGANO BY’UMUYOBOZI MUKURU — Ingingo ya 12: Inshingano z’Umuyobozi Mukuru",
        paragraphs: [
          "Mu gihe cyo gushyira mu bikorwa aya masezerano inshingano z'Umuyobozi Mukuru ni izi  zikurikira:",
          "1. Gukurikirana ishyirwa mu bikorwa ry’aya masezerano;",
          "2. Kugira uruhare mu gukemura amakimbirane yavuka mu ishyirwamubikorwa ry’aya masezerano",
          "3.Kugenzura niba ibikorwa by’ukoresha amazi byubahiriza amategeko n’amabwiriza yerekeye imikoreshereze n’imicungire y’umutungo kamere w’amazi",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’INSHINGANO BY’UMUYOBOZI MUKURU — Ingingo ya 13: Ubugenzuzi cyangwa Ikurikirana bw’ imikoreshereze y’ uruhushya",
        paragraphs: [
          "Umuyobozi Mukuru, abahagarariye Umuyobozi Mukuru bemewe cyangwa impuguke zahawe akazi n’Umuyobozi Mukuru bafite uburenganzira bwo kugera ku bikorwa by’ukoresha amazi, hagamijwe kumenya imikoreshereze y’amazi, kugenzura ibikoresho bipima amazi, kugenzura ubwishyu, hagamijwe kumenya niba amategeko n’aya masezerano byubahirizwa. Ubwo burenganzira kandi bushobora guhabwa inzego z’ibanze zibifitiye ububasha.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’INSHINGANO BY’UMUYOBOZI MUKURU — Ingingo ya 14: Uburenganzira bwo guhagarika Uruhushya",
        paragraphs: [
          "Umuyobozi Mukuru afite uburenganzira bwo guhagarika Uruhushya mu gihe runaka igihe ukoresha amazi yasabwe gukemura ibibazo byagaragaye cyangwa igihe bibaye ngombwa kurinda amasoko cyangwa gukumira ukwangirika ku bidukikije cyangwa kw’urusobe rw’ibinyabuzima.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’INSHINGANO BY’UMUYOBOZI MUKURU — Ingingo ya 15: Gutesha agaciro uruhushya no guhagarika amasezeno",
        paragraphs: [
          "1.Uruhushya ruta agaciro ku munsi rurangiriyeho mugihe rutongerewe igihe, hubahirijwe ibikubiye mu Ingingo ya 3 y’ cy'aya masezerano.",
          "2. Uruhushya ruteshwa agaciro burundu igihe habayeho kudakora imirimo yateganyijwe mu gihe gikurikirana cy’imyaka Itatu (3) cyangwa igihe Umuyobozi Mukuru asanze uwahawe uruhushya atubahiriza ibikubiye muri aya masezerano, itegeko rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi mu Rwanda cyangwa andi mategeko n’amabwiriza abigenga cyangwa uwahawe uruhushya yaratanze abishaka amakuru atariyo kugirango ahabwe uruhushya.",
          "3. Umuyobozi Mukuru afite uburenganzira bwo gutesha agaciro Uruhushya igihe hari igabanuka rikabije ry’ingano y’amazi mw’isoko ry’amazi rishobora kubangamira imikoreshereze y’ amazi nkuko amategeko abiteganya",
          "4. Icyemezo cy’Umuyobozi Mukuru cyerekeranye no guhagarika uruhushya cyangwa gusesa aya masezerano kibanzirizwa n’integuza yandikiwe ukoresha amazi mu iminsi cumi n'itanu (15) mbere y’itariki yo gufata umwanzuro.",
          "5. Iyo Amasezerano arangiye ukoresha amazi agomba gusiga umutungo kamere w’amazi nk’uko wari umeze mbere y’itangira ry’aya masezerano, harimo no gusubiranya  ubutaka igihe bibaye ngombwa.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 16: Guhindura amasezerano",
        paragraphs: [
          "Aya masezerano ashobora guhindurwa gusa numugereka wamasezerano wanditse byemejwe n’impande zombi.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 17: Gukemura amakimbirane",
        paragraphs: [
          "1.Amakimbirane azavuka mu ishyirwa mubikorwa ry’aya masezerano, uruhande rubangamiwe rumenyesha urundi mu nyandiko.",
          "2. Amakimbirane yose azavuka ajyanye n’aya masezerano, impande zombi zikora ibishoboka byose muyakemura mu bwumvikane.",
          "3. Igihe amakimbirane adakemuwe mu bwumvikane mu gihe cy’iminsi 30, uruhande rubangamiwe rushyikiriza ikirego urukiko rubifitiye ububasha",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 18: Amategeko agenga",
        paragraphs: [
          "Aya masezerano azagengwa kandi asobanurwe hakurikijwe amategeko ya Repubulika y'u Rwanda.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 19: Igihe amasezerano atangira gukurikizwa",
        paragraphs: ["Aya masezerano atangira gukurikizwa ku munsi yashyizweho umukono n’Umuyobozi Mukuru."],
      },
      {
        title: "Imikono (Signatures)",
        paragraphs: [
          "The DIRECTOR GENERAL/ UMUYOBOZI MUKURU:",
          "UKORESHA AMAZI:",
          "Signature/Umukono: ……………………",
          "Umukono: ……………………",
          "",
          "Izina: Dr. Emmanuel RUKUNDO",
          "Izina: IZINA RY’UHAGARARIYE IKIGO",
          "Icyo akora: Umuyobozi Mukuru",
          "Icyo akora: ICYO ASHINZWE",
          "Itariki: ……………………………",
        ],
      },
    ],
    importantNotice: {
      title: "Important Notice",
      body: "By accepting these terms, you acknowledge that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.",
    },
  },
  concession_individual: {
    heading: "CONTRACT RELATING TO WATER USE PERMIT",
    subheading: "The fields in this contract are auto-filled from your application details.",
    sections: [
      {
        title: "Preamble",
        paragraphs: [
          "CONTRACT RELATING TO WATER USE PERMIT",
          "No {{CONTRACT_NUMBER}}",
          "This Contract is made and entered into by and between the Director General of Rwanda Water Resources Board, and hereafter referred to as the (“Director General \") on the one hand;",
          "AND",
          "“NAME OF APPLICANT”, with ID Number: XXXXXXXXXXXXX, and hereafter referred to as the (“Water User”) on the other hand;",
          "And all these hereafter collectively referred to as “Parties”;",
          "Agree as follows:",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 1: Basis of the contract",
        paragraphs: [
          "This contract is concluded in accordance with Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda and will follow other relevant laws and regulations of the Government of Rwanda.",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 2: Object of the Contract",
        paragraphs: [
          "This Contract is relating to the grant of a Water Use Permit in respect of the provisions of the above-mentioned law and this contract. It thus regulates the rights and obligations of the Parties resulting from the Permit.",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 3: Duration of Water Use Permit",
        paragraphs: [
          "1. The Water Use Permit will be unless terminated earlier in accordance with the provisions hereof, be for a period of XXX (Number) years calculated with effect from the Commencement Date of this Contract.",
          "2. The Water User can request to extend the duration of the water use permit to the Director General, at least three (3) months prior to expiration of the period referred to in paragraph (1) of this Article.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 4: The right to the concession",
        paragraphs: [
          "The Director General provides the Water Use Permit for XXX (NAME OF TYPE OF WATER ACTIVITIES APPLIED FOR) in concession described as follows:",
          "Location: XXXX Lake (NAME OF LAKE), on part located in in XXX Village, XXX Cell, XXX Sector, XXX District, XXXX Province, as specified in the attached map.",
          "Concession area: XXX Ha",
          "2.This water use permit is solely for the water body. For other authorization concerning any activity/work in the buffer zone, the water use permit holder will have to consult relevant institution.",
          "3. The concession shall be used solely for XXX (NAME OF TYPE OF WATER ACTIVITIES APPLIED FOR) in accordance with the Project Documentation which constitutes an integral part of this Contract.",
          "4. The Water User understands and acknowledges that the water from XXXX Lake XXXX Lake (NAME OF LAKE) is a multi-purpose water resource and may be subject to other plans as long as that will not affect the use to which water will be put.",
          "5. The Director General makes no guarantee as to the availability, suitability, purity, portability, or fitness of the water to meet the Water User’s activities.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 5: Obligations of the Water User",
        paragraphs: [
          "The Water User shall respect the following:",
          "1. to carry out the activities using environmental-friendly equipment and installations with high competence in robust corrosion resistance and ease of cleaning;",
          "2. to start activities provided for in article 4 of this contract within a period of three (3) years after which unused surface area will be relinquished;",
          "3. to respect and comply with all laws and regulations relating to environmental protection shall also comply with regulations in relation to prohibitions related to solid, liquid, and hazardous gaseous waste disposal into the lake as established by competent Authority. Particularly the Water User has the duty to protect the concession area of his or her operations.",
          "4. to respect the terms and conditions of this contract;",
          "5. to allow the representatives of the conceding authority to have free access to the concession area. In addition, the Water Use Permit Holder shall permit any scientific operation approved by the conceding authority;",
          "6. The Water User shall use the highest degree of care and all proper safeguards to prevent land or water pollution resulting from the Project activities. The Water User shall use all means at his or her disposal to recapture all escaping pollutants and shall be solely responsible for all damages, if any that may result from any such land, air, or water pollution occasioned by his or her operations as provided for by the laws.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 6: Assignment or transfer of the Authorization",
        paragraphs: [
          "The Water User may not assign or transfer the Water Use Permit subject to this Contract nor concession, fully or partially, without prior consent by the Director General in writing. Any purported assignment or transfer without such prior written approval by the Director General shall be null and void and deemed to be an event of default of obligations and a reason for termination of this Contract.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 7: Deviation from the water use",
        paragraphs: [
          "If the Water User desires to deviate from the initial plan of the water use in any manner, he/she must request for an amendment of this contract, or enter into a new contract, to encompass the deviations from the initial plan.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 8: Other people’s rights and access to water",
        paragraphs: [
          "1. The Water User may not take any action that restricts the right of the public to reasonably use the Water Resources, including, without limitation, the right to fetch water for domestic use.",
          "2. The issuance of a Water Use Permit does not authorize any injury to private or public property nor any invasion of personal rights, or any infringement of any applicable law. The Water User shall be responsible for securing authorization, easements, rights-of-way, leases or permission of land owners to obtain access to the locations specified in the Water Use Permit and all land and properties necessary for diversion purposes prior to commencing proposed works.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 9: Records keeping",
        paragraphs: [
          "The Water User must keep all records related to the use and management of water and produce them for inspection whenever required.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 10: Duty to Provide Information",
        paragraphs: [
          "The Water User must provide needed information related to the water use to the Director General whenever required. The Water User shall provide to the Director General, authorized representatives of the Director General or experts hired by the Director General with all necessary information during the lifetime of the Water Use Permit.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 11: Fees to be paid",
        paragraphs: [
          "The Water User shall pay fees in accordance with the provisions of the Water Law N°49/2018 of 13/08/2018 determining the use and management of water resources.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 12: Access for inspection or monitoring",
        paragraphs: [
          "The Director General, authorized representatives of the Director General or experts hired by the Director General shall be entitled to have access to the Water User’s operations and records, for purposes including ascertaining the use to which water is being put, inspecting water measurement devices, auditing payment, for the limited purpose of ensuring compliance with laws and this contract. The same right shall be entitled to competent local authorities.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 13: Right to suspend the Water Use Permit",
        paragraphs: [
          "The Director General shall have the right to suspend the Water Use Permit for a specified period during which the Water User is required to redress identified issues or when necessary to protect the water source or to prevent substantial damage to the environment or ecological resources.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 14: Cancellation of the Water Use Permit and Termination of the Contract",
        paragraphs: [
          "1. The Water Use Permit shall be cancelled at the expiration date of the duration for which it has been granted provided that the Water Use Permit is not extended in compliance with Article 3 paragraph 2 of this Contract.",
          "2. This contract shall also be totally cancelled for non-execution of proposed works or if the project is abandoned during a continuous period of three (3) years, or if the Director General finds that the Water User is in violation of the terms and conditions of this Contract, the Law determining the use and management of water resources or other relevant laws and regulations or the Water User willfully used wrong information for the purpose of obtaining the Water Use Permit.",
          "3. The Director General reserves the right to cancel the Water Use Permit if there is any significant reduction in the water level of the water source which may adversely affect the priority use of water as provided by the water law.",
          "4. Any action of the Director General relating to the suspension or cancellation of the Water Use Permit or termination of the contract shall be preceded by a written Notice (Suspension/Termination Notice) addressed to the Water User fifteen (15) days prior to the effective date of the proposed action.",
          "6. Upon termination of this Contract, the Water User shall leave the water resources in the same good order as the resources were in at the commencement of this Contract, including restoration of landscape where necessary.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 15: Obligations of the Director General",
        paragraphs: [
          "During the implementation of this contract, the obligations of the Director General will be the following:",
          "1. to show diligence in the granting of any administrative document required for exploitation of the concession;",
          "2. to follow up the implementation of this contract;",
          "3. to participate actively in conflict settlement arising from the implementation of this contract",
          "4. Control whether the activities of the Water User with respect to the Water Use Permit comply with Laws and regulations relating to the use and management of water resources.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 16: Dispute settlement",
        paragraphs: [
          "If any dispute arises from the implementation of the present contract, the aggrieved party notifies the contractor in writing.",
          "Any dispute shall be settled foremost by way of negotiation.",
          "If there is no amicable settlement of the dispute within three (3) months, the aggrieved party lodges the case before the competent court.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 17: Governing law",
        paragraphs: [
          "This Agreement shall be governed by and construed in accordance with the laws of the Republic of Rwanda.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 18: Commencement",
        paragraphs: ["This contract takes effect on the date of signature by the Director General."],
      },
      {
        title: "Signatures",
        paragraphs: [
          "The DIRECTOR GENERAL/ UMUYOBOZI MUKURU:",
          "The WATER USER:",
          "Signature: ……………………",
          "",
          "Signature: …………………",
          "",
          "Name: Dr. Emmanuel RUKUNDO",
          "Name: Name of applicant",
          "Title: Director General",
          "",
          "Date: ……………………",
        ],
      },

      // Kinyarwanda version
      {
        title: "AMASEZERANO YEREKEYE URUHUSHYA RWO GUKORESHA AMAZI",
        paragraphs: ["No {{CONTRACT_NUMBER}}"],
      },
      {
        title: "Ibisobanuro rusange (Preamble)",
        paragraphs: [
          "Aya masezerano akozwe hagati ya Umuyobozi Mukuru w’Ikigo Gishinzwe Umutungo Kamere w’Amazi mu Rwanda, muri aya masezerano witwa (“Umuyobozi Mukuru”) ku ruhande rumwe;",
          "Na",
          "“XXXXX (IZINA RY’USABA)” ufite Nimero y’ Indangamuntu: XXXXXXXXXXXX, muri aya masezerano witwa “Ukoresha amazi” ku rundi ruhande;",
          "Muri aya masezerano igihe bavugiwe hamwe bitwa “Impande zombi”",
          "Bemeranyijwe ibi bikurikira:",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya mbere: Ishingiro ry’amasezerano",
        paragraphs: [
          "Aya masezerano yakozwe hakurikijwe itegeko No 49/2018 ryo ku wa 13/08/2018 rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi mu Rwanda. Aya masezerano kandi azubahiriza andi mategeko n’ amabwiriza bya Guverinoma y’ u Rwanda",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya 2: Impamvu y’amasezerano",
        paragraphs: [
          "Aya masezerano yerekeye ugutanga uruhushya rwo gukoresha amazi (muri aya mazerano rwitwa “Uruhushya”) hashingiwe ku itegeko ryavuzwe hejuru n’aya masezerano. Agenga uburenganzira n’inshingano by’impande zombi bikomoka ku ruhushya",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya 3: Igihe uruhushya ruzamara",
        paragraphs: [
          "1. Uruhushya ruzamara igihe kingana n’imyaka itanu (5) keretse ruteshejwe agaciro mbere hakurikijwe ingingo zibigenga, ibarwa uhereye itariki aya masezerano yagiriyeho agaciro.",
          "2. Ukoresha amazi ashobora gusaba Umuyobozi Mukuru kongera igihe uruhushya ruzamara habura nibura amezi atatu (3) ngo ruramgire.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’ INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 4: Uburenganzira ku imbago",
        paragraphs: [
          "1.Umuyobozi Mukuru atanze Uruhushya rwo gukora ibikorwa by’imyidagaduro yo mu mazi ku buryo bukurikira:",
          "Aho imbago ihererereye: Ikiyaga cya XXXX (Izina ry’Ikiyaga), igice cyacyo giherereye mu Umudugudu wa XXXX, Akagari ka XXX, Umurenge wa XXXX, Akarere ka XXXX, Intara y' XXXX nk’uko bigaragazwa n’ikarita iri ku umugereka.",
          "Ubuso bw’imbago: Hegitari XXX",
          "2. Uru ruhushya ni urwo gukorera mu mazi gusa. Uwaruhawe abaye akeneye gukorera mu nkengero z’ikiyaga (buffer zone) agomba kubisabira uburenganzira urwego rubishinzwe.",
          "3. Imbago yatanzwe izakoreshwa gusa mu bikorwa (IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA) nk’uko bigaragazwa n’inyandiko z’umushinga zigize kandi igice cy’aya masezerano.",
          "4. Ukoresha amazi yemera ko amazi y’ Ikiyaga cya XXXX (Izina ry’Ikiyaga) akoreshwa mu buryo rusange kandi ko ashobora gusaranganywa mu gihe cyose bitagize uwo bibangamira.",
          "5. Umuyobozi Mukuru ntiyishingira ingano n’ ubuziranenge by’ amazi bikenewe n’ ukoresha amazi mu mirimo ye.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’ INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 5: Inshingano z’ Ukoresha amazi",
        paragraphs: [
          "Ukoresha amazi agomba kubahiriza ibi bikurikira:",
          "1. Gukora ibikorwa bye yifashishije ibikoresho bitangiza ibidukikije, cyane cyane hifashishwa ibikoresho bidafatwa n’umugese kandi byoroshye gusukura;",
          "2. Gutangira ibikorwa byavuzwe mu ngingo ya 4 y’aya masezerano mi gihe cy’imyaka itatu, nyuma yayo ubuso buzaba budakoreshwa azabwamburwa;",
          "3. Kubahiriza amategeko n’amabwiriza ajyanye no kurengera ibidukikije, ndetse no kubahiriza amabwiriza ngenderwaho ajyanye n’imyanda ikomeye, imyanda itemba, n’imyanda iteza impanuka cyangwa ubuhumane ishobora kujugunywa mu mazi y’ ikiyaga nk’uko byemejwe n’ubuyobozi bubifitiye ububasha. By’umwihariko ukoresha amazi afite inshingano yo kurinda imbago akoreramo.",
          "4. Kubahiriza ibikubiye muri aya masezerano;",
          "5. Kwemerera abahagarariye ubuyobozi bwatanze imbango kugera ahatangiwe imbago. Uwahawe imbago kandi yemera ibikorwa by’ubushakashatsi byemejwe n’ubuyobozi bwatanze imbago;",
          "6. Ukoresha amazi akoresha uburyo bwose bukwiriye bwo kwita no kubuza ibyanduza ubutaka n’amazi byakomoka ku bikorwa by’umushinga we. Ukoresha amazi kandi yishingira ibyangiritse iyo kwandura k’ubutaka, umwuka cyangwa amazi byakomotse ku bikorwa bye nk’ uko amategeko abiteganya.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’ INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 6: Gutanga cyangwa guhererekanya uruhushya",
        paragraphs: [
          "Ukoresha amazi ntashobora gutanga cyangwa guhererekanya Uruhushya cyangwa Imbago bivugwa muri aya masezerano atabyemerewe n’Umuyobozi Mukuru mu nyandiko. Ibikorwa byo gutanga cyangwa guhererekanya Uruhushya cyangwa Imbago bitabanje kwemezwa n’Umuyobozi Mukuru ni impfabusa, bifatwa nko kutubahiriza aya masezerano kandi ni impamvu zatuma aseswa.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’ INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 7: Guhindura imikoreshereze y’ amazi",
        paragraphs: [
          "Ukoresha amazi wifuza guhindura imikoreshereze y’ amazi agomba gusaba guhindura aya masezerano, hagakorwa andi masezerano mashya agaragaza ibigomba guhinduka.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA BW’ABANDI BANTU BO KUGERA KU MAZI — Ingingo ya 8: Uburenganzira bw’abandi bantu bwo kugera ku mazi",
        paragraphs: [
          "1. Ukoresha amazi ntashobora gukora ibikorwa bibuza uburenganzira abandi bantu bwo gukoresha umutungo kamere w’amazi, harimo kuvoma amazi akoreshwa murugo.",
          "2. Itangwa ry' Uruhushya ntiritanga uburenganzira bwo kwangiza imitungo y’abantu ku giti cyabo cyangwa iya Leta cyangwa kunyuranya n’amategeko ariho. Ukoresha amazi agomba kuba afite inzira cyangwa uburenganzira bw’abanyirubutaka bumwemererera kugera aho akorera cyangwa aho akura amazi, mbere y’uko atangira imirimo ye.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’ INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 9: Kubika amakuru",
        paragraphs: [
          "Ukoresha amazi agomba kubika amakuru yose ajyanye no gukoresha no gucunga amazi kandi akayatanga mu igenzura n’igihe cyose bibaye ngombwa.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’ INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 10: Inshingano yo gutanga amakuru",
        paragraphs: [
          "Ukoresha amazi agomba gutanga amakuru ajyanye n’ imikoreshereze y’ amazi ku Umuyobozi Mukuru mu gihe cyose bibaye ngombwa. Ukoresha Amazi aha Umuyobozi Mukuru, abahagarariye Umuyobozi Mukuru bemewe cyangwa impuguke zahawe akazi n’Umuyobozi Mukuru amakuru yose akenewe mu gihe cyose bahawemo uruhushya.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’ INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 11: Amafaranga yishyurwa",
        paragraphs: [
          "Ukoresha amazi yishyura amafaranga hakurikijwe ibiteganywa n’itegeko No 49/2018 ryo ku wa 13/08/2018 rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’ INSHINGANO BY’ UMUYOBOZI MUKURU — Ingingo ya 12: Ubugenzuzi cyangwa Ikurikirana",
        paragraphs: [
          "Umuyobozi Mukuru, abahagarariye Umuyobozi Mukuru bemewe cyangwa impuguke zahawe akazi n’Umuyobozi Mukuru bafite uburenganzira bwo kugera ku bikorwa by’ukoresha amazi, hagamijwe kumenya imikoreshereze y’amazi, kugenzura ibikoresho bipima amazi, kugenzura ubwishyu, hagamijwe kumenya niba amategeko n’aya masezerano byubahirizwa. Ubwo burenganzira kandi bushobora guhabwa inzego z’ibanze zibifitiye ububasha.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’ INSHINGANO BY’ UMUYOBOZI MUKURU — Ingingo ya 13: Uburenganzira bwo guhagarika Uruhushya",
        paragraphs: [
          "Umuyobozi Mukuru afite uburenganzira bwo guhagarika Uruhushya mu gihe runaka igihe ukoresha amazi yasabwe gukemura ibibazo byagaragaye cyangwa igihe bibaye ngombwa kurinda amasoko cyangwa gukumira ukwangirika ku bidukikije cyangwa kw’urusobe rw’ibinyabuzima.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’ INSHINGANO BY’ UMUYOBOZI MUKURU — Ingingo ya 14: Gutesha agaciro uruhushya",
        paragraphs: [
          "1.Uruhushya ruta agaciro ku munsi rurangiriyeho mugihe rutongerewe igihe, hubahirijwe ibikubiye mu Ingingo ya 3 y’ cy'aya masezerano.",
          "2. Uruhushya ruteshwa agaciro burundu igihe habayeho kudakora imirimo yateganyijwe mu gihe gikurikirana cy’imyaka Itatu (3) cyangwa igihe Umuyobozi Mukuru asanze uwahawe uruhushya atubahiriza ibikubiye muri aya masezerano, itegeko rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi mu Rwanda cyangwa andi mategeko n’amabwiriza abigenga cyangwa uwahawe uruhushya yaratanze abishaka amakuru atariyo kugirango ahabwe uruhushya.",
          "3. Umuyobozi Mukuru afite uburenganzira bwo gutesha agaciro Uruhushya igihe hari igabanuka rikabije ry’ingano y’amazi mw’isoko ry’amazi rishobora kubangamira imikoreshereze y’ amazi nkuko amategeko abiteganya",
          "4. Icyemezo cy’Umuyobozi Mukuru cyerekeranye no guhagarika uruhushya cyangwa gusesa aya masezerano kibanzirizwa n’integuza yandikiwe ukoresha amazi mu iminsi cumi n'itanu (15) mbere y’itariki yo gufata umwanzuro.",
          "5. Iyo Amasezerano arangiye ukoresha amazi agomba gusiga umutungo kamere w’amazi nk’uko wari umeze mbere y’itangira ry’aya masezerano, harimo no gusubiranya ubutaka igihe bibaye ngombwa.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’ INSHINGANO BY’ UMUYOBOZI MUKURU — Ingingo ya 15: Inshingano z’Umuyobozi Mukuru",
        paragraphs: [
          "Mu gihe cyo gushyira mu bikorwa aya masezerano inshingano z'Umuyobozi Mukuru ni izi zikurikira:",
          "1.Kwerekana umurongo mu itanga ry’inyandiko iyo ari yo yose y’ubuyobozi ikenewe mu kubyaza umusaruro imbago;",
          "2.Gukurikirana ishyirwa mu bikorwa ry’aya masezerano;",
          "3.Kugira uruhare mu gukemura amakimbira yavuka mu ishyirwamubikorwa ry’aya masezerano",
          "4. Kugenzura niba ibikorwa by’ukoresha amazi byubahiriza amategeko n’amabwiriza yerekeye imikoreshereze n’imicungire y’umutungo kamere w’amazi",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 16: Gukemura amakimbirane",
        paragraphs: [
          "Amakimbirane azavuka mu ishyirwa mubikorwa ry’aya masezerano, uruhande rubangamiwe rumenyesha urundi mu nyandiko.",
          "Amakimbirane yose azavuka azabanza gukemurwa mu bwumvikane.",
          "Igihe amakimbirane adakemuwe mu bwumvikane mu gihe cy’amezi atatu, uruhande rubangamiwe rushyikiriza ikirego urukiko rubifitiye ububasha",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 17: Amategeko agenga",
        paragraphs: [
          "Aya masezerano azagengwa kandi asobanurwe hakurikijwe amategeko ya Repubulika y'u Rwanda.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 18: Igihe aya masezerano atangira gukurikizwa",
        paragraphs: ["Aya masezerano atangira gukurikizwa ku munsi yashyizweho umukono n’Umuyobozi Mukuru."],
      },
      {
        title: "Imikono (Signatures)",
        paragraphs: [
          "UMUYOBOZI MUKURU:",
          "UKORESHA AMAZI:",
          "Umukono: ……………………",
          "",
          "Umukono: …………………",
          "",
          "Izina: Dr. Emmanuel RUKUNDO",
          "Izina: XXXX (Usaba y’ Usaba uruhushya)",
          "Icyo akora: Umuyobozi Mukuru",
          "",
          "Itariki: ……………………………….",
        ],
      },
    ],
    importantNotice: {
      title: "Important Notice",
      body: "By accepting these terms, you acknowledge that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.",
    },
  },
  concession_organization: {
    heading: "CONTRACT RELATING TO WATER USE PERMIT",
    subheading: "The fields in this contract are auto-filled from your application details.",
    sections: [
      {
        title: "Preamble",
        paragraphs: [
          "CONTRACT RELATING TO WATER USE PERMIT",
          "No {{CONTRACT_NUMBER}}",
          "This Contract is made and entered into by and between the Director General of Rwanda Water Resources Board, and hereafter referred to as the (“Director General \") on the one hand;",
          "AND",
          "“(NAME OF APPLIED ORGANIZATION: COMPANY, NGO, ASSOCIATION, COOPERATIVE ETC..)”, with its registered office address as follows: XXXX Sector, XXX District, XXX Province; represented by XXX (NAME OF REPRESENTATIVE) “TITLE/ POSITION”, and hereafter referred to as the (“Water User”) on the other hand;",
          "And all these hereafter collectively referred to as “Parties”;",
          "Agree as follows:",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 1: Basis of the contract",
        paragraphs: [
          "This contract is concluded in accordance with Law N°49/2018 of 13/08/2018, determining the use and management of water resources in Rwanda, and will follow other relevant laws and regulations of the Government of Rwanda.",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 2: Object of the Contract",
        paragraphs: [
          "This Contract relates to the grant of a Water Use Permit in respect of the provisions of the above-mentioned law and this contract. It thus regulates the rights and obligations of the Parties resulting from the Permit.",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 3: Duration of Water Use Permit",
        paragraphs: [
          "The Water Use Permit will be, unless terminated earlier in accordance with the provisions hereof, for a period of IN LETTER AND NUMBER (XXX) years, calculated with effect from the Commencement Date of this Contract.",
          "The Water User can request to extend the duration of the water use permit to the Director General, at least three (3) months prior to expiration of the period referred to in paragraph (1) of this Article.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 4: The right to the concession",
        paragraphs: [
          "The Director General provides the Water Use Permit for XXX (NAME OF TYPE OF WATER ACTIVITIES APPLIED FOR) in the concession described as follows:",
          "Location: Lake XXXX (NAME OF LAKE), situated in XXX Village, XXX Cell, XXX Sector, XXX District, XXX Province, as indicated on the attached map.",
          "Concession area: XXXHa",
          "2. This water use permit is solely for the water body. For other authorization concerning any activity/work in the buffer zone, the concession holder will have to consult the relevant institution",
          "3. The concession shall be used solely for XXX (NAME OF TYPE OF WATER ACTIVITIES APPLIED FOR) in accordance with the Project Documentation, which constitutes an integral part of this Contract.",
          "4. The Water User understands and acknowledges that the water from Lake XXX (NAME OF THE LAKE) is a multi-purpose water resource and may be subject to other plans as long as that will not affect the use to which the water will be put.",
          "5. The Director General makes no guarantee as to the availability, suitability, purity, portability, or fitness of the water to meet Water User’s activities.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 5: Obligations of the Water User",
        paragraphs: [
          "The Water User shall respect the following:",
          "1. to carry out the activities using environmentally friendly equipment and installations with high competence in robust corrosion resistance and ease of cleaning;",
          "2. to start activities provided for in article 4 of this contract within a period of three (3) years after which the unused surface area will be relinquished;",
          "3. To respect and comply with all laws and regulations relating to environmental protection by shall also comply with regulations in relation to prohibitions related to solid, liquid, and hazardous gaseous waste disposal into the lake as established by the competent Authority. Particularly, the Water User has the duty to protect the concession area of his or her operations.",
          "4. To respect the terms and conditions of this contract;",
          "5. to allow the representatives of the conceding authority to have free access to the concession area. In addition, the Water Use Permit Holder shall permit any scientific operation approved by the conceding authority;",
          "6. The Water User shall use the highest degree of care and all proper safeguards to prevent land or water pollution resulting from the Project activities. The Water User shall use all means at his or her disposal to recapture all escaping pollutants and shall be solely responsible for all damages, if any, that may result from any such land, air, or water pollution occasioned by his or her operations as provided for by the laws.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 6: Assignment or transfer of the Authorization",
        paragraphs: [
          "The Water User may not assign or transfer the Water Use Permit subject to this Contract, nor concession, fully or partially, without prior consent by the Director General in writing. Any purported assignment or transfer without such prior written approval by the Director General shall be null and void and deemed to be an event of default of obligations and a reason for termination of this Contract.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 7: Deviation from the water use",
        paragraphs: [
          "If the Water User desires to deviate from the initial plan of the water use in any manner, he/she must request an amendment of this contract, or enter into a new contract to encompass the deviations from the initial plan.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 8: Other people’s rights and access to water",
        paragraphs: [
          "1. The issuance of a Water Use Permit does not authorize any injury to private or public property, nor any invasion of personal rights, or any infringement of any applicable law. The Water User shall be responsible for securing authorization, easements, rights-of-way, leases, or permission of land owners to obtain access to the locations specified in the Water Use Permit and all land and properties prior to commencing proposed works.",
          "2. The Water User acknowledges that the authorized concession is located within a lake area designated for mixed uses, namely fish farming and capture fisheries, and that the issuance of this permit does not invalidate the rights of other water users in the vicinity of the authorized concession. However, within the boundaries of the authorized concession (XXX Ha), the Water User retains the right to carry out the permitted activities without interference, provided that all applicable environmental, safety, and operational regulations are strictly observed.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 9: Records keeping",
        paragraphs: [
          "The Water User must keep all records related to the use and management of water and produce them for inspection whenever required.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 10: Duty to Provide Information",
        paragraphs: [
          "The Water User must provide the needed information related to the water use to the Director General whenever required. The Water User shall provide to the Director General, authorized representatives of the Director General, or experts hired by the Director General, with all necessary information during the lifetime of the Water Use Permit.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 11: Fees to be paid",
        paragraphs: [
          "The Water User shall pay fees in accordance with the provisions of the Water Law N°49/2018 of 13/08/2018, determining the use and management of water resources.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 12: Access for inspection or monitoring",
        paragraphs: [
          "The Director General, authorized representatives of the Director General or experts hired by Director General shall be entitled to have access to Water User’s operations and records, for purposes including ascertaining use to which water is being put, auditing payment, for the limited purpose of ensuring compliance with laws and this contract. The same right shall be entitled to competent local authorities.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 13: Right to suspend the Water Use Permit",
        paragraphs: [
          "The Director General shall have the right to suspend the Water Use Permit for a specified period during which the Water User is required to redress identified issues or when necessary to protect the lake or to prevent substantial damage to the environment or ecological resources.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 14: Cancellation of the Water Use Permit and Termination of the Contract",
        paragraphs: [
          "1. The Water Use Permit shall be cancelled at the expiration date of the duration for which it has been granted, provided that the Water Use Permit is not extended in compliance with Article 3, paragraph 2 of this Contract.",
          "2. This contract shall also be totally cancelled for non-execution of proposed works or if the project is abandoned during a continuous period of three (3) years, or if the Director General finds that the Water User is in violation of the terms and conditions of this Contract, the Law determining the use and management of water resources or other relevant laws and regulations or the Water User willfully used wrong information for the purpose of obtaining the Water Use Permit.",
          "3. Any action of the Director General relating to suspension or cancellation of the Water Use Permit or to termination of the contract shall be preceded by a written Notice (Suspension/Termination Notice) addressed to the Water User fifteen (15) days prior to the effective date of the proposed action.",
          "4. Upon termination of this Contract, the Water User shall leave the water resources in the same good order as the resources were in at the commencement of this Contract, including restoration of the landscape where necessary.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 15: Obligations of the Director General",
        paragraphs: [
          "During the implementation of this contract, the obligations of the Director General will be the following:",
          "1. To show diligence in the granting of any administrative document required for the exploitation of the concession;",
          "2. To follow up on the implementation of this contract;",
          "3. To participate actively in conflict settlement arising from the implementation of this contract",
          "4. Control whether the activities of the Water User in respect of the Water Use Permit comply with Laws and regulations relating to the use and management of water resources.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 16: Dispute settlement",
        paragraphs: [
          "If any dispute arises from the implementation of the present contract, the aggrieved party notifies the contractor in writing.",
          "Any dispute shall be settled foremost by way of negotiation.",
          "If there is no amicable settlement of the dispute within three (3) months, the aggrieved party lodges the case before the competent court.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 17: Governing law",
        paragraphs: [
          "This Agreement shall be governed by and construed in accordance with the laws of the Republic of Rwanda.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 18: Commencement",
        paragraphs: ["This contract takes effect on the date of signature by the Director General."],
      },
      {
        title: "Signatures",
        paragraphs: [
          "THE DIRECTOR GENERAL/ UMUYOBOZI MUKURU:",
          "Signature/Umukono: ……………………",
          "",
          "THE WATER USER/ UKORESHA AMAZI:",
          "Signature: …………………",
          "",
          "Name: Dr. Emmanuel RUKUNDO",
          "Name: XXX (NAME OF REPRESENTATIVE)",
          "Title: Director General",
          "Title: POSITION",
          "Date: ……………………………",
        ],
      },

      // Kinyarwanda version
      {
        title: "AMASEZERANO YEREKEYE URUHUSHYA RWO GUKORESHA AMAZI",
        paragraphs: ["No {{CONTRACT_NUMBER}}"],
      },
      {
        title: "Ibisobanuro rusange (Preamble)",
        paragraphs: [
          "Aya masezerano akozwe hagati ya Umuyobozi Mukuru w’Ikigo Gishinzwe Umutungo Kamere w’Amazi mu Rwanda, muri aya masezerano witwa (“Umuyobozi Mukuru”) ku ruhande rumwe;",
          "Na",
          "“(IZINA RY’ IKIGO/KOPERATIVE/ IKOMPANYI N’IBINDI CYASABYE)” ifite ibiro mu Umurenge wa XXXX, Akarere ka XXXX, Intara y’ XXX; ihagarariwe na IZINA RY’UHAGARARIYE IKIGO “ICYO ASHINZWE”, muri aya masezerano witwa “Ukoresha amazi” ku rundi ruhande;",
          "Muri aya masezerano igihe bavugiwe hamwe bitwa “Impande zombi”",
          "Bemeranyijwe ibi bikurikira:",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya mbere: Ishingiro ry’amasezerano",
        paragraphs: [
          "Aya masezerano yakozwe hakurikijwe itegeko No 49/2018 ryo ku wa 13/08/2018 rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi mu Rwanda. Aya masezerano kandi azubahiriza andi mategeko n’ amabwiriza bya Guverinoma y’ u Rwanda",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya 2: Impamvu y’amasezerano",
        paragraphs: [
          "Aya masezerano yerekeye ugutanga uruhushya rwo gukoresha amazi (muri aya mazerano rwitwa “Uruhushya”) hashingiwe ku itegeko ryavuzwe hejuru n’aya masezerano. Agenga uburenganzira n’inshingano by’impande zombi bikomoka ku ruhushya",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya 3: Igihe uruhushya ruzamara",
        paragraphs: [
          "Uruhushya ruzamara igihe kingana n’imyaka XXX (IGIHE URUHUSHYA RUZAMARA) keretse ruteshejwe agaciro mbere hakurikijwe ingingo zibigenga, ibarwa uhereye itariki aya masezerano yagiriyeho agaciro.",
          "Ukoresha amazi ashobora gusaba Umuyobozi Mukuru kongera igihe uruhushya ruzamara habura nibura amezi atatu (3) ngo ruramgire.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N'INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 4: Uburenganzira ku imbago",
        paragraphs: [
          "Umuyobozi Mukuru atanze Uruhushya rwo gukora ibikorwa (IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA) ku buryo bukurikira:",
          "Aho imbago ihererereye: Ikiyaga cya XXX (IZINA RY’IKIYAGA), igice cyacyo giherereye mu Umudugudu wa Rusumo, Akagari ka Karambi, Umurenge wa Kivumu, Akarere ka Rutsiro, Intara y' Iburengerazuba nk’uko bigaragazwa n’ikarita iri ku umugereka.",
          "Ubuso bw’imbago: Hegitari XXX",
          "2. Uru ruhushya ni urwo gukorera mu mazi gusa. Uwaruhawe akeneye gukorera mu nkengero z’ikiyaga (buffer zone) agomba kubisabira uburenganzira urwego rubishinzwe.",
          "3. Imbago yatanzwe izakoreshwa gusa mu bikorwa (IBIKORWA/ IMIRIMO BYASABIWE URUHUSHYA) nk’uko bigaragazwa n’inyandiko z’umushinga zigize igice cy’aya masezerano.",
          "4. Ukoresha amazi yemera ko amazi y’ Ikiyaga cya XXX (IZINA RY’IKIYAGA) akoreshwa mu buryo rusange kandi ko ashobora gusaranganywa mu gihe cyose bitagize uwo bibangamira.",
          "5. Umuyobozi Mukuru ntiyishingira ingano n’ubuziranenge by’ amazi bikenewe n’ukoresha amazi mu mirimo ye.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 5: Inshingano z’ Ukoresha amazi",
        paragraphs: [
          "Ukoresha amazi agomba kubahiriza ibi bikurikira:",
          "1. Gukora ibikorwa bye yifashishije ibikoresho bitangiza ibidukikije, cyane cyane hifashishwa ibikoresho bidafatwa n’umugese kandi byoroshye gusukura;",
          "2. Gutangira ibikorwa byavuzwe mu ngingo ya 4 y’aya masezerano mi gihe cy’imyaka itatu, nyuma yayo ubuso buzaba budakoreshwa azabwamburwa;",
          "3. Kubahiriza amategeko n’amabwiriza ajyanye no kurengera ibidukikije, ndetse no kubahiriza amabwiriza ngenderwaho ajyanye n’imyanda ikomeye, imyanda itemba, n’imyanda iteza impanuka cyangwa ubuhumane ishobora kujugunywa mu mazi y’ ikiyaga nk’uko byemejwe n’ubuyobozi bubifitiye ububasha. By’umwihariko ukoresha amazi afite inshingano yo kurinda imbago akoreramo.",
          "4. Kubahiriza ibikubiye muri aya masezerano;",
          "5. Kwemerera abahagarariye ubuyobozi bwatanze imbango kugera ahatangiwe imbago. Uwahawe imbago kandi yemera ibikorwa by’ubushakashatsi byemejwe n’ubuyobozi bwatanze imbago;",
          "6. Ukoresha amazi akoresha uburyo bwose bukwiriye bwo kwita no kubuza ibyanduza ubutaka n’amazi byakomoka ku bikorwa by’umushinga we. Ukoresha amazi kandi yishingira ibyangiritse iyo kwandura k’ubutaka, umwuka cyangwa amazi byakomotse ku bikorwa bye nk’ uko amategeko abiteganya.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 6: Gutanga cyangwa guhererekanya uruhushya",
        paragraphs: [
          "Ukoresha amazi ntashobora gutanga cyangwa guhererekanya Uruhushya cyangwa Imbago bivugwa muri aya masezerano atabyemerewe n’Umuyobozi Mukuru mu nyandiko. Ibikorwa byo gutanga cyangwa guhererekanya Uruhushya cyangwa Imbago bitabanje kwemezwa n’Umuyobozi Mukuru ni impfabusa, bifatwa nko kutubahiriza aya masezerano kandi ni impamvu zatuma aseswa.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 7: Guhindura imikoreshereze y’ amazi",
        paragraphs: [
          "Ukoresha amazi wifuza guhindura imikoreshereze y’ amazi agomba gusaba guhindura aya masezerano, hagakorwa andi masezerano mashya agaragaza ibigomba guhinduka.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA BW’ABANDI BANTU BO KUGERA KU MAZI — Ingingo ya 8: Uburenganzira bw’abandi bantu bwo kugera ku mazi",
        paragraphs: [
          "1. Itangwa ry' Uruhushya ntiritanga uburenganzira bwo kwangiza imitungo y’abantu ku giti cyabo cyangwa iya Leta cyangwa kunyuranya n’amategeko ariho. Ukoresha amazi agomba kuba afite inzira cyangwa ubureganzira bw’abanyirubutaka bumwemererera kugera aho akorera, mbere y’uko atangira imirimo ye.",
          "2. Ukoresha Amazi yemera ko imbago z’uruhushya ahawe ziri mu gice cy’ikiyaga cyagenwe gukorerwamo ibikorwa bitandukanye, birimo kororera amafi mu mazi n’uburobyi bwo mu buryo busanzwe, kandi ko itangwa ry’ur’Uruhushya ritakuraho uburenganzira bw’abandi bantu bakorera mu bice biri hafi y’imbago aherewe uruhushya. Ariko kandi, mu mbago zemewe z’uruhushya rwe (Hegitari XXX), Ukoresha Amazi yemerewe gukora ibikorwa yaherewe Uruhushya nta nkomyi, igihe cyose yubahiriza amategeko n’amabwiriza ngengamikorere yerekeye ibidukikije, n’umutekano wo mu mazi.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 9: Kubika amakuru",
        paragraphs: [
          "Ukoresha amazi agomba kubika amakuru yose ajyanye no gukoresha no gucunga amazi kandi akayatanga mu igenzura n’igihe cyose bibaye ngombwa.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 10: Inshingano yo gutanga amakuru",
        paragraphs: [
          "Ukoresha amazi agomba gutanga amakuru ajyanye n’ imikoreshereze y’ amazi ku Umuyobozi Mukuru mu gihe cyose bibaye ngombwa. Ukoresha Amazi aha Umuyobozi Mukuru, abahagarariye Umuyobozi Mukuru bemewe cyangwa impuguke zahawe akazi n’Umuyobozi Mukuru amakuru yose akenewe mu gihe cyose bahawemo uruhushya.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N’INSHINGANO Z’UKORESHA AMAZI — Ingingo ya 11: Amafaranga yishyurwa",
        paragraphs: [
          "Ukoresha amazi yishyura amafaranga hakurikijwe ibiteganywa n’itegeko No 49/2018 ryo ku wa 13/08/2018 rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’ INSHINGANO BY’ UMUYOBOZI MUKURU — Ingingo ya 12: Ubugenzuzi cyangwa Ikurikirana",
        paragraphs: [
          "Umuyobozi Mukuru, abahagarariye Umuyobozi Mukuru bemewe cyangwa impuguke zahawe akazi n’Umuyobozi Mukuru bafite uburenganzira bwo kugera ku bikorwa by’ukoresha amazi, hagamijwe kumenya imikoreshereze y’amazi, kugenzura ubwishyu, hagamijwe kumenya niba amategeko n’aya masezerano yubahirizwa. Ubwo burenganzira kandi bushobora guhabwa inzego z’ibanze zibifitiye ububasha.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’ INSHINGANO BY’ UMUYOBOZI MUKURU — Ingingo ya 13: Uburenganzira bwo guhagarika Uruhushya",
        paragraphs: [
          "Umuyobozi Mukuru afite uburenganzira bwo guhagarika Uruhushya mu gihe runaka igihe ukoresha amazi yasabwe gukemura ibibazo byagaragaye cyangwa igihe bibaye ngombwa kurinda Ikiyaga cyangwa gukumira ukwangirika ku bidukikije cyangwa kw’urusobe rw’ibinyabuzima.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’ INSHINGANO BY’ UMUYOBOZI MUKURU — Ingingo ya 14: Gutesha agaciro uruhushya",
        paragraphs: [
          "1Uruhushya ruta agaciro ku munsi rurangiriyeho mugihe rutongerewe igihe, hubahirijwe ibikubiye mu Ingingo ya 3 y’ cy'aya masezerano.",
          "2. Uruhushya ruteshwa agaciro burundu igihe habayeho kudakora imirimo yateganyijwe mu gihe gikurikirana cy’imyaka Itatu (3) cyangwa igihe Umuyobozi Mukuru asanze uwahawe uruhushya atubahiriza ibikubiye muri aya masezerano, itegeko rigenga imikoreshereze n’imicungire y’umutungo kamere w’amazi mu Rwanda cyangwa andi mategeko n’amabwiriza abigenga cyangwa uwahawe uruhushya yaratanze abishaka amakuru atariyo kugirango ahabwe uruhushya.",
          "3. Icyemezo cy’Umuyobozi Mukuru cyerekeranye no guhagarika uruhushya cyangwa gusesa aya masezerano kibanzirizwa n’integuza yandikiwe ukoresha amazi mu iminsi cumi n'itanu (15) mbere y’itariki yo gufata umwanzuro.",
          "4. Iyo Amasezerano arangiye ukoresha amazi agomba gusiga umutungo kamere w’amazi nk’uko wari umeze mbere y’itangira ry’aya masezerano, harimo no gusubiranya ubutaka igihe bibaye ngombwa.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N’ INSHINGANO BY’ UMUYOBOZI MUKURU — Ingingo ya 15: Inshingano z’Umuyobozi Mukuru",
        paragraphs: [
          "Mu gihe cyo gushyira mu bikorwa aya masezerano inshingano z'Umuyobozi Mukuru ni izi zikurikira:",
          "1. Kwerekana umurongo mu itanga ry’inyandiko iyo ari yo yose y’ubuyobozi ikenewe mu kubyaza umusaruro imbago;",
          "2. Gukurikirana ishyirwa mu bikorwa ry’aya masezerano;",
          "3. Kugira uruhare mu gukemura amakimbira yavuka mu ishyirwamubikorwa ry’aya masezerano",
          "4. Kugenzura niba ibikorwa by’ukoresha amazi byubahiriza amategeko n’amabwiriza yerekeye imikoreshereze n’imicungire y’umutungo kamere w’amazi",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 16: Gukemura amakimbirane",
        paragraphs: [
          "Amakimbirane azavuka mu ishyirwa mubikorwa ry’aya masezerano, uruhande rubangamiwe rumenyesha urundi mu nyandiko.",
          "Amakimbirane yose azavuka azabanza gukemurwa mu bwumvikane.",
          "Igihe amakimbirane adakemuwe mu bwumvikane mu gihe cy’amezi atatu, uruhande rubangamiwe rushyikiriza ikirego urukiko rubifitiye ububasha",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 17: Amategeko agenga",
        paragraphs: [
          "Aya masezerano azagengwa kandi asobanurwe hakurikijwe amategeko ya Repubulika y'u Rwanda.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 18: Igihe aya masezerano atangira gukurikizwa",
        paragraphs: ["Aya masezerano atangira gukurikizwa ku munsi yashyizweho umukono n’Umuyobozi Mukuru."],
      },
      {
        title: "Imikono (Signatures)",
        paragraphs: [
          "UMUYOBOZI MUKURU:",
          "Umukono: ……………………",
          "",
          "UKORESHA AMAZI:",
          "Umukono: …………………",
          "",
          "Izina: Dr. Emmanuel RUKUNDO",
          "Izina: Uhagarariye Ikigo cyasabye",
          "Icyo akora: Umuyobozi Mukuru",
          "Icyo akora: Icyo ashinzwe",
          "Itariki: ……………………………",
        ],
      },
    ],
    importantNotice: {
      title: "Important Notice",
      body: "By accepting these terms, you acknowledge that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.",
    },
  },
  bulk_water_supply: {
    heading: "CONTRACT RELATING TO WATER USE PERMIT",
    subheading: "The fields in this contract are auto-filled from your application details.",
    sections: [
      {
        title: "Preamble",
        paragraphs: [
          "CONTRACT RELATING TO WATER USE PERMIT",
          "No {{CONTRACT_NUMBER}}",
          "This Contract is made and entered into by and between the Director General of Rwanda Water Resources Board, and hereafter referred to as the (“Director General \") on the one hand;",
          "AND",
          "“XXXXX (NAME OF ORGANIZATION)”, with its registered office address as follows: XXX Sector, XXX District, XXX Province; represented by XXXX (NAME OF REPRESENTATIVE) “TITLE OF REPRESENTATIVE”, and hereafter referred to as the (“Water User”) on the other hand;",
          "And all these hereafter collectively referred to as Parties;",
          "Agree as follows:",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article one: Basis of the contract",
        paragraphs: [
          "This contract is concluded in accordance with Law N°49/2018 of 13/08/2018 determining the use and management of water resources in Rwanda and will follow other relevant laws and regulations of the Government of Rwanda.",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 2: Object of the Contract",
        paragraphs: [
          "This Contract is relating to the grant of a Water Use Permit in respect of the provisions of the above-mentioned law and this contract. It thus regulates the rights and obligations of the Parties resulting from the Permit.",
        ],
      },
      {
        title: "PART I: GENERAL CONDITIONS — Article 3: Duration of Water Use Permit",
        paragraphs: [
          "1. The permit will, unless terminated earlier in accordance with the provisions hereof, be for a period of XXXX (NUMBER) years calculated with effect from the Commencement Date of this Contract.",
          "2. The Water User can request to extend the duration of the water use permit to the Director General, at least three (3) months prior to expiration of the period referred to in paragraph (1) of this Article.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 4: Right to abstract and use water",
        paragraphs: [
          "1. The Water User is authorized to abstract water from the water supply networks located in {{DISTRICT}} District as specified in the attached annex.",
          "2. The water abstracted shall be used solely for water supply in accordance with the Project Documentation which constitutes an integral part of this Contract.",
          "3. The Water User understands and acknowledges that the water resources are multi-purpose and may be subject to other plans as long as that will not affect the use to which water will be put.",
          "4. The Director General makes no guarantee as to the availability, suitability, purity, portability, or fitness of the water to meet Water User's activities.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 5: Fees to be paid",
        paragraphs: [
          "The Water User shall pay fees in accordance with the provisions of the Water Law N°49/2018 of 13/08/2018 determining the use and management of water resources.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 6: Obligation for Environment Protection",
        paragraphs: [
          "1. The Water User must comply with all laws and regulations relating to environmental protection and shall comply with standards in relation to wastewater disposal into water bodies as established by the competent Authority. Particularly the Water User has the duty to protect the catchment area of his operations.",
          "2. The Water User shall use the highest degree of care and all proper safeguards to prevent land or water pollution resulting from the Project activities. The Water User shall use all means at his or her disposal to recapture all escaping pollutants and shall be solely responsible for all damages, if any that may result from any such land, air or water pollution occasioned by his or her operations as provided for by the laws.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 7: Assignment or transfer of the Authorization",
        paragraphs: [
          "The Water User may not assign or transfer the Water Use Permit subject to this Contract, fully or partially, without prior consent by the Director General in writing. Any purported assignment or transfer without such prior written approval by the Director General shall be null and void and deemed to be an event of default of obligations and a reason for termination of this Contract.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 8: Deviation from the water use",
        paragraphs: [
          "If the Water User desires to deviate from the initial plan of the water use in any manner, he/she must request an amendment of this contract or enter into a new contract to encompass the deviations from the initial plan.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 9: Other people's rights and access to water",
        paragraphs: [
          "1. The Water User may not take any action that restricts the right of the public to reasonably use the Water Resources, including, without limitation, the right to fetch water for domestic use and livestock.",
          "2. The issuance of a Water Use Permit does not authorize any injury to private or public property nor any invasion of personal rights, or any infringement of any applicable law. The Water User shall be responsible for securing authorization, easements, rights-of-way, leases or permission of land owners to obtain access to the locations specified in the Water Use Permit and all land and properties necessary for diversion purposes prior to commencing proposed works.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 10: Records keeping",
        paragraphs: [
          "The Water User must keep all records related to the use and management of water and produce them for inspection whenever required.",
        ],
      },
      {
        title: "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 11: Duty to Provide Information",
        paragraphs: [
          "The Water User must provide needed information related to the water use to the Director General whenever required. The Water User shall provide to the Director General, authorized representatives of the Director General or experts hired by the Director General with all necessary information during the lifetime of the Water Use Permit.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 12: Obligations of the Director General",
        paragraphs: [
          "During the implementation of this contract the obligations of the Director General will be the following:",
          "1. To follow up on the implementation of this contract",
          "2. To participate actively in conflict settlement arising from the implementation of this contract;",
          "3. Control whether the activities of Water User in respect of Water Use Permit comply with Laws and regulations relating to the use and management of water resources.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 13: Access for inspection or monitoring",
        paragraphs: [
          "The Director General, authorized representatives of the Director General or experts hired by the Director General shall be entitled to have access to the Water User's operations and records, for purposes including ascertaining the use to which water is being put, inspecting water measurement devices, auditing payment, for the limited purpose of ensuring compliance with laws and this contract. The same right shall be entitled to competent local authorities.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 14: Right to suspend the Water Use Permit",
        paragraphs: [
          "The Director General shall have the right to suspend the Water Use Permit for a specified period during which the Water User is required to redress identified issues or when necessary to protect the water source or to prevent substantial damage to the environment or ecological resources.",
        ],
      },
      {
        title: "PART III: RIGHTS AND OBLIGATIONS OF THE DIRECTOR GENERAL — Article 15: Cancellation of the Water Use Permit and Termination of the Contract",
        paragraphs: [
          "1. The Water Use Permit shall be cancelled at the expiration date of the duration for which it has been granted provided that the Water Use Permit is not extended in compliance with Article 3 paragraph 2 of this Contract.",
          "2. This contract shall also be totally cancelled for non-execution of proposed works or if the project is abandoned during a continuous period of three (3) years, or if the Director General finds that the Water User is in violation of the terms and conditions of this Contract, the Law determining the use and management of water resources or other relevant laws and regulations or the Water User willfully used wrong information for the purpose of obtaining the Water Use Permit.",
          "3. The Director General reserves the right to cancel the Water Use Permit if there is any significant reduction in the water level of the water source which may adversely affect the priority use of water as provided by the water law.",
          "4. Any action of the Director General relating to the suspension or cancellation of the Water Use Permit or termination of the contract shall be preceded by a written Notice (Suspension/Termination Notice) addressed to the Water User fifteen (15) days prior to the effective date of the proposed action.",
          "6. Upon termination of this Contract, the Water User shall leave the water resources in the same good order as the resources were in at the commencement of this Contract, including restoration of landscape where necessary.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 16: Contract amendment",
        paragraphs: [
          "This contract may be amended only by an Annex to this contract in writing approved by the Parties.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 17: Settlement of disputes",
        paragraphs: [
          "1. If any dispute arises from the implementation of the present contract, the aggrieved Party notifies the other Party in writing.",
          "2. If any dispute arises in connection with this contract, the Parties shall use their best efforts to settle the dispute amicably.",
          "3. If the Parties cannot settle the dispute amicably within thirty (30) days, the matter shall be referred to national courts of competent jurisdiction.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 18: Governing law",
        paragraphs: [
          "This Agreement shall be governed by and construed in accordance with the laws of the Republic of Rwanda.",
        ],
      },
      {
        title: "PART IV: MISCELLANEOUS PROVISIONS — Article 19: Commencement Date",
        paragraphs: ["This contract takes effect on the date of signature by the Director General."],
      },
      {
        title: "Signatures",
        paragraphs: [
          "The DIRECTOR GENERAL:",
          "The WATER USER:",
          "Signature: ……………………",
          "Signature: ……………………",
          "",
          "Name: Dr. Emmanuel RUKUNDO",
          "Name: XXXXXX (NAME OF REPRESENTATIVE)",
          "Title: Director General",
          "Title/ Icyo akora: XXXXXXXX",
          "Date: ……………………………",
        ],
      },

      // Kinyarwanda version
      {
        title: "AMASEZERANO YEREKEYE URUHUSHYA RWO GUKORESHA AMAZI",
        paragraphs: ["No {{CONTRACT_NUMBER}}"],
      },
      {
        title: "Ibisobanuro rusange (Preamble)",
        paragraphs: [
          "Aya masezerano akozwe hagati ya Umuyobozi Mukuru w'Ikigo Gishinzwe Umutungo Kamere w'Amazi mu Rwanda, muri aya masezerano witwa (“Umuyobozi Mukuru”) ku ruhande rumwe;",
          "Na",
          "“(IZINA RY' IKIGO/KOPERATIVE/ IKOMPANYI N'IBINDI CYASABYE)”, ifite ibiro biherereye mu Umurenge wa XXXXX, Akarere ka XXXX, Intara y' XXXX; ihagarariwe na XXX (IZINA RY'UHAGARARIYE IKIGO “ICYO ASHINZWE”, muri aya masezerano witwa “Ukoresha amazi” ku rundi ruhande;",
          "Muri aya masezerano igihe bavugiwe hamwe bitwa “Impande zombi”",
          "Bemeranyijwe ibi bikurikira:",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya mbere: Ishingiro ry'amasezerano",
        paragraphs: [
          "Aya masezerano yakozwe hakurikijwe itegeko No 49/2018 ryo ku wa 13/08/2018 rigenga imikoreshereze n'imicungire y'umutungo kamere w'amazi mu Rwanda. Aya masezerano kandi azubahiriza andi mategeko n' amabwiriza bya Guverinoma y' u Rwanda",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya 2: Impamvu y'amasezerano",
        paragraphs: [
          "Aya masezerano yerekeye ugutanga uruhushya rwo gukoresha amazi (muri aya mazerano rwitwa “Uruhushya”) hashingiwe ku itegeko ryavuzwe hejuru n'aya masezerano. Agenga uburenganzira n'inshingano by'impande zombi bikomoka ku ruhushya",
        ],
      },
      {
        title: "IGICE CYA I: INGINGO RUSANGE — Ingingo ya 3: Igihe uruhushya ruzamara",
        paragraphs: [
          "1.Uruhushya ruzamara igihe kingana n' imyaka XXX (IGIHE URUHUSHYA RUZAMARA) keretse ruteshejwe agaciro mbere hakurikijwe ingingo zibigenga, ibarwa uhereye itariki aya masezerano yagiriyeho agaciro.",
          "2.Ukoresha amazi ashobora gusaba Umuyobozi Mukuru kongera igihe uruhushya ruzamara habura nibura amezi atatu (3) ngo ruramgire.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N'INSHINGANO BY'UKORESHA MAZI — Ingingo ya 4: Uburenganzira bwo gufata amazi no kuyakoresha",
        paragraphs: [
          "1. Ukoresha amazi yemerewe gukoresha amazi y'imiyoboro iherereye mu Akarere ka {{DISTRICT}} nk'uko bigaragara ku mugereka.",
          "2. Amazi yafashwe azakoreshwa gusa mu bikorwa byo gukwirakwiza amazi nk'uko bigaragazwa n'inyandiko z'umushinga zigize kandi igice cy'aya masezerano.",
          "3. Ukoresha amazi yemera ko umutungo kamere w'amazi akoreshwa mu buryo rusange kandi ko ashobora gusaranganywa mu gihe cyose bitagize uwo bibangamira.",
          "4. Umuyobozi Mukuru ntiyishingira ingano n' ubuziranenge by' amazi bikenewe n' ukoresha amazi mu mirimo ye.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N'INSHINGANO BY'UKORESHA MAZI — Ingingo ya 5: Amafaranga yishyurwa",
        paragraphs: [
          "Ukoresha amazi yishyura amafaranga hakurikijwe ibiteganywa n'itegeko No 49/2018 ryo ku wa 13/08/2018 rigenga imikoreshereze n'imicungire y'umutungo kamere w'amazi.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N'INSHINGANO BY'UKORESHA MAZI — Ingingo ya 6: Inshingano yo kurengera ibidukikije",
        paragraphs: [
          "1. Ukoresha amazi agomba kubahiriza amategeko n'amabwiriza ajyanye no kurengera ibidukikije akubahiriza kandi n'ibipimo ngenderwaho mu gutunganya amazi yanduye asubizwa mu mazi yirundiye hamwe nk'uko byemejwe n'ubuyobozi bubifitiye ububasha. By'umwihariko ukoresha amazi afite inshingano yo kurinda icyogogo akoreramo.",
          "2. Ukoresha amazi akoresha uburyo bwose bukwiriye bwo kwita no kubuza ibyanduza ubutaka n'amazi byakomoka ku bikorwa by'umushinga we. Ukoresha amazi kandi yishingira ibyangiritse iyo kwandura k'ubutaka, umwuka cyangwa amazi byakomotse ku bikorwa bye nk' uko amategeko abiteganya.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N'INSHINGANO BY'UKORESHA MAZI — Ingingo ya 7: Gutanga cyangwa guhererekanya uruhushya",
        paragraphs: [
          "Ukoresha amazi ntashobora gutanga cyangwa guhererekanya Uruhushya ruvugwa muri aya masezerano atabyemerewe n'Umuyobozi Mukuru mu nyandiko. Ibikorwa byo gutanga cyangwa guhererekanya Uruhushya bitabanje kwemezwa n'Umuyobozi Mukuru ni impfabusa, bifatwa nko kutubahiriza aya masezerano kandi ni impamvu zatuma aseswa.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N'INSHINGANO BY'UKORESHA MAZI — Ingingo ya 8: Guhindura imikoreshereze y' amazi",
        paragraphs: [
          "Ukoresha amazi wifuza guhindura imikoreshereze y' amazi agomba gusaba guhindura aya masezerano, hagakorwa andi masezerano mashya agaragaza ibigomba guhinduka.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N'INSHINGANO BY'UKORESHA MAZI — Ingingo ya 9: Uburenganzira bw'abandi bantu bwo kugera ku mazi",
        paragraphs: [
          "1.Ukoresha amazi ntashobora gukora ibikorwa bibuza uburenganzira abandi bantu bwo gukoresha umutungo kamere w'amazi, harimo kuvoma amazi akoreshwa murugo no kuhira amatungo.",
          "2. Itangwa ry'Uruhushya ntiritanga uburenganzira bwo kwangiza imitungo y'abantu ku giti cyabo cyangwa iya Leta cyangwa kunyuranya n'amategeko ariho. Ukoresha amazi agomba kuba afite inzira cyangwa ubureganzira bw'abanyirubutaka bumwemererera kugera aho akorera cyangwa aho akura amazi, mbere y'uko atangira imirimo ye.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N'INSHINGANO BY'UKORESHA MAZI — Ingingo ya 10: Kubika amakuru",
        paragraphs: [
          "Ukoresha amazi agomba kubika amakuru yose ajyanye no gukoresha no gucunga amazi kandi akayatanga mu igenzura n'igihe cyose bibaye ngombwa.",
        ],
      },
      {
        title: "IGICE CYA II: UBURENGANZIRA N'INSHINGANO BY'UKORESHA MAZI — Ingingo ya 11: Inshingano yo gutanga amakuru",
        paragraphs: [
          "Ukoresha amazi agomba gutanga amakuru ajyanye n' imikoreshereze y' amazi ku Umuyobozi Mukuru mu gihe cyose bibaye ngombwa. Ukoresha Amazi aha Umuyobozi Mukuru, abahagarariye Umuyobozi Mukuru bemewe cyangwa impuguke zahawe akazi n'Umuyobozi Mukuru amakuru yose akenewe mu gihe cyose bahawemo uruhushya.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N'INSHINGANO BY'UMUYOBOZI MUKURU — Ingingo ya 12: Inshingano z'Umuyobozi Mukuru",
        paragraphs: [
          "Mu gihe cyo gushyira mu bikorwa aya masezerano inshingano z'Umuyobozi Mukuru ni izi  zikurikira:",
          "1. Gukurikirana ishyirwa mu bikorwa ry'aya masezerano;",
          "2. Kugira uruhare mu gukemura amakimbirane yavuka mu ishyirwamubikorwa ry'aya masezerano",
          "3.Kugenzura niba ibikorwa by'ukoresha amazi byubahiriza amategeko n'amabwiriza yerekeye imikoreshereze n'imicungire y'umutungo kamere w'amazi",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N'INSHINGANO BY'UMUYOBOZI MUKURU — Ingingo ya 13: Ubugenzuzi cyangwa Ikurikirana bw' imikoreshereze y' uruhushya",
        paragraphs: [
          "Umuyobozi Mukuru, abahagarariye Umuyobozi Mukuru bemewe cyangwa impuguke zahawe akazi n'Umuyobozi Mukuru bafite uburenganzira bwo kugera ku bikorwa by'ukoresha amazi, hagamijwe kumenya imikoreshereze y'amazi, kugenzura ibikoresho bipima amazi, kugenzura ubwishyu, hagamijwe kumenya niba amategeko n'aya masezerano byubahirizwa. Ubwo burenganzira kandi bushobora guhabwa inzego z'ibanze zibifitiye ububasha.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N'INSHINGANO BY'UMUYOBOZI MUKURU — Ingingo ya 14: Uburenganzira bwo guhagarika Uruhushya",
        paragraphs: [
          "Umuyobozi Mukuru afite uburenganzira bwo guhagarika Uruhushya mu gihe runaka igihe ukoresha amazi yasabwe gukemura ibibazo byagaragaye cyangwa igihe bibaye ngombwa kurinda amasoko cyangwa gukumira ukwangirika ku bidukikije cyangwa kw'urusobe rw'ibinyabuzima.",
        ],
      },
      {
        title: "IGICE CYA III: UBURENGANZIRA N'INSHINGANO BY'UMUYOBOZI MUKURU — Ingingo ya 15: Gutesha agaciro uruhushya no guhagarika amasezeno",
        paragraphs: [
          "1.Uruhushya ruta agaciro ku munsi rurangiriyeho mugihe rutongerewe igihe, hubahirijwe ibikubiye mu Ingingo ya 3 y' cy'aya masezerano.",
          "2. Uruhushya ruteshwa agaciro burundu igihe habayeho kudakora imirimo yateganyijwe mu gihe gikurikirana cy'imyaka Itatu (3) cyangwa igihe Umuyobozi Mukuru asanze uwahawe uruhushya atubahiriza ibikubiye muri aya masezerano, itegeko rigenga imikoreshereze n'imicungire y'umutungo kamere w'amazi mu Rwanda cyangwa andi mategeko n'amabwiriza abigenga cyangwa uwahawe uruhushya yaratanze abishaka amakuru atariyo kugirango ahabwe uruhushya.",
          "3. Umuyobozi Mukuru afite uburenganzira bwo gutesha agaciro Uruhushya igihe hari igabanuka rikabije ry'ingano y'amazi mw'isoko ry'amazi rishobora kubangamira imikoreshereze y' amazi nkuko amategeko abiteganya",
          "4. Icyemezo cy'Umuyobozi Mukuru cyerekeranye no guhagarika uruhushya cyangwa gusesa aya masezerano kibanzirizwa n'integuza yandikiwe ukoresha amazi mu iminsi cumi n'itanu (15) mbere y'itariki yo gufata umwanzuro.",
          "5. Iyo Amasezerano arangiye ukoresha amazi agomba gusiga umutungo kamere w'amazi nk'uko wari umeze mbere y'itangira ry'aya masezerano, harimo no gusubiranya  ubutaka igihe bibaye ngombwa.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 16: Guhindura amasezerano",
        paragraphs: [
          "Aya masezerano ashobora guhindurwa gusa numugereka wamasezerano wanditse byemejwe n'impande zombi.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 17: Gukemura amakimbirane",
        paragraphs: [
          "1.Amakimbirane azavuka mu ishyirwa mubikorwa ry'aya masezerano, uruhande rubangamiwe rumenyesha urundi mu nyandiko.",
          "2. Amakimbirane yose azavuka ajyanye n'aya masezerano, impande zombi zikora ibishoboka byose muyakemura mu bwumvikane.",
          "3. Igihe amakimbirane adakemuwe mu bwumvikane mu gihe cy'iminsi 30, uruhande rubangamiwe rushyikiriza ikirego urukiko rubifitiye ububasha",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 18: Amategeko agenga",
        paragraphs: [
          "Aya masezerano azagengwa kandi asobanurwe hakurikijwe amategeko ya Repubulika y'u Rwanda.",
        ],
      },
      {
        title: "IGICE CYA IV: INGINGO ZINYURANYE — Ingingo ya 19: Igihe amasezerano atangira gukurikizwa",
        paragraphs: ["Aya masezerano atangira gukurikizwa ku munsi yashyizweho umukono n'Umuyobozi Mukuru."],
      },
      {
        title: "Imikono (Signatures)",
        paragraphs: [
          "The DIRECTOR GENERAL/ UMUYOBOZI MUKURU:",
          "UKORESHA AMAZI:",
          "Signature/Umukono: ……………………",
          "Umukono: ……………………",
          "",
          "Izina: Dr. Emmanuel RUKUNDO",
          "Izina: IZINA RY'UHAGARARIYE IKIGO",
          "Icyo akora: Umuyobozi Mukuru",
          "Icyo akora: ICYO ASHINZWE",
          "Itariki: ……………………………",
        ],
      },
    ],
    importantNotice: {
      title: "Important Notice",
      body: "By accepting these terms, you acknowledge that you have read, understood, and agree to comply with all conditions. Violation of any condition may result in permit suspension or revocation.",
    },
  },
  fallback_generic: null,
};



// ── Surface-water-only article (individual abstraction) ───────────────────
//
// The `abstraction_individual` template above was transcribed from the
// GROUNDWATER (borehole) individual contract. That document deliberately
// drops "Article 9: Other people's rights and access to water" — a borehole
// user neither diverts a public water body nor blocks anyone's access to it —
// and therefore numbers every later article one lower than the surface-water
// contract does.
//
// The same template was then used for EVERY individual abstraction permit, so
// surface-water users silently lost the article too (RWB feedback,
// 2026-08-19). The fix re-inserts it — and shifts the later article numbers
// up by one, matching `abstraction_organization` exactly — but only when the
// application is NOT groundwater.
//
// It is done as an *insertion on top of* the template (rather than by editing
// the template and stripping the article for groundwater) so that
// `contract.abstraction_individual.section.<idx>.*` slot ids keep pointing at
// the same section they always did. Assessor text overrides already saved
// against those ids stay correctly attached; the injected article gets its own
// dedicated, index-free slot ids (see `lib/document-slots/contract-slots.ts`).

/** The one variant that carries the groundwater-flavoured template. */
export const SURFACE_ONLY_ARTICLE_VARIANT: PermitVariant = "abstraction_individual";

export type SurfaceOnlyArticleInsertion = {
  /** Stable slot-id fragment — never derived from an array index. */
  key: string;
  language: ContractTermsLanguage;
  /** Template index this section is rendered immediately BEFORE. */
  insertBeforeIndex: number;
  /**
   * Inclusive template index range whose article numbers shift up by one
   * because of this insertion (the rest of that language's block).
   */
  renumberFromIndex: number;
  renumberToIndex: number;
  /** Matches "— Article 12:" / "— Ingingo ya 12:" in a section title. */
  articlePattern: RegExp;
  section: ContractTermsSection;
};

export const SURFACE_ONLY_ARTICLE_INSERTIONS: readonly SurfaceOnlyArticleInsertion[] = [
  {
    key: "other_rights_en",
    language: "en",
    insertBeforeIndex: 9,
    renumberFromIndex: 9,
    renumberToIndex: 19,
    articlePattern: /(—\s*Article\s+)(\d+)(\s*:)/,
    section: {
      title:
        "PART II: RIGHTS AND OBLIGATIONS OF THE WATER USER — Article 9: Other people’s rights and access to water",
      paragraphs: [
        "1. The Water User may not take any action that restricts the right of the public to reasonably use the Water Resources, including, without limitation, the right to fetch water for domestic use.",
        "2. The issuance of a Water Use Permit does not authorize any injury to private or public property nor any invasion of personal rights, or any infringement of any applicable law. The Water User shall be responsible for securing authorization, easements, rights-of-way, leases or permission of land owners to obtain access to the locations specified in the Water Use Permit and all land and properties necessary for diversion purposes prior to commencing proposed works.",
      ],
    },
  },
  {
    key: "other_rights_rw",
    language: "rw",
    insertBeforeIndex: 30,
    renumberFromIndex: 30,
    renumberToIndex: 40,
    articlePattern: /(—\s*Ingingo\s+ya\s+)(\d+)(\s*:)/,
    section: {
      title:
        "IGICE CYA II: UBURENGANZIRA N’INSHINGANO BY’UKORESHA MAZI — Ingingo ya 9: Uburenganzira bw’abandi bantu bwo kugera ku mazi",
      paragraphs: [
        "1.Ukoresha amazi ntashobora gukora ibikorwa bibuza uburenganzira abandi bantu bwo gukoresha umutungo kamere w’amazi, harimo kuvoma amazi akoreshwa murugo.",
        "2. Itangwa ry'Uruhushya ntiritanga uburenganzira bwo kwangiza imitungo y’abantu ku giti cyabo cyangwa iya Leta cyangwa kunyuranya n’amategeko ariho. Ukoresha amazi agomba kuba afite inzira cyangwa ubureganzira bw’abanyirubutaka bumwemererera kugera aho akorera cyangwa aho akura amazi, mbere y’uko atangira imirimo ye.",
      ],
    },
  },
];

/**
 * The insertion indices above are positions inside the template array, so they
 * are only meaningful while the template keeps its current shape. This check
 * verifies the anchors at module load.
 *
 * It deliberately does NOT throw: `lib/contract-terms.ts` is imported by client
 * components (the applicant terms page, the PDF generator), and a thrown module
 * initialiser would take those pages down. Instead a drifting template disables
 * the insertion — degrading to the pre-2026-08-19 behaviour, which is wrong but
 * not broken — and shouts on the server console.
 *
 * `scripts/check-contract-surface-article.ts` asserts the anchors hard, so the
 * drift is caught in dev/CI long before it can reach a user.
 */
const SURFACE_ONLY_ANCHORS_OK: boolean = (function checkSurfaceOnlyAnchors(): boolean {
  const terms = contractTermsByVariant[SURFACE_ONLY_ARTICLE_VARIANT];
  const complain = (message: string): boolean => {
    console.error(
      `contract-terms: ${message} The surface-water Article 9 insertion is DISABLED until SURFACE_ONLY_ARTICLE_INSERTIONS is updated to match the template.`,
    );
    return false;
  };
  if (!terms) {
    return complain(`${SURFACE_ONLY_ARTICLE_VARIANT} template is missing.`);
  }
  // Section count is part of the contract: a section appended after the last
  // renumbered index would silently keep its old article number.
  const expectedLength = 41;
  if (terms.sections.length !== expectedLength) {
    return complain(
      `${SURFACE_ONLY_ARTICLE_VARIANT} has ${terms.sections.length} sections, expected ${expectedLength}.`,
    );
  }
  const expectations: Array<[number, string]> = [
    [8, "Article 8: Deviation from the water use"],
    [9, "Article 9: Records keeping"],
    [19, "Signatures"],
    [29, "Ingingo ya 8: Guhindura imikoreshereze"],
    [30, "Ingingo ya 9: Kubika amakuru"],
    [40, "Imikono"],
  ];
  for (const [index, fragment] of expectations) {
    const title = terms.sections[index]?.title ?? "";
    if (!title.includes(fragment)) {
      return complain(
        `${SURFACE_ONLY_ARTICLE_VARIANT} section[${index}] was expected to contain ${JSON.stringify(fragment)} but is ${JSON.stringify(title)}.`,
      );
    }
  }
  // Same round-trip safety net contract-slots.ts applies to template
  // paragraphs: a paragraph containing the separator would be split in two.
  for (const insertion of SURFACE_ONLY_ARTICLE_INSERTIONS) {
    if (insertion.section.paragraphs.some((p) => p.includes("\n\n"))) {
      return complain(
        `surface-only insertion ${JSON.stringify(insertion.key)} has a paragraph containing the paragraph separator.`,
      );
    }
  }
  return true;
})();

/** Exposed so `scripts/check-contract-surface-article.ts` can assert hard on
 *  what the runtime only warns about. */
export function surfaceOnlyArticleAnchorsOk(): boolean {
  return SURFACE_ONLY_ANCHORS_OK;
}

/**
 * True when the surface-water Article 9 must be added to this contract.
 * Groundwater (borehole) applications keep the template as-is.
 */
export function usesSurfaceOnlyArticle(
  variant: PermitVariant,
  isGroundwater: boolean,
): boolean {
  return (
    SURFACE_ONLY_ANCHORS_OK &&
    variant === SURFACE_ONLY_ARTICLE_VARIANT &&
    !isGroundwater
  );
}

/**
 * Shifts a template section title's article number up by one when the
 * surface-water insertion sits above it. Returns the title untouched for
 * every other variant, index, source, or non-numbered title ("Preamble",
 * "Article one", "Signatures", …).
 *
 * Call this exactly ONCE per rendered title — it is not idempotent. The slot
 * catalogue applies it when producing a section title's default text, and the
 * contract resolver applies it only on the no-slot fallback path, so a title
 * never passes through it twice. An assessor-authored title override is left
 * verbatim, as with every other slot.
 */
export function applySurfaceOnlyArticleNumbering(
  title: string,
  variant: PermitVariant,
  templateIndex: number,
  /** Result of {@link usesSurfaceOnlyArticle} for this application. */
  applies: boolean,
): string {
  if (!applies || variant !== SURFACE_ONLY_ARTICLE_VARIANT) return title;
  for (const insertion of SURFACE_ONLY_ARTICLE_INSERTIONS) {
    if (
      templateIndex < insertion.renumberFromIndex ||
      templateIndex > insertion.renumberToIndex
    ) {
      continue;
    }
    const match = insertion.articlePattern.exec(title);
    if (!match) continue;
    return title.replace(
      insertion.articlePattern,
      (_full, prefix: string, num: string, suffix: string) =>
        `${prefix}${Number(num) + 1}${suffix}`,
    );
  }
  return title;
}

/**
 * Reconciles an already-RESOLVED section title with the surface-water
 * renumbering.
 *
 * `applySurfaceOnlyArticleNumbering` shifts the *default* text, but an
 * assessor title override is stored verbatim and is used as-is. An override
 * written before this fix carries the pre-shift number, so it would collide
 * with the injected Article 9 ("…Article 9: Records keeping" printed right
 * under "…Article 9: Other people's rights").
 *
 * So: shift the resolved title only when it still bears the template's
 * original article number. An override whose number was already shifted (the
 * normal default path) or deliberately set to something else is left alone,
 * which also makes this safe to apply on top of the default path.
 */
export function reconcileSurfaceOnlyArticleNumber(
  resolvedTitle: string,
  templateTitle: string,
  variant: PermitVariant,
  templateIndex: number,
  applies: boolean,
): string {
  if (!applies || variant !== SURFACE_ONLY_ARTICLE_VARIANT) return resolvedTitle;
  for (const insertion of SURFACE_ONLY_ARTICLE_INSERTIONS) {
    if (
      templateIndex < insertion.renumberFromIndex ||
      templateIndex > insertion.renumberToIndex
    ) {
      continue;
    }
    const templateNumber = insertion.articlePattern.exec(templateTitle)?.[2];
    const resolvedNumber = insertion.articlePattern.exec(resolvedTitle)?.[2];
    if (!templateNumber || resolvedNumber !== templateNumber) continue;
    return applySurfaceOnlyArticleNumbering(
      resolvedTitle,
      variant,
      templateIndex,
      applies,
    );
  }
  return resolvedTitle;
}
