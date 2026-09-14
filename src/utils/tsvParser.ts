/**
 * Robust Clipboard & Excel / Google Sheets parser
 * Supports:
 * - HTML table extraction from Excel/Google Sheets rich clipboard
 * - TSV (Tab Separated Values) with multi-line quote escapes
 * - Intelligent header detection & column alignment
 * - Guarantees commas and semicolons inside cell content are NEVER split into separate cells
 */

import { stripHtml } from "./textFormatter";

export interface ParsedClipboardResult {
  grid: string[][];
  hasHeader: boolean;
  hasSerialColumn: boolean;
  columnMapping?: ("sl" | "desc" | "qty" | "unit" | "price" | "amount" | "ignore")[];
  detectedFormat: "html_table" | "tsv" | "csv" | "plain_lines";
}

/**
 * Helper to clean and flatten cell text into continuous space-separated text,
 * preserving commas, semicolons, and all punctuation intact.
 */
export function cleanCellText(str: string): string {
  if (!str) return "";
  const plain = str.includes("<") && str.includes(">") ? stripHtml(str) : str;
  let cleaned = plain
    .replace(/[\r\n]+/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // If cell was wrapped in matching outer quotes from TSV/Excel escaping, unwrap them
  if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

/**
 * Extracts a 2D string array from an HTML table clipboard payload (Excel / Google Sheets)
 */
export function parseHTMLTable(html: string): string[][] | null {
  if (!html || !html.includes("<table") || typeof DOMParser === "undefined") {
    return null;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    if (!table) return null;

    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length === 0) return null;

    const grid: string[][] = [];

    rows.forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("th, td"));
      if (cells.length === 0) return;

      const rowValues = cells.map((cell) => {
        // Replace <br>, <p>, <div> linebreaks with space so text flows continuously
        const clones = cell.cloneNode(true) as HTMLElement;
        const brs = clones.querySelectorAll("br, p, div");
        brs.forEach((br) => br.replaceWith(" "));

        let text = clones.textContent || "";
        return cleanCellText(text);
      });

      // Avoid adding completely empty rows
      const hasContent = rowValues.some((val) => val.length > 0);
      if (hasContent) {
        grid.push(rowValues);
      }
    });

    return grid.length > 0 ? grid : null;
  } catch (e) {
    console.warn("Failed to parse HTML table from clipboard:", e);
    return null;
  }
}

/**
 * State-machine parser for TSV (Tab-Separated Values).
 * Tabs separate columns, newlines separate rows.
 * Commas and semicolons are NEVER treated as delimiters!
 */
export function parseTSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          cell += '"';
          i++; // Skip next escaped quote
        } else {
          inQuotes = false;
        }
      } else if (char === '\r' || char === '\n') {
        // Internal newline within quoted cell converted to space
        cell += ' ';
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === "\t") {
        row.push(cleanCellText(cell));
        cell = "";
      } else if (char === "\r") {
        if (nextChar === "\n") {
          row.push(cleanCellText(cell));
          result.push(row);
          row = [];
          cell = "";
          i++; // Skip \n
        } else {
          row.push(cleanCellText(cell));
          result.push(row);
          row = [];
          cell = "";
        }
      } else if (char === "\n") {
        row.push(cleanCellText(cell));
        result.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cleanCellText(cell));
    result.push(row);
  }

  // Remove empty trailing rows
  while (
    result.length > 0 &&
    result[result.length - 1].every((c) => c === "")
  ) {
    result.pop();
  }

  return result;
}

/**
 * Parses CSV text with delimiter (comma or semicolon).
 * Kept for optional file import if required.
 */
export function parseCSV(text: string, delimiter: "," | ";" = ","): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === '\r' || char === '\n') {
        cell += ' ';
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        row.push(cleanCellText(cell));
        cell = "";
      } else if (char === "\r") {
        if (nextChar === "\n") {
          row.push(cleanCellText(cell));
          result.push(row);
          row = [];
          cell = "";
          i++;
        } else {
          row.push(cleanCellText(cell));
          result.push(row);
          row = [];
          cell = "";
        }
      } else if (char === "\n") {
        row.push(cleanCellText(cell));
        result.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cleanCellText(cell));
    result.push(row);
  }

  while (
    result.length > 0 &&
    result[result.length - 1].every((c) => c === "")
  ) {
    result.pop();
  }

  return result;
}

export interface ParseClipboardOptions {
  allowCsv?: boolean;
}

/**
 * Universal clipboard parser that extracts a 2D grid from Excel, Google Sheets, or text.
 * Guarantees that commas and semicolons are NEVER treated as column splitters.
 */
