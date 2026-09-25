import nodemailer from 'nodemailer'

type SendSmtpEmailParams = {
  to: string
  subject: string
  title: string
  text: string
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderAppEmailHtml(params: { title: string; text: string }) {
  const escaped = escapeHtml(params.text).replace(/\n/g, '<br/>')

  const orgName = escapeHtml(process.env.ORG_NAME || 'Rwanda Water Resources Board')
  const safeTitle = escapeHtml(params.title)

  return `
    <div style="font-family:Inter,system-ui,Arial,sans-serif;line-height:1.6;max-width:680px;margin:0 auto;padding:24px">
      <div style="text-align:center;margin-bottom:20px">
        <h1 style="color:#111827;margin:0">${orgName}</h1>
        <h2 style="color:#374151;margin:10px 0">${safeTitle}</h2>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:18px;color:#111827">
        ${escaped}
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#6b7280;font-size:12px;text-align:center;margin:0">${orgName} - Water Permit Application System</p>
    </div>
  `
}

export async function sendSmtpEmail(params: SendSmtpEmailParams) {
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10)
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const fromEmail = process.env.EMAIL_FROM || smtpUser || ''
  const isDev = process.env.NODE_ENV !== 'production' || process.env.EMAIL_DEV_MODE === 'true'

  if (!smtpUser || !smtpPass) {
    if (isDev) {
      console.warn('⚠️ SMTP not configured; skipping email send in dev mode.')
      return { delivered: false as const, skipped: true as const }
    }
    throw new Error('Email provider not configured. Set SMTP_USER and SMTP_PASS.')
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost || 'mail.notification.rwb.rw',
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const html = renderAppEmailHtml({ title: params.title, text: params.text })

  await transporter.sendMail({
    from: fromEmail,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html,
  })

  return { delivered: true as const, skipped: false as const }
}
