/**
 * Site content an administrator may change without a deploy.
 *
 * The defaults below are the values that used to be hardcoded in the header,
 * footer and /contact page; a row in `site_content` overrides one of them.
 * Shared by the public read route, the admin editor and the client components,
 * so it must stay free of server-only imports.
 */
export type SiteContact = {
  name: string
  title: string
  phone: string
  email: string
}

export type SiteContent = {
  guidelines_url: string
  user_manual_url: string
  office: { address: string; email: string; phone: string; hours: string }
  contacts: SiteContact[]
}

export const SITE_CONTENT_DEFAULTS: SiteContent = {
  guidelines_url: "/Water_Use_Permitting_Guidelines.pdf",
  user_manual_url: "/assets/User_Manual_Guide_Rwanda_Water_Permit_Application_Portal.pdf",
  office: {
    address: "KN 3 AV Avenue, Nyarugenge Pension Plaza, Sopetrade",
    email: "info@rwb.rw",
    phone: "9977",
    hours: "Mon-Fri: 8:00 AM - 5:00 PM",
  },
  contacts: [],
}

export const SITE_CONTENT_KEYS = Object.keys(SITE_CONTENT_DEFAULTS) as (keyof SiteContent)[]

/** Merge stored rows over the defaults. Unknown keys are ignored. */
export function mergeSiteContent(rows: { key: string; value: unknown }[]): SiteContent {
  const out: SiteContent = { ...SITE_CONTENT_DEFAULTS, office: { ...SITE_CONTENT_DEFAULTS.office } }
  for (const row of rows) {
    if (!SITE_CONTENT_KEYS.includes(row.key as keyof SiteContent)) continue
    if (row.value === null || row.value === undefined || row.value === "") continue
    ;(out as any)[row.key] = row.value
  }
  return out
}