export function parseClipboardData(
  input: {
    text: string;
    html?: string;
  },
  _options?: ParseClipboardOptions
): ParsedClipboardResult {
  const { text, html } = input;
  const rawText = (text || "").trim();

  // 1. If clipboard text contains tabs, this is native spreadsheet data (Excel / Google Sheets).
  // TSV is 100% exact, preserves all quotes, commas, semicolons, and cell boundaries without HTML table artifacts.
  if (rawText.includes("\t")) {
    const tsvGrid = parseTSV(rawText);
    if (tsvGrid.length > 0) {
      return analyzeGrid(tsvGrid, "tsv");
    }
  }

  // 2. Try HTML Table parsing if text did not have tabs (e.g. copied from a website table)
  if (html && html.includes("<table")) {
    const htmlGrid = parseHTMLTable(html);
    if (htmlGrid && htmlGrid.length > 0 && htmlGrid.some((r) => r.length > 1 || htmlGrid.length > 1)) {
      return analyzeGrid(htmlGrid, "html_table");
    }
  }

  if (!rawText) {
    return {
      grid: [],
      hasHeader: false,
      hasSerialColumn: false,
      detectedFormat: "plain_lines",
    };
  }

  // 3. Plain lines: each line is treated as ONE cell (single-column copy from Excel).
  // Sentences and descriptions frequently contain commas and semicolons;
  // they must NEVER be split into columns or broken into other cells!
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const lineGrid = lines.map((l) => [cleanCellText(l)]);
  return analyzeGrid(lineGrid, "plain_lines");
}

/**
 * Analyzes grid structure, detects headers and whether Column 0 is a Serial number
 */
function analyzeGrid(
  rawGrid: string[][],
  detectedFormat: "html_table" | "tsv" | "csv" | "plain_lines"
): ParsedClipboardResult {
  if (rawGrid.length === 0) {
    return {
      grid: [],
      hasHeader: false,
      hasSerialColumn: false,
      detectedFormat,
    };
  }

  const maxCols = Math.max(...rawGrid.map((r) => r.length));
  let hasHeader = false;

  const headerKeywords = [
    "sl", "s/n", "s.no", "sl.no", "#",
    "description", "particulars", "items", "details", "desc", "material", "specification",
    "qty", "quantity", "qnty",
    "unit", "uom", "pkg", "unit of measure",
    "price", "rate", "unit price", "unit rate",
    "amount", "total", "total amount", "subtotal"
  ];

  const isHeaderCell = (cell: string) => {
    const c = cell.toLowerCase().trim();
    if (!c || c.length > 30) return false;
    return headerKeywords.some((kw) => c === kw || c === kw + "." || c === kw + ":" || c === kw + " #" || c === "#");
  };

  // Only consider header if multiple columns exist, no numeric values in non-SL cells, and distinct columns match header words
  if (rawGrid.length > 1 && maxCols >= 2) {
    const firstRow = rawGrid[0];
    const hasNumericData = firstRow.some((cell, idx) => {
      if (idx === 0) return false;
      const clean = cell.replace(/[,$\s]/g, "").trim();
      return /^\d+(\.\d+)?$/.test(clean) && clean.length > 0;
    });

    if (!hasNumericData) {
      const headerMatches = firstRow.filter((cell) => isHeaderCell(cell));
      if (firstRow.length >= 4) {
        hasHeader = headerMatches.length >= 3;
      } else if (firstRow.length >= 2) {
        hasHeader = headerMatches.length >= 2;
      }
    }
  }

  // Check if column 0 represents a Serial Number (digits/indices) while column 1 represents Description
  const dataRows = hasHeader ? rawGrid.slice(1) : rawGrid;
  let hasSerialColumn = false;

  if (maxCols >= 2 && dataRows.length > 0) {
    const col0NonEmpty = dataRows.filter((r) => r[0] !== undefined && r[0].trim().length > 0);
    if (col0NonEmpty.length > 0) {
      const serialLikeCount = col0NonEmpty.filter((r) => {
        const val = r[0].replace(/[.\-#\s]/g, "").trim();
        return /^\d+$/.test(val) && val.length <= 5;
      }).length;

      const col1HasText = dataRows.some((r) => r.length >= 2 && /[a-zA-Z]/.test(r[1]));

      hasSerialColumn = (serialLikeCount / col0NonEmpty.length >= 0.6) && col1HasText;
    }
  }

  return {
    grid: rawGrid,
    hasHeader,
    hasSerialColumn,
    detectedFormat,
  };
}
