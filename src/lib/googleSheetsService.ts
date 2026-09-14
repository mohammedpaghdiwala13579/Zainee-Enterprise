import type { SavedDocument } from "../types";

export interface GoogleSheetSummary {
  id: string;
  name: string;
  webViewLink: string;
  modifiedTime?: string;
  createdTime?: string;
}

export interface SheetExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
}

/**
 * Creates a dedicated, professionally formatted Google Spreadsheet for a Zainee Enterprise document.
 */
export async function exportDocumentToGoogleSheets(
  doc: SavedDocument,
  accessToken: string
): Promise<SheetExportResult> {
  const docTypeTitle =
    doc.docType === "challan"
      ? "DELIVERY CHALLAN"
      : doc.docType === "invoice"
      ? "BILL / INVOICE"
      : "QUOTATION";

  const sheetTitle = `${docTypeTitle} - ${doc.name || "Document"} - ${doc.dateVal || new Date().toISOString().split("T")[0]}`;

  // 1. Create a new Google Spreadsheet
  const createResponse = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        title: sheetTitle,
      },
    }),
  });

  if (!createResponse.ok) {
    const errData = await createResponse.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `Failed to create Google Sheet (HTTP ${createResponse.status})`
    );
  }

  const createdData = await createResponse.json();
  const spreadsheetId = createdData.spreadsheetId;
  const sheetId = createdData.sheets?.[0]?.properties?.sheetId ?? 0;
  const sheetName = createdData.sheets?.[0]?.properties?.title ?? "Sheet1";
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. Prepare tabular data
  const isChallan = doc.docType === "challan";
  const rowsData: any[][] = [];

  // Header Banner
  rowsData.push(["ZAINEE ENTERPRISE"]);
  rowsData.push(["Govt. Reg. Importer, Exporter, Supplier & Indentor"]);
  rowsData.push(["Marine / Ship Chandlers & Industrial Technical Supplies"]);
  rowsData.push(["Chittagong, Bangladesh | Tel: +880-31-710000 | Email: zaineeenterprise@gmail.com"]);
  rowsData.push([]); // blank

  // Document Type Header
  rowsData.push([docTypeTitle]);
  rowsData.push([]); // blank

  // Metadata Grid
  rowsData.push([
    "Document Ref / Name:",
    doc.name || "Untitled",
    "",
    "Date:",
    doc.dateVal || new Date().toISOString().split("T")[0],
  ]);
  rowsData.push([
    "Messers / Client:",
    doc.messers || "N/A",
    "",
    "Currency:",
    doc.currency || "BDT",
  ]);
  rowsData.push([
    "Address:",
    doc.address || "N/A",
    "",
    "Vessel Name:",
    doc.includeVesselName ? doc.vesselName || "N/A" : "-",
  ]);
  rowsData.push([
    "",
    "",
    "",
    "Port / Berth:",
    doc.includePortBerth ? doc.portBerth || "N/A" : "-",
  ]);
  rowsData.push([]); // blank

  // Line items table headers
  const tableHeaderIndex = rowsData.length;
  if (isChallan) {
    rowsData.push(["Sl.", "Description of Goods & Supplies", "Unit", "Qty", "Remarks"]);
  } else {
    rowsData.push([
      "Sl.",
      "Description of Goods & Supplies",
      "Unit",
      "Qty",
      `Unit Price (${doc.currency || "BDT"})`,
      `Total Amount (${doc.currency || "BDT"})`,
    ]);
  }

  // Line item rows
  const activeItems = doc.rows.filter(
    (r) => (r.desc && r.desc.trim().length > 0) || r.qty || r.rate
  );
  const itemsToRender = activeItems.length > 0 ? activeItems : doc.rows.slice(0, 10);

  let subtotal = 0;
  itemsToRender.forEach((item, idx) => {
    const slNo = item.sl || String(idx + 1);
    const desc = item.desc || "";
    const unit = item.unit || "";
    const qty = typeof item.qty === "number" ? item.qty : Number(item.qty) || 0;
    const rate = typeof item.rate === "number" ? item.rate : Number(item.rate) || 0;
    const amount = typeof item.amount === "number" ? item.amount : qty * rate;
    subtotal += amount;

    if (isChallan) {
      rowsData.push([slNo, desc, unit, qty > 0 ? qty : "", item.remarks || ""]);
    } else {
      rowsData.push([
        slNo,
        desc,
        unit,
        qty > 0 ? qty : "",
        rate > 0 ? rate : "",
        amount > 0 ? amount : "",
      ]);
    }
  });

  // Summary rows (if not challan)
  if (!isChallan) {
    rowsData.push([]);
    rowsData.push(["", "", "", "", "Subtotal:", subtotal]);

    let finalTotal = subtotal;
    if (doc.includeDiscount && doc.discountPercent > 0) {
      let discountAmount = 0;
      if (doc.discountType === "fixed") {
        discountAmount = doc.discountPercent;
      } else {
        discountAmount = (subtotal * doc.discountPercent) / 100;
      }
      finalTotal = Math.max(0, subtotal - discountAmount);
      rowsData.push([
        "",
        "",
        "",
        "",
        `Discount (${doc.discountType === "fixed" ? doc.currency : doc.discountPercent + "%"}):`,
        discountAmount,
      ]);
    }
    rowsData.push(["", "", "", "", "Grand Total:", finalTotal]);
  }

  rowsData.push([]);
  rowsData.push(["Authorized Signatory", "", "", "", "", "Receiver's Signature & Stamp"]);
  rowsData.push(["For Zainee Enterprise", "", "", "", "", ""]);

  // 3. Write values to the sheet
  const updateValuesResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      sheetName
    )}!A1?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: rowsData,
      }),
    }
  );

  if (!updateValuesResponse.ok) {
    const err = await updateValuesResponse.json().catch(() => ({}));
    throw new Error(err.error?.message || "Failed to populate spreadsheet cells.");
  }

  // 4. Professional formatting via batchUpdate
  try {
    const requests: any[] = [
      // Company title styling (Row 0)
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: isChallan ? 5 : 6,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.04, green: 0.07, blue: 0.17 }, // Navy #0b132b
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                fontSize: 14,
                bold: true,
              },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        },
      },
      // Document Type Header (Row 5)
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 5,
            endRowIndex: 6,
            startColumnIndex: 0,
            endColumnIndex: isChallan ? 5 : 6,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.94, green: 0.96, blue: 0.98 },
              textFormat: {
                foregroundColor: { red: 0.05, green: 0.1, blue: 0.2 },
                fontSize: 12,
                bold: true,
              },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        },
      },
      // Table Header row styling
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: tableHeaderIndex,
            endRowIndex: tableHeaderIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: isChallan ? 5 : 6,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.15, green: 0.23, blue: 0.36 }, // Dark Slate
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                fontSize: 10,
                bold: true,
              },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        },
      },
      // Auto-fit column widths
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: isChallan ? 5 : 6,
          },
        },
      },
    ];

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });
  } catch (formatErr) {
    // Non-blocking formatting error: values are already intact
    console.warn("Spreadsheet styling warning:", formatErr);
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    title: sheetTitle,
  };
}

