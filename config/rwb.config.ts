/**
 * ========================================================
 * Rwanda Water Resources Board (RWB) - System Configuration
 * ========================================================
 * Unified Enterprise Configuration for Rwanda Water Resources Board (RWB)
 * System: Rwanda Water Permit Portal (RWPP)
 */

export interface SystemConfig {
  name: string;
  acronym: string;
  tagline: string;
  description: string;
  version: string;
  institution: {
    name: string;
    ministry: string;
    country: string;
    logoUrl: string;
    logoTransparentUrl: string;
    logoWhiteTextUrl: string;
    faviconUrl: string;
    websiteUrl: string;
  };
  contact: {
    supportEmail: string;
    supportPhone: string;
    adminEmail: string;
    officeAddress: string;
  };
  theme: {
    primaryColor: string; // Official RWB Blue #0072bc
    primaryDarkColor: string; // #005a96
    backgroundColor: string; // #f3f5fa
  };
  api: {
    baseUrl: string;
  };
}

export const rwbConfig: SystemConfig = {
  name: "Rwanda Water Permit Portal",
  acronym: "RWPP",
  tagline: "Water Concession Application & Compliance Portal",
  description:
    "Official digital water permit application, technical assessment, site inspection, and concession management platform of the Rwanda Water Resources Board.",
  version: "2.0.0",

  institution: {
    name: "Rwanda Water Resources Board",
    ministry: "Ministry of Environment",
    country: "Republic of Rwanda",
    logoUrl: "/images/logo_New.png",
    logoTransparentUrl: "/images/rwb_header_logo_transparent.png",
    logoWhiteTextUrl: "/images/rwb_header_logo_white_text.png",
    faviconUrl: "/images/favicon_new.png",
    websiteUrl: "https://www.rwb.rw",
  },

  contact: {
    supportEmail: "waterpermit@notification.rwb.rw",
    supportPhone: "+250 788 123 456",
    adminEmail: "waterpermit@notification.rwb.rw",
    officeAddress: "Kigali, Rwanda - Nyarugenge Pension Plaza",
  },

  theme: {
    primaryColor: "#0072bc",
    primaryDarkColor: "#005a96",
    backgroundColor: "#f3f5fa",
  },

  api: {
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  },
};

