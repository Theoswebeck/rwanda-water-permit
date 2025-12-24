import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { qrToSvgString } from "@/lib/qr/qr-svg";

type Permit = {
  id: string;
  title: string;
  issueDate: string;
  expiryDate: string;
  status: "active" | "expired" | "expiring-soon";
  type: string;
  location: string;
  permitNumber: string;
  waterSource: string;
  purpose: string;
  waterAllowance: string;
  issuingAuthority: string;
  applicationDetails?: {
    applicantName: string;
    applicantType: string;
    contactEmail: string;
    contactPhone: string;
    landOwnership: string;
    environmentalAssessment: string;
  };
  conditions: string[];
  inspections: Array<{
    date: string;
    status: string;
    notes: string;
  }>;
};

type Application = {
  id: string;
  application_number: string;
  project_title: string;
  status: string;
  application_type: string;
  water_source: string;
  water_purpose: string;
  estimated_usage_volume: number;
  usage_unit: string;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village?: string;
  location_description?: string;
  project_description?: string;
  project_value?: number;
  water_taking_method?: string;
  water_measuring_method?: string;
  storage_facilities?: string;
  return_flow_description?: string;
  environmental_assessment?: string;
  mitigation_actions?: string;
  max_yearly_volume_m3?: number;
  concession_area?: number;
  applicant: {
    first_name?: string;
    last_name?: string;
    company_name?: string;
    email: string;
    phone?: string;
    account_type: string;
  };
};

const PERMIT_VERIFY_BASE_URL = "https://rwanda-water-permit-production.up.railway.app";

function buildPermitVerificationUrl(permitNumber: string): string {
  return `${PERMIT_VERIFY_BASE_URL}/permit/view/${encodeURIComponent(permitNumber)}`;
}

async function qrPngDataUrl(text: string, px: number): Promise<string> {
  // Client-only: jsPDF generation runs in the browser. Keep this helper here to avoid server-side usage.
  const svg = qrToSvgString(text, {
    scale: 6,
    border: 4,
    ariaLabel: "Permit verification QR",
    darkColor: "#0f172a",
    lightColor: "#ffffff",
  });

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    const dataUrl: string = await new Promise((resolve, reject) => {
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = px;
          canvas.height = px;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas context unavailable");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, px, px);
          ctx.drawImage(img, 0, 0, px, px);
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("Failed to load QR SVG image"));
      img.src = url;
    });
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawPermitQrFooter(opts: {
  doc: jsPDF;
  permitNumber: string;
}): Promise<void> {
  const { doc, permitNumber } = opts;
  const verifyUrl = buildPermitVerificationUrl(permitNumber);

  // Layout constants (jsPDF default is A4 in mm)
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 15;

  // Keep clear of existing footer text at y=285 and y=295
  const footerBottomPadding = 14;
  const footerY = pageHeight - 50 - footerBottomPadding; // ~246 on A4
  const footerH = 36;
  const footerW = pageWidth - marginX * 2;

  const qrBox = 34;
  const qrPadding = 2.5;
  const qrX = marginX + footerW - qrBox;
  const qrY = footerY + (footerH - qrBox) / 2;
  const qrSize = qrBox - qrPadding * 2;

  // Background container
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(251, 253, 255);
  doc.roundedRect(marginX, footerY, footerW, footerH, 2, 2, "FD");

  // Left text block (kept narrow to avoid crowding QR)
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text("Verify this permit", marginX + 8, footerY + 12);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  const desc = "Scan the QR code to view this permit in the system.";
  const descLines = doc.splitTextToSize(desc, footerW - qrBox - 18);
  doc.text(descLines, marginX + 8, footerY + 18);

  doc.setTextColor(7, 89, 133);
  doc.setFontSize(8);
  const urlLines = doc.splitTextToSize(verifyUrl, footerW - qrBox - 18);
  doc.text(urlLines, marginX + 8, footerY + 30);

  // QR "card"
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrX, qrY, qrBox, qrBox, 2, 2, "FD");

  return qrPngDataUrl(verifyUrl, 512).then((png) => {
    doc.addImage(png, "PNG", qrX + qrPadding, qrY + qrPadding, qrSize, qrSize);
  });
}

