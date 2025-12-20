import { QrCode, QrCodeEcc } from "@/lib/qr/qrcodegen";

export type QrSvgOptions = {
  ecl?: QrCodeEcc;
  border?: number; // modules
  scale?: number; // px per module
  darkColor?: string;
  lightColor?: string;
  ariaLabel?: string;
};

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Returns an inline SVG string (no external CSS) for safe embedding in HTML.
 */
export function qrToSvgString(text: string, opts: QrSvgOptions = {}): string {
  const qr = QrCode.encodeText(text, opts.ecl ?? QrCodeEcc.MEDIUM);
  const border = opts.border ?? 4;
  const scale = opts.scale ?? 4;
  const dark = opts.darkColor ?? "#111827";
  const light = opts.lightColor ?? "#ffffff";
  const size = qr.size + border * 2;
  const viewBox = `0 0 ${size} ${size}`;

  let path = "";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        const xx = x + border;
        const yy = y + border;
        path += `M${xx},${yy}h1v1h-1z `;
      }
    }
  }

  const title = opts.ariaLabel ? `<title>${escapeXml(opts.ariaLabel)}</title>` : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size * scale}" height="${size * scale}" role="img" aria-label="${escapeXml(opts.ariaLabel ?? "QR code")}">`,
    title,
    `<rect width="100%" height="100%" fill="${escapeXml(light)}"/>`,
    `<path d="${path.trim()}" fill="${escapeXml(dark)}"/>`,
    `</svg>`,
  ].join("");
}




