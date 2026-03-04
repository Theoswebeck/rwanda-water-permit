import { qrToSvgString } from "@/lib/qr/qr-svg";
import { QrCodeEcc } from "@/lib/qr/qrcodegen";

// Always use production URL for QR codes - they will be printed and scanned externally
const PRODUCTION_URL = "https://rwandawaterpermit.com";

export type PermitPreviewData = {
  permitNumber: string;
  applicantName: string;
  issueDate: string; // e.g. "2025-12-01"
  expiryDate: string;
  waterSource: string;
  purpose: string;
  authorizedVolume: string;
  location: string;
  issuingAuthority: string;
  verificationUrl: string;
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getSamplePermitPreviewData(_origin = "http://localhost:3000"): PermitPreviewData {
  const permitNumber = "WP-2025-12-001";
  return {
    permitNumber,
    applicantName: "Kigali Business Group Ltd.",
    issueDate: "2025-12-01",
    expiryDate: "2030-12-01",
    waterSource: "Groundwater",
    purpose: "Commercial Supply",
    authorizedVolume: "150 m³/day",
    location: "Kigali, Gasabo District",
    issuingAuthority: "Rwanda Water Resources Board",
    // Always use production URL - QR codes are scanned by external devices
    verificationUrl: `${PRODUCTION_URL}/permit/view/${encodeURIComponent(permitNumber)}`,
  };
}

/**
 * Standalone HTML preview for a permit with a bottom QR footer.
 * - Designed to keep UX clean: footer is visually separated and does not collide with content.
 * - Uses an A4-like canvas and reserves space for footer so content never overlaps the QR.
 */
export function renderPermitPreviewHtml(data: PermitPreviewData): string {
  const qrSvg = qrToSvgString(data.verificationUrl, {
    ecl: QrCodeEcc.HIGH, // HIGH error correction for better scannability
    scale: 3,
    border: 4,
    ariaLabel: `Verify permit ${data.permitNumber}`,
    darkColor: "#000000", // Pure black for maximum contrast
    lightColor: "#ffffff", // Pure white for maximum contrast
  });

  const safe = {
    permitNumber: escapeHtml(data.permitNumber),
    applicantName: escapeHtml(data.applicantName),
    issueDate: escapeHtml(data.issueDate),
    expiryDate: escapeHtml(data.expiryDate),
    waterSource: escapeHtml(data.waterSource),
    purpose: escapeHtml(data.purpose),
    authorizedVolume: escapeHtml(data.authorizedVolume),
    location: escapeHtml(data.location),
    issuingAuthority: escapeHtml(data.issuingAuthority),
    verificationUrl: escapeHtml(data.verificationUrl),
  };

  // A4 @ 96dpi ≈ 794×1123. Use min-height so it looks like a document.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Permit Preview</title>
    <style>
      :root{
        --ink:#0f172a;
        --muted:#475569;
        --line:#e2e8f0;
        --brand:#075985;
        --paper:#ffffff;
        --bg:#f1f5f9;
      }
      *{ box-sizing:border-box; }
      body{
        margin:0;
        background:var(--bg);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        color:var(--ink);
      }
      .wrap{
        padding:24px;
        display:flex;
        justify-content:center;
      }
      .page{
        width:794px;
        min-height:1123px;
        background:var(--paper);
        border:1px solid var(--line);
        border-radius:12px;
        box-shadow:0 10px 30px rgba(15,23,42,.08);
        position:relative;
        overflow:hidden;
      }
      .content{
        padding:40px 44px 210px; /* reserve footer space */
      }
      .header{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:24px;
      }
      .crest{
        width:44px;height:44px;border-radius:999px;
        background:rgba(7,89,133,.10);
        border:1px solid rgba(7,89,133,.20);
        display:flex;align-items:center;justify-content:center;
        font-weight:700;color:var(--brand);
        flex:none;
      }
      .title{
        text-align:center;
        flex:1;
        padding-top:2px;
      }
      .title h1{
        margin:0;
        font-size:20px;
        letter-spacing:.02em;
        text-transform:uppercase;
        color:var(--brand);
      }
      .title p{
        margin:8px 0 0;
        font-size:12px;
        color:var(--muted);
      }
      .permit-no{
        text-align:right;
        flex:none;
      }
      .permit-no .label{
        font-size:11px;color:var(--muted);
        margin-bottom:6px;
      }
      .permit-no .value{
        font-weight:700;
        letter-spacing:.02em;
        padding:8px 10px;
        border:1px solid var(--line);
        border-radius:10px;
        display:inline-block;
        background:#f8fafc;
      }
      .rule{
        height:3px;
        background:linear-gradient(90deg, rgba(7,89,133,1) 0%, rgba(14,116,144,1) 60%, rgba(2,132,199,1) 100%);
        border-radius:999px;
        margin:18px 0 20px;
      }
      .grid{
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap:14px 22px;
        margin-top:8px;
      }
      .field{
        border:1px solid var(--line);
        border-radius:12px;
        padding:12px 12px;
        background:#ffffff;
      }
      .field .k{
        font-size:11px;
        color:var(--muted);
        margin:0 0 6px;
      }
      .field .v{
        font-size:13px;
        margin:0;
        line-height:1.35;
      }
      .field.span2{ grid-column: 1 / -1; }

      .footer{
        position:absolute;
        left:0; right:0; bottom:0;
        border-top:1px solid var(--line);
        background:#fbfdff;
        padding:14px 44px;
      }
      .footer-inner{
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
      }
      .qr{
        flex:none;
        border:1px solid var(--line);
        background:#fff;
        border-radius:12px;
        padding:10px;
        display:flex;
        align-items:center;
        justify-content:center;
      }
      .qr svg{
        display:block;
        width:118px;
        height:118px;
      }
      .qr-disclaimer{
        margin-top:10px;
        font-size:10px;
        color:var(--muted);
        text-align:center;
        max-width:500px;
        line-height:1.4;
        font-style:italic;
      }
      @media print{
        body{ background:#fff; }
        .wrap{ padding:0; }
        .page{ box-shadow:none; border:none; border-radius:0; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="page">
        <div class="content">
          <div class="header">
            <div class="crest">RWB</div>
            <div class="title">
              <h1>Water Permit Certificate</h1>
              <p>Issued by ${safe.issuingAuthority}</p>
            </div>
            <div class="permit-no">
              <div class="label">Permit No</div>
              <div class="value">${safe.permitNumber}</div>
            </div>
          </div>
          <div class="rule"></div>

          <div class="grid">
            <div class="field">
              <p class="k">Permit Holder</p>
              <p class="v">${safe.applicantName}</p>
            </div>
            <div class="field">
              <p class="k">Location</p>
              <p class="v">${safe.location}</p>
            </div>
            <div class="field">
              <p class="k">Issue Date</p>
              <p class="v">${safe.issueDate}</p>
            </div>
            <div class="field">
              <p class="k">Expiry Date</p>
              <p class="v">${safe.expiryDate}</p>
            </div>
            <div class="field">
              <p class="k">Water Source</p>
              <p class="v">${safe.waterSource}</p>
            </div>
            <div class="field">
              <p class="k">Purpose</p>
              <p class="v">${safe.purpose}</p>
            </div>
            <div class="field span2">
              <p class="k">Authorized Volume</p>
              <p class="v">${safe.authorizedVolume}</p>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="footer-inner">
            <div class="qr">${qrSvg}</div>
            <p class="qr-disclaimer">This digital permit is only valid if the information on it is the same as the information as the water use permit registry.</p>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}






