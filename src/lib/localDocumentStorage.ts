import { SavedDocument } from "../types";

const LOCAL_STORAGE_KEY = "zainee_enterprise_documents_v1";
const STORAGE_EVENT_NAME = "zainee_local_documents_changed";

/**
 * Fetch all saved documents stored locally on this device.
 */
export function getLocalSavedDocuments(): SavedDocument[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.sort(
        (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      );
    }
    return [];
  } catch (error) {
    console.warn("Failed to load local documents from device storage:", error);
    return [];
  }
}

/**
 * Dispatch update notifications so all tabs and components stay synchronized.
 */
function notifyLocalDocsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT_NAME));
  }
}

/**
 * Save or update a document in the device's local storage.
 */
export function saveDocumentLocally(docToSave: SavedDocument): SavedDocument {
  if (typeof window === "undefined" || !window.localStorage) {
    return docToSave;
  }
  const currentDocs = getLocalSavedDocuments();
  const now = new Date().toISOString();

  const preparedDoc: SavedDocument = {
    ...docToSave,
    updatedAt: now,
    createdAt: docToSave.createdAt || now,
  };

  const existingIndex = currentDocs.findIndex((d) => d.id === preparedDoc.id);
  let updatedDocs: SavedDocument[];

  if (existingIndex >= 0) {
    updatedDocs = [...currentDocs];
    updatedDocs[existingIndex] = preparedDoc;
  } else {
    updatedDocs = [preparedDoc, ...currentDocs];
  }

  // Persist to device localStorage
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedDocs));
    notifyLocalDocsChanged();
  } catch (error) {
    console.error("Failed to save document to local storage:", error);
    throw new Error("Unable to save document locally. Local device storage may be full.");
  }

  return preparedDoc;
}

/**
 * Delete a document from local device storage by ID.
 */
export function deleteDocumentLocally(docId: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const currentDocs = getLocalSavedDocuments();
  const filtered = currentDocs.filter((d) => d.id !== docId);
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    notifyLocalDocsChanged();
  } catch (error) {
    console.error("Failed to delete document from local storage:", error);
  }
}

/**
 * Rename a document in local device storage.
 */
export function renameDocumentLocally(docId: string, newName: string): SavedDocument | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const currentDocs = getLocalSavedDocuments();
  const doc = currentDocs.find((d) => d.id === docId);
  if (!doc) return null;

  const updated: SavedDocument = {
    ...doc,
    name: newName.trim(),
    updatedAt: new Date().toISOString(),
  };

  saveDocumentLocally(updated);
  return updated;
}

/**
 * Subscribe to changes in local documents (cross-component and cross-tab reactive updates).
 */
export function subscribeToLocalDocuments(
  callback: (docs: SavedDocument[]) => void
): () => void {
  // Trigger initial fetch
  callback(getLocalSavedDocuments());

  const handleCustomEvent = () => {
    callback(getLocalSavedDocuments());
  };

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === LOCAL_STORAGE_KEY) {
      callback(getLocalSavedDocuments());
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener(STORAGE_EVENT_NAME, handleCustomEvent);
    window.addEventListener("storage", handleStorageEvent);
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener(STORAGE_EVENT_NAME, handleCustomEvent);
      window.removeEventListener("storage", handleStorageEvent);
    }
  };
}

/**
 * Sanitize a string for use as a filesystem filename on Windows, Mac, Linux, iOS, Android.
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Download / Save a single document as a native file (.zainee file) onto the user's local device.
 */
