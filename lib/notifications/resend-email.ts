type SendResendEmailParams = {
  to: string
  subject: string
  title: string
  text: string
}

export function renderAppEmailHtml(params: { title: string; text: string }) {
  const escaped = params.text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')

  const orgName = process.env.ORG_NAME || 'Rwanda Water Resources Board'

  return `
    <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6;max-width:680px;margin:0 auto;padding:24px">
      <div style="text-align:center;margin-bottom:20px">
        <h1 style="color:#111827;margin:0">${orgName}</h1>
        <h2 style="color:#374151;margin:10px 0">${params.title}</h2>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:18px;color:#111827">
        ${escaped}
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#6b7280;font-size:12px;text-align:center;margin:0">${orgName} - Water Permit Application System</p>
    </div>
  `
}

export async function sendResendEmail(params: SendResendEmailParams) {
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.EMAIL_FROM || 'nouru@menlohq.com'
  const isDev = process.env.NODE_ENV !== 'production' || process.env.EMAIL_DEV_MODE === 'true'

  if (!resendKey) {
    if (isDev) {
      console.warn('⚠️ RESEND_API_KEY not configured; skipping email send in dev mode.')
      return { delivered: false as const, skipped: true as const }
    }
    throw new Error('Email provider not configured. Set RESEND_API_KEY.')
  }

  const html = renderAppEmailHtml({ title: params.title, text: params.text })
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      html,
    }),
  })

  const responseText = await resp.text()
  if (!resp.ok) {
    throw new Error(`Resend API error: status=${resp.status}, body=${responseText}`)
  }

  return { delivered: true as const, skipped: false as const }
}


