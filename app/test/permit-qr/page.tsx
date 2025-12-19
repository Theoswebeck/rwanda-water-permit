import { headers } from "next/headers";
import { PermitQrPreviewClient } from "@/app/test/permit-qr/PermitQrPreviewClient";
import { getSamplePermitPreviewData, renderPermitPreviewHtml } from "@/lib/permit/permit-preview-html";

function getOriginFromHeaders(): string {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default function PermitQrTestPage() {
  const origin = getOriginFromHeaders();
  const sample = getSamplePermitPreviewData(origin);
  const html = renderPermitPreviewHtml(sample);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-4 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">QR Permit Footer Preview</h1>
        <p className="text-sm text-muted-foreground">
          Preview-only page. Once approved, we’ll embed the same footer style into the generated permit.
        </p>
      </div>

      <PermitQrPreviewClient html={html} />
    </div>
  );
}