export function downloadDocumentToDevice(doc: SavedDocument): void {
  if (typeof window === "undefined") return;

  const exportPayload = {
    app: "Zainee Enterprise",
    version: "2.0",
    exportedAt: new Date().toISOString(),
    document: doc,
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const cleanTitle = sanitizeFileName(doc.name || `${doc.docType}-${doc.id}`);
  const fileName = `${cleanTitle}.zainee`;

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export a full backup file of ALL documents to the user's device.
 */
export function exportAllDocumentsBackupToDevice(customDocs?: SavedDocument[]): void {
  if (typeof window === "undefined") return;
  const docs = customDocs || getLocalSavedDocuments();

  const backupPayload = {
    app: "Zainee Enterprise",
    backupType: "full_archive",
    version: "2.0",
    exportedAt: new Date().toISOString(),
    totalDocuments: docs.length,
    documents: docs,
  };

  const jsonString = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().split("T")[0];
  const fileName = `Zainee-Enterprise-Backup-${dateStr}.json`;

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse a file uploaded from the user's local device (.zainee or .json) and return the SavedDocument.
 */
export async function readDocumentFileFromDevice(file: File): Promise<SavedDocument> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          throw new Error("File content is empty.");
        }
        const parsed = JSON.parse(text);

        // Support both direct SavedDocument or wrapped export format
        let docData: any = null;
        if (parsed.document && parsed.document.rows) {
          docData = parsed.document;
        } else if (parsed.rows && Array.isArray(parsed.rows)) {
          docData = parsed;
        } else {
          throw new Error("The selected file is not a valid Zainee Enterprise document file.");
        }

        // Validate basic fields
        if (!Array.isArray(docData.rows)) {
          throw new Error("Invalid document: missing line items.");
        }

        const validDoc: SavedDocument = {
          id: docData.id || "ze-doc-" + Math.random().toString(36).substring(2, 11) + "-" + Date.now(),
          companyId: "zainee",
          companyName: "Zainee Enterprise",
          name: String(docData.name || file.name.replace(/\.(zainee|json)$/i, "") || "Imported Document"),
          createdAt: String(docData.createdAt || new Date().toISOString()),
          updatedAt: new Date().toISOString(),
          docType: (["quotation", "challan", "invoice"].includes(docData.docType) ? docData.docType : "quotation") as any,
          dateVal: String(docData.dateVal || ""),
          messers: String(docData.messers || ""),
          address: String(docData.address || ""),
          vesselName: String(docData.vesselName || ""),
          portBerth: String(docData.portBerth || ""),
          includeVesselName: docData.includeVesselName !== undefined ? Boolean(docData.includeVesselName) : true,
          includePortBerth: docData.includePortBerth !== undefined ? Boolean(docData.includePortBerth) : true,
          currency: String(docData.currency || "BDT"),
          discountPercent: Number(docData.discountPercent) || 0,
          includeDiscount: Boolean(docData.includeDiscount),
          discountType: docData.discountType === "fixed" ? "fixed" : "percentage",
          discountValue: Number(docData.discountValue) || 0,
          challanNo: String(docData.challanNo || ""),
          requisitionNo: String(docData.requisitionNo || ""),
          invoiceNo: String(docData.invoiceNo || ""),
          poNumber: String(docData.poNumber || ""),
          quotationNo: String(docData.quotationNo || ""),
          includeInvoiceNo: docData.includeInvoiceNo !== undefined ? Boolean(docData.includeInvoiceNo) : true,
          includeChallanNo: docData.includeChallanNo !== undefined ? Boolean(docData.includeChallanNo) : true,
          includeQuotationNo: docData.includeQuotationNo !== undefined ? Boolean(docData.includeQuotationNo) : true,
          includeRequisitionNo: docData.includeRequisitionNo !== undefined ? Boolean(docData.includeRequisitionNo) : true,
          includePoNumber: docData.includePoNumber !== undefined ? Boolean(docData.includePoNumber) : true,
          rows: docData.rows.map((r: any, idx: number) => ({
            sl: Number(r.sl) || idx + 1,
            desc: String(r.desc ?? ""),
            qty: String(r.qty ?? ""),
            unit: String(r.unit ?? ""),
            price: String(r.price ?? ""),
            amount: Number(r.amount) || 0,
          })),
          mergedRegions: Array.isArray(docData.mergedRegions) ? docData.mergedRegions : [],
          cellFormats: docData.cellFormats || {},
          vatPercent: Number(docData.vatPercent) || 0,
          transportationFee: Number(docData.transportationFee) || 0,
        };

        // Also save to device local storage so it appears in archive
        saveDocumentLocally(validDoc);
        resolve(validDoc);
      } catch (err: any) {
        reject(new Error(err?.message || "Failed to parse document file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file from your device."));
    reader.readAsText(file);
  });
}

/**
 * Import a full backup JSON file from the user's device and save all docs locally.
 */
export async function importBackupFileFromDevice(file: File): Promise<{ count: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("File content is empty.");
        const parsed = JSON.parse(text);

        const docList = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.documents)
          ? parsed.documents
          : null;

        if (!docList) {
          throw new Error("Invalid backup file: no documents collection found.");
        }

        let importedCount = 0;
        for (const doc of docList) {
          if (doc && Array.isArray(doc.rows)) {
            saveDocumentLocally(doc);
            importedCount++;
          }
        }

        resolve({ count: importedCount });
      } catch (err: any) {
        reject(new Error(err?.message || "Failed to process backup file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read backup file from device."));
    reader.readAsText(file);
  });
}