/**
 * List the user's recent Google Spreadsheets from Google Drive to display in the UI.
 */
export async function listUserGoogleSheets(accessToken: string): Promise<GoogleSheetSummary[]> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=15&fields=files(id,name,webViewLink,modifiedTime,createdTime)`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Failed to retrieve spreadsheets from Google Drive.");
  }

  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    webViewLink: f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}/edit`,
    modifiedTime: f.modifiedTime,
    createdTime: f.createdTime,
  }));
}

/**
 * Append document summary entry to the Master Document Register sheet in Google Sheets.
 */
export async function appendToMasterGoogleSheet(
  doc: SavedDocument,
  accessToken: string,
  spreadsheetUrl: string
): Promise<string> {
  const MASTER_SHEET_TITLE = "Zainee Enterprise - Master Documents Register";

  // Check if Master Sheet exists in Drive
  const q = encodeURIComponent(
    `name='${MASTER_SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let masterId: string | null = null;
  let masterUrl = "";

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      masterId = searchData.files[0].id;
      masterUrl = searchData.files[0].webViewLink;
    }
  }

  // If not found, create it
  if (!masterId) {
    const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: { title: MASTER_SHEET_TITLE },
      }),
    });
    if (!createRes.ok) {
      throw new Error("Could not create master register sheet");
    }
    const createData = await createRes.json();
    masterId = createData.spreadsheetId;
    masterUrl = `https://docs.google.com/spreadsheets/d/${masterId}/edit`;

    // Add headers
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${masterId}/values/Sheet1!A1?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [
            [
              "Date",
              "Document Type",
              "Document Ref / Title",
              "Messers / Client",
              "Vessel Name",
              "Port / Berth",
              "Item Count",
              "Currency",
              "Grand Total",
              "Google Sheet URL",
              "Synced At",
            ],
          ],
        }),
      }
    );
  }

  // Calculate items and total
  const itemCount = doc.rows.filter((r) => r.desc && r.desc.trim().length > 0).length;
  let subtotal = 0;
  doc.rows.forEach((r) => {
    const qty = typeof r.qty === "number" ? r.qty : Number(r.qty) || 0;
    const rate = typeof r.rate === "number" ? r.rate : Number(r.rate) || 0;
    subtotal += r.amount || qty * rate;
  });

  let grandTotal = subtotal;
  if (doc.includeDiscount && doc.discountPercent > 0) {
    const disc =
      doc.discountType === "fixed" ? doc.discountPercent : (subtotal * doc.discountPercent) / 100;
    grandTotal = Math.max(0, subtotal - disc);
  }

  // Append entry row
  const appendRow = [
    doc.dateVal || new Date().toISOString().split("T")[0],
    doc.docType.toUpperCase(),
    doc.name || "Untitled",
    doc.messers || "-",
    doc.includeVesselName ? doc.vesselName || "-" : "-",
    doc.includePortBerth ? doc.portBerth || "-" : "-",
    itemCount,
    doc.currency || "BDT",
    doc.docType === "challan" ? "Challan (No Total)" : grandTotal,
    spreadsheetUrl || "-",
    new Date().toLocaleString(),
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${masterId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [appendRow],
      }),
    }
  );

  return masterUrl;
}
