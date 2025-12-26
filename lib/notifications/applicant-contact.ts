export type ApplicantContact = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  account_type?: string | null
  phone?: string | null
  mobile_phone?: string | null
  landline_phone?: string | null
  company_phone?: string | null
}

export const getApplicantName = (u: ApplicantContact) => {
  const acct = String(u.account_type || '').toLowerCase()
  if (acct === 'individual') return `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Applicant'
  return (u.company_name || '').trim() || 'Applicant'
}

export const getApplicantPhone = (u: ApplicantContact) => {
  return u.phone || u.mobile_phone || u.landline_phone || u.company_phone || null
}




