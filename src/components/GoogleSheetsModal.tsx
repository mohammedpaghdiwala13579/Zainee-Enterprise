import React, { useState, useEffect } from "react";
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  FolderSync,
  FileText,
  AlertCircle,
  Database,
  ArrowRight,
} from "lucide-react";
import type { SavedDocument } from "../types";
import {
  googleSignIn,
  logoutGoogle,
  getGoogleAccessToken,
  initAuth,
} from "../lib/googleAuth";
import {
  exportDocumentToGoogleSheets,
  listUserGoogleSheets,
  appendToMasterGoogleSheet,
  type GoogleSheetSummary,
  type SheetExportResult,
} from "../lib/googleSheetsService";
import type { User } from "firebase/auth";

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDocument: SavedDocument;
  onSavedSuccess?: (sheetResult: SheetExportResult) => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  currentDocument,
  onSavedSuccess,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logToMaster, setLogToMaster] = useState(true);
  const [lastExported, setLastExported] = useState<SheetExportResult | null>(null);
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  const [driveSheets, setDriveSheets] = useState<GoogleSheetSummary[]>([]);
  const [activeTab, setActiveTab] = useState<"export" | "history">("export");

  // Initialize Auth listener on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch recent sheets when user signs in or opens history tab
  useEffect(() => {
    if (isOpen && accessToken) {
      loadDriveSheets();
    }
  }, [isOpen, accessToken, activeTab]);

  const loadDriveSheets = async () => {
    if (!accessToken) return;
    setIsLoadingList(true);
    setErrorMsg(null);
    try {
      const sheets = await listUserGoogleSheets(accessToken);
      setDriveSheets(sheets);
    } catch (err: any) {
      console.error("Failed to list sheets:", err);
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setErrorMsg(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to sign in with Google.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutGoogle();
      setUser(null);
      setAccessToken(null);
      setLastExported(null);
      setDriveSheets([]);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to sign out.");
    }
  };

  const handleExportToSheets = async () => {
    let token = accessToken;
    if (!token) {
      // Prompt sign in first
      try {
        setIsAuthenticating(true);
        const authRes = await googleSignIn();
        if (!authRes) return;
        token = authRes.accessToken;
        setUser(authRes.user);
        setAccessToken(token);
      } catch (err: any) {
        setErrorMsg(err.message || "Sign in required to save to Google Sheets.");
        return;
      } finally {
        setIsAuthenticating(false);
      }
    }

    if (!token) {
      setErrorMsg("Google authorization is required.");
      return;
    }

    setIsExporting(true);
    setErrorMsg(null);

    try {
      const result = await exportDocumentToGoogleSheets(currentDocument, token);
      setLastExported(result);

      if (logToMaster) {
        try {
          const masterLink = await appendToMasterGoogleSheet(
            currentDocument,
            token,
            result.spreadsheetUrl
          );
          setMasterUrl(masterLink);
        } catch (masterErr) {
          console.warn("Could not log to master register:", masterErr);
        }
      }

      if (onSavedSuccess) {
        onSavedSuccess(result);
      }

      // Refresh recent list
      loadDriveSheets();
    } catch (err: any) {
      console.error("Failed to export to Google Sheets:", err);
      setErrorMsg(err.message || "Could not save to Google Sheets. Please check permissions.");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const rowCount = currentDocument.rows.filter(
    (r) => (r.desc && r.desc.trim().length > 0) || r.qty || r.rate
  ).length;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-400/30 flex items-center justify-center">
              <FileSpreadsheet className="h-6 w-6 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Google Sheets Integration
                <span className="text-[10px] bg-emerald-500/30 text-emerald-200 font-semibold px-2 py-0.5 rounded-full border border-emerald-400/40">
                  Google Drive Cloud
                </span>
              </h2>
              <p className="text-xs text-slate-300 font-medium">
                Save & sync quotations, invoices, and challans to your personal Google Sheets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User Account Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-wrap gap-2">
          {user ? (
            <div className="flex items-center gap-3">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  className="w-8 h-8 rounded-full border border-emerald-500/40"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center">
                  {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <span>{user.displayName || "Connected User"}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium bg-emerald-100 px-1.5 py-0.2 rounded">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Connected
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 truncate max-w-[280px]">
                  {user.email}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Connect your Google account to save directly to your Google Sheets</span>
            </div>
          )}

          <div>
            {user ? (
              <button
                onClick={handleSignOut}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-200 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign Out
              </button>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={isAuthenticating}
                className="gsi-material-button bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 shadow-xs flex items-center gap-2 transition-all hover:border-slate-400 disabled:opacity-50"
              >
                {isAuthenticating ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                )}
                <span>Sign in with Google</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 px-6 bg-white">
          <button
            onClick={() => setActiveTab("export")}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "export"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Save Current Document
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "history"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <FolderSync className="h-4 w-4" />
            Recent Spreadsheets in Drive ({driveSheets.length})
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Operation Notice</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {activeTab === "export" ? (
            <div className="space-y-4">
              {/* Document Overview Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {currentDocument.docType.toUpperCase()}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {currentDocument.name || "Untitled Document"}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    Date: {currentDocument.dateVal || "Today"}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500 font-medium">Client / Messers</div>
                    <div className="font-semibold text-slate-800 truncate">
                      {currentDocument.messers || "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 font-medium">Vessel / Berth</div>
                    <div className="font-semibold text-slate-800 truncate">
                      {currentDocument.vesselName || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 font-medium">Line Items</div>
                    <div className="font-semibold text-slate-800">{rowCount} active items</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 font-medium">Currency</div>
                    <div className="font-semibold text-slate-800">{currentDocument.currency || "BDT"}</div>
                  </div>
                </div>
              </div>

              {/* Master Register Toggle */}
              <label className="flex items-start gap-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl cursor-pointer hover:bg-emerald-50/80 transition-colors">
                <input
                  type="checkbox"
                  checked={logToMaster}
                  onChange={(e) => setLogToMaster(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-emerald-600" />
                    Also log to "Zainee Enterprise - Master Documents Register" Google Sheet
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Maintains a single centralized Google Sheet index with dates, client names, totals, and links to each individual quotation sheet.
                  </div>
                </div>
              </label>

              {/* Export Success Banner */}
              {lastExported && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Document Successfully Saved to Google Sheets!
                  </div>
                  <p className="text-xs text-slate-700">
                    Your spreadsheet <span className="font-semibold text-slate-900">"{lastExported.title}"</span> was created in your Google Drive.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={lastExported.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-xs transition-colors"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      Open in Google Sheets
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {masterUrl && (
                      <a
                        href={masterUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-emerald-800 border border-emerald-300 font-bold text-xs px-3.5 py-2 rounded-lg transition-colors"
                      >
                        <Database className="h-3.5 w-3.5 text-emerald-600" />
                        View Master Register Sheet
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExportToSheets}
                  disabled={isExporting}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving to Google Sheets...</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>Save Active Document to Google Sheets</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* History Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-600">
                  Google Spreadsheets in your Google Drive:
                </p>
                <button
                  onClick={loadDriveSheets}
                  disabled={isLoadingList || !accessToken}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 p-1.5 rounded hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingList ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {!accessToken ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <FileSpreadsheet className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-600 font-medium mb-3">
                    Sign in with Google to view your spreadsheets
                  </p>
                  <button
                    onClick={handleSignIn}
                    disabled={isAuthenticating}
                    className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 shadow-xs"
                  >
                    Sign in with Google
                  </button>
                </div>
              ) : isLoadingList ? (
                <div className="text-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Loading spreadsheets from Google Drive...</p>
                </div>
              ) : driveSheets.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <FileSpreadsheet className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-600 font-medium">No Google Sheets found in your Drive yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Click "Save Current Document" to create your first sheet!
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[320px] overflow-y-auto">
                  {driveSheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      className="p-3 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="bg-emerald-50 text-emerald-700 p-1.5 rounded-lg shrink-0">
                          <FileSpreadsheet className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {sheet.name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {sheet.modifiedTime
                              ? `Modified ${new Date(sheet.modifiedTime).toLocaleDateString()}`
                              : "Google Spreadsheet"}
                          </div>
                        </div>
                      </div>

                      <a
                        href={sheet.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-md transition-colors"
                      >
                        Open
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>Protected with official Google OAuth 2.0</span>
          <span>Zainee Enterprise Cloud Sync</span>
        </div>
      </div>
    </div>
  );
};