export const generateDigitalWaterPermit = async (
  application: Application,
  permitNumber: string,
  conditions: string[] = [],
  permitValidityYears: number = 5
): Promise<void> => {
  const doc = new jsPDF();
  
  // Helper function to format currency
  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: 'RWF',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const applicantName = application.applicant.account_type === 'individual' 
    ? `${application.applicant.first_name} ${application.applicant.last_name}`
    : application.applicant.company_name || 'Unknown';

  const issueDate = new Date();
  const expiryDate = new Date();
  expiryDate.setFullYear(issueDate.getFullYear() + permitValidityYears);

  try {
    // Add official logos with proper sizing
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    const moeLogoUrl = `${window.location.origin}/assets/ministry_of_env_logo.png`;
    
    // Left logo - Rwanda Water Resources Board (circular logo)
    doc.addImage(rwbLogoUrl, 'PNG', 15, 10, 35, 35);
    
    // Right logo - Ministry of Environment (also circular)
    doc.addImage(moeLogoUrl, 'PNG', 150, 10, 35, 35);
  } catch (error) {
    console.error('Error loading logos:', error);
    // Fallback to text headers
    doc.setFontSize(12);
    doc.setTextColor(0, 75, 135);
    doc.text('Rwanda Water Resources Board', 15, 25);
    doc.text('Ministry of Environment', 195, 25, { align: 'right' });
  }

  // Official header
  doc.setFontSize(16);
  doc.setTextColor(0, 75, 135);
  doc.text('REPUBLIC OF RWANDA', 105, 20, { align: 'center' });
  doc.setFontSize(14);
  doc.text('RWANDA WATER RESOURCES BOARD', 105, 28, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Ministry of Environment', 105, 35, { align: 'center' });

  // Blue separator line
  doc.setDrawColor(0, 100, 150);
  doc.setFillColor(0, 100, 150);
  doc.roundedRect(15, 50, 180, 2, 1, 1, 'F');

  // Main title
  doc.setFontSize(20);
  doc.setTextColor(0, 75, 135);
  doc.text('WATER PERMIT CERTIFICATE', 105, 65, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  doc.text(`Permit No: ${permitNumber}`, 105, 75, { align: 'center' });

  // Permit validity dates
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Issue Date: ${formatDate(issueDate.toISOString())}`, 15, 85);
  doc.text(`Expiry Date: ${formatDate(expiryDate.toISOString())}`, 195, 85, { align: 'right' });

  // Divider
  doc.setDrawColor(0, 100, 150);
  doc.setLineWidth(0.5);
  doc.line(15, 90, 195, 90);

  let currentY = 100;

  // SECTION 1: PERMIT HOLDER INFORMATION
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('PERMIT HOLDER INFORMATION', 15, currentY);
  currentY += 5;

  const holderInfo = [
    ['Name', applicantName],
    ['Type', application.applicant.account_type === 'individual' ? 'Individual' : 'Organization'],
    ['Email', application.applicant.email],
    ['Phone', application.applicant.phone || 'N/A'],
    ['Application Number', application.application_number]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Property', 'Value']],
    body: holderInfo,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 100, 150],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 248, 252],
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 120 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // SECTION 2: PROJECT INFORMATION
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('PROJECT INFORMATION', 15, currentY);
  currentY += 5;

  const projectInfo = [
    ['Project Title', application.project_title],
    ['Application Type', application.application_type.replace('_', ' ').toUpperCase()],
    ['Project Value', formatCurrency(application.project_value)],
    ['Description', application.project_description || 'N/A'],
    ['Location', `${application.village || ''} ${application.cell}, ${application.sector}, ${application.district}, ${application.province}`.trim()],
    ['Location Description', application.location_description || 'N/A']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Property', 'Value']],
    body: projectInfo,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 100, 150],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 248, 252],
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 120 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Check if we need a new page
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  // SECTION 3: WATER USE AUTHORIZATION
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('WATER USE AUTHORIZATION', 15, currentY);
  currentY += 5;

  const waterInfo = [
    ['Water Source', application.water_source.replace('_', ' ').toUpperCase()],
    ['Purpose', application.water_purpose.replace('_', ' ').toUpperCase()],
    ['Authorized Volume', `${application.estimated_usage_volume?.toLocaleString() || 'N/A'} ${application.usage_unit || ''}`],
    ['Maximum Yearly Volume', application.max_yearly_volume_m3 ? `${application.max_yearly_volume_m3.toLocaleString()} m³` : 'N/A'],
    ['Concession Area', application.concession_area ? `${application.concession_area} hectares` : 'N/A']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Authorization Details', 'Specification']],
    body: waterInfo,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 100, 150],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 248, 252],
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 120 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // SECTION 4: PERMIT CONDITIONS
  if (conditions && conditions.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(0, 75, 135);
    doc.text('PERMIT CONDITIONS', 15, currentY);
    currentY += 5;

    const conditionsBody = conditions.map((condition, index) => {
      return [`${index + 1}.`, condition];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Condition']],
      body: conditionsBody,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 140, 0],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [255, 248, 240],
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 165 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Add new page for legal information if needed
  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  // LEGAL DISCLAIMER
  doc.setFontSize(12);
  doc.setTextColor(139, 0, 0);
  doc.text('LEGAL NOTICE AND CONDITIONS', 15, currentY);
  currentY += 10;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const legalText = [
    "1. This permit is issued under the Water Law of Rwanda and is subject to all applicable regulations.",
    "2. The permit holder must comply with all conditions specified herein and maintain accurate records.",
    "3. Water extraction must not exceed authorized volumes and must be used only for specified purposes.",
    "4. The Rwanda Water Resources Board reserves the right to conduct periodic inspections.",
    "5. This permit is non-transferable without prior written approval from the Rwanda Water Resources Board.",
    "6. Violation of any condition may result in permit suspension or revocation."
  ];

  legalText.forEach((text, index) => {
    const lines = doc.splitTextToSize(text, 170);
    doc.text(lines, 15, currentY + (index * 12));
  });

  currentY += legalText.length * 12 + 20;

  // SIGNATURE SECTION
  doc.setFontSize(12);
  doc.setTextColor(0, 75, 135);
  doc.text('OFFICIAL AUTHORIZATION', 105, currentY, { align: 'center' });
  currentY += 15;

  // Authority signature box
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.rect(30, currentY, 70, 40);
  doc.setFontSize(10);
  doc.text('Rwanda Water Resources Board', 65, currentY + 8, { align: 'center' });
  doc.text('Authorized Officer', 65, currentY + 20, { align: 'center' });
  doc.text('Date and Signature', 65, currentY + 35, { align: 'center' });

  // Permit holder acknowledgment box
  doc.rect(110, currentY, 70, 40);
  doc.text('Permit Holder', 145, currentY + 8, { align: 'center' });
  doc.text('Acknowledgment', 145, currentY + 20, { align: 'center' });
  doc.text('Date and Signature', 145, currentY + 35, { align: 'center' });

  // If signature blocks push too low, add a clean page for the QR footer
  if (currentY + 50 > 235) {
    doc.addPage();
  }

  // Add QR footer on the last page only
  await drawPermitQrFooter({ doc, permitNumber });

  // Footer with security features
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    
    // Security footer
    const securityText = "This is an official water permit certificate issued by the Rwanda Water Resources Board. " +
                        "Unauthorized modification is prohibited by law. Verify authenticity at rwb.gov.rw";
    // On the last page, keep the line a little narrower to avoid feeling cramped with the QR footer above.
    doc.text(securityText, 15, 285, { maxWidth: i === pageCount ? 165 : 180 });
    
    // Page numbers and metadata
    doc.text(`Page ${i} of ${pageCount}`, 195, 295, { align: 'right' });
    doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 15, 295);
    doc.text(`Document ID: ${permitNumber}`, 105, 295, { align: 'center' });
  }

  // Generate and open PDF
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
};

/**
 * Generate a digital water permit PDF as a Blob (does NOT open a new tab).
 * This is used when we need to persist the exact PDF to Supabase Storage.
 */
export const generateDigitalWaterPermitBlob = async (
  application: Application,
  permitNumber: string,
  conditions: string[] = [],
  permitValidityYears: number = 5
): Promise<Blob> => {
  const doc = new jsPDF();

  // Helper function to format currency
  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: 'RWF',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const applicantName = application.applicant.account_type === 'individual' 
    ? `${application.applicant.first_name} ${application.applicant.last_name}`
    : application.applicant.company_name || 'Unknown';

  const issueDate = new Date();
  const expiryDate = new Date();
  expiryDate.setFullYear(issueDate.getFullYear() + permitValidityYears);

  try {
    // Add official logos with proper sizing
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    const moeLogoUrl = `${window.location.origin}/assets/ministry_of_env_logo.png`;
    
    // Left logo - Rwanda Water Resources Board (circular logo)
    doc.addImage(rwbLogoUrl, 'PNG', 15, 10, 35, 35);
    
    // Right logo - Ministry of Environment (also circular)
    doc.addImage(moeLogoUrl, 'PNG', 150, 10, 35, 35);
  } catch (error) {
    console.error('Error loading logos:', error);
    // Fallback to text headers
    doc.setFontSize(12);
    doc.setTextColor(0, 75, 135);
    doc.text('Rwanda Water Resources Board', 15, 25);
    doc.text('Ministry of Environment', 195, 25, { align: 'right' });
  }

  // Official header
  doc.setFontSize(16);
  doc.setTextColor(0, 75, 135);
  doc.text('REPUBLIC OF RWANDA', 105, 20, { align: 'center' });
  doc.setFontSize(14);
  doc.text('RWANDA WATER RESOURCES BOARD', 105, 28, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Ministry of Environment', 105, 35, { align: 'center' });

  // Blue separator line
  doc.setDrawColor(0, 100, 150);
  doc.setFillColor(0, 100, 150);
  doc.roundedRect(15, 50, 180, 2, 1, 1, 'F');

  // Main title
  doc.setFontSize(20);
  doc.setTextColor(0, 75, 135);
  doc.text('WATER PERMIT CERTIFICATE', 105, 65, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  doc.text(`Permit No: ${permitNumber}`, 105, 75, { align: 'center' });

  // Permit validity dates
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Issue Date: ${formatDate(issueDate.toISOString())}`, 15, 85);
  doc.text(`Expiry Date: ${formatDate(expiryDate.toISOString())}`, 195, 85, { align: 'right' });

  // Divider
  doc.setDrawColor(0, 100, 150);
  doc.setLineWidth(0.5);
  doc.line(15, 90, 195, 90);

  let currentY = 100;

  // SECTION 1: PERMIT HOLDER INFORMATION
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('PERMIT HOLDER INFORMATION', 15, currentY);
  currentY += 5;

  const holderInfo = [
    ['Name', applicantName],
    ['Type', application.applicant.account_type === 'individual' ? 'Individual' : 'Organization'],
    ['Email', application.applicant.email],
    ['Phone', application.applicant.phone || 'N/A'],
    ['Application Number', application.application_number]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Property', 'Value']],
    body: holderInfo,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 100, 150],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 248, 252],
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 120 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // SECTION 2: PROJECT INFORMATION
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('PROJECT INFORMATION', 15, currentY);
  currentY += 5;

  const projectInfo = [
    ['Project Title', application.project_title],
    ['Application Type', application.application_type.replace('_', ' ').toUpperCase()],
    ['Project Value', formatCurrency(application.project_value)],
    ['Description', application.project_description || 'N/A'],
    ['Location', `${application.village || ''} ${application.cell}, ${application.sector}, ${application.district}, ${application.province}`.trim()],
    ['Location Description', application.location_description || 'N/A']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Property', 'Value']],
    body: projectInfo,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 100, 150],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 248, 252],
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 120 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Check if we need a new page
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  // SECTION 3: WATER USE AUTHORIZATION
  doc.setFontSize(14);
  doc.setTextColor(0, 75, 135);
  doc.text('WATER USE AUTHORIZATION', 15, currentY);
  currentY += 5;

  const waterInfo = [
    ['Water Source', application.water_source.replace('_', ' ').toUpperCase()],
    ['Purpose', application.water_purpose.replace('_', ' ').toUpperCase()],
    ['Authorized Volume', `${application.estimated_usage_volume?.toLocaleString() || 'N/A'} ${application.usage_unit || ''}`],
    ['Maximum Yearly Volume', application.max_yearly_volume_m3 ? `${application.max_yearly_volume_m3.toLocaleString()} m³` : 'N/A'],
    ['Concession Area', application.concession_area ? `${application.concession_area} hectares` : 'N/A']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Authorization Details', 'Specification']],
    body: waterInfo,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 100, 150],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 248, 252],
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 120 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // SECTION 4: PERMIT CONDITIONS
  if (conditions && conditions.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(0, 75, 135);
    doc.text('PERMIT CONDITIONS', 15, currentY);
    currentY += 5;

    const conditionsBody = conditions.map((condition, index) => {
      return [`${index + 1}.`, condition];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Condition']],
      body: conditionsBody,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 140, 0],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [255, 248, 240],
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 165 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Add new page for legal information if needed
  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  // LEGAL DISCLAIMER
  doc.setFontSize(12);
  doc.setTextColor(139, 0, 0);
  doc.text('LEGAL NOTICE AND CONDITIONS', 15, currentY);
  currentY += 10;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  const legalText = [
    "1. This permit is issued under the Water Law of Rwanda and is subject to all applicable regulations.",
    "2. The permit holder must comply with all conditions specified herein and maintain accurate records.",
    "3. Water extraction must not exceed authorized volumes and must be used only for specified purposes.",
    "4. The Rwanda Water Resources Board reserves the right to conduct periodic inspections.",
    "5. This permit is non-transferable without prior written approval from the Rwanda Water Resources Board.",
    "6. Violation of any condition may result in permit suspension or revocation."
  ];

  legalText.forEach((text, index) => {
    const lines = doc.splitTextToSize(text, 170);
    doc.text(lines, 15, currentY + (index * 12));
  });

  currentY += legalText.length * 12 + 20;

  // SIGNATURE SECTION
  doc.setFontSize(12);
  doc.setTextColor(0, 75, 135);
  doc.text('OFFICIAL AUTHORIZATION', 105, currentY, { align: 'center' });
  currentY += 15;

  // Authority signature box
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.rect(30, currentY, 70, 40);
  doc.setFontSize(10);
  doc.text('Rwanda Water Resources Board', 65, currentY + 8, { align: 'center' });
  doc.text('Authorized Officer', 65, currentY + 20, { align: 'center' });
  doc.text('Date and Signature', 65, currentY + 35, { align: 'center' });

  // Permit holder acknowledgment box
  doc.rect(110, currentY, 70, 40);
  doc.text('Permit Holder', 145, currentY + 8, { align: 'center' });
  doc.text('Acknowledgment', 145, currentY + 20, { align: 'center' });
  doc.text('Date and Signature', 145, currentY + 35, { align: 'center' });

  // If signature blocks push too low, add a clean page for the QR footer
  if (currentY + 50 > 235) {
    doc.addPage();
  }

  // Add QR footer on the last page only
  await drawPermitQrFooter({ doc, permitNumber });

  // Footer with security features
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    
    // Security footer
    const securityText = "This is an official water permit certificate issued by the Rwanda Water Resources Board. " +
                        "Unauthorized modification is prohibited by law. Verify authenticity at rwb.gov.rw";
    // On the last page, keep the line a little narrower to avoid feeling cramped with the QR footer above.
    doc.text(securityText, 15, 285, { maxWidth: i === pageCount ? 165 : 180 });
    
    // Page numbers and metadata
    doc.text(`Page ${i} of ${pageCount}`, 195, 295, { align: 'right' });
    doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 15, 295);
    doc.text(`Document ID: ${permitNumber}`, 105, 295, { align: 'center' });
  }

  return doc.output('blob');
};

export const generatePermitPDF = async (permit: Permit): Promise<void> => {
  // Create a new PDF document
  const doc = new jsPDF();
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
  
  // Add logos
  try {
    const rwbLogoUrl = `${window.location.origin}/assets/rwanda_water_board_Logo.png`;
    const moeLogoUrl = `${window.location.origin}/assets/ministry_of_env_logo.png`;
    
    doc.addImage(rwbLogoUrl, 'PNG', 15, 10, 30, 30);
    doc.addImage(moeLogoUrl, 'PNG', 155, 10, 30, 30);
  } catch (error) {
    console.error('Error loading logos:', error);
    doc.setFontSize(12);
    doc.setTextColor(0, 75, 135);
    doc.text('Rwanda Water Resources Board', 15, 20);
    doc.text('Ministry of Environment', 195, 20, { align: 'right' });
  }
  
  // Add blue line separator
  doc.setDrawColor(0, 100, 150);
  doc.setFillColor(0, 100, 150);
  doc.roundedRect(15, 50, 180, 2, 1, 1, 'F');
  
  // Add title and permit number
  doc.setFontSize(18);
  doc.setTextColor(0, 75, 135);
  doc.text('WATER PERMIT CERTIFICATE', 105, 65, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`Permit Number: ${permit.permitNumber}`, 105, 75, { align: 'center' });
  
  // Add divider
  doc.setDrawColor(0, 100, 150);
  doc.setLineWidth(0.5);
  doc.line(15, 80, 195, 80);
  
  // Add permit information
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('PERMIT INFORMATION', 15, 90);
  
  // Permit details
  const permitDetails = [
    ['Title', permit.title],
    ['Type', permit.type],
    ['Status', permit.status.charAt(0).toUpperCase() + permit.status.slice(1).replace('-', ' ')],
    ['Issue Date', formatDate(permit.issueDate)],
    ['Expiry Date', formatDate(permit.expiryDate)],
    ['Water Source', permit.waterSource],
    ['Purpose', permit.purpose],
    ['Water Allowance', permit.waterAllowance],
    ['Location', permit.location],
    ['Issuing Authority', permit.issuingAuthority],
  ];
  
  autoTable(doc, {
    startY: 95,
    head: [['Property', 'Value']],
    body: permitDetails,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 100, 150],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [240, 240, 240],
    },
  });

  // Add QR footer on the last page (ensure it doesn't collide with table end)
  const lastY = (doc as any).lastAutoTable?.finalY ?? 0;
  if (lastY > 235) {
    doc.addPage();
  }
  await drawPermitQrFooter({ doc, permitNumber: permit.permitNumber });
  
  // Open the PDF in a new tab
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
}; 