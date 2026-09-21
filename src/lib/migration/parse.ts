import * as XLSX from "xlsx";
import type { SourceFile, UploadedFile } from "./types.ts";
import { uid } from "./ids.ts";

export function parseCsv(text: string): Record<string, string>[] {
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((vals) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = (vals[idx] ?? "").trim();
    });
    return rec;
  });
}

export function recordsToSource(name: string, rows: Record<string, string>[], kind: SourceFile["kind"]): SourceFile {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    id: uid("file"),
    name,
    kind,
    headers,
    rows,
    rowCount: rows.length,
  };
}

function workbookToRows(buf: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  return json.map((row) => {
    const rec: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      rec[String(k).trim()] = v == null ? "" : String(v).trim();
    }
    return rec;
  });
}

function b64ToBuf(b64: string): ArrayBuffer {
  const binary = Buffer.from(b64, "base64");
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
}

export function parseUploaded(file: UploadedFile): SourceFile {
  const lower = file.name.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xls");
  if (isXlsx) {
    if (!file.base64) throw new Error(`Excel file ${file.name} is missing binary data`);
    const rows = workbookToRows(b64ToBuf(file.base64));
    return recordsToSource(file.name, rows, "xlsx");
  }
  const text = file.text ?? (file.base64 ? Buffer.from(file.base64, "base64").toString("utf8") : "");
  return recordsToSource(file.name, parseCsv(text), "csv");
}

export function csvAsXlsxBase64(csvText: string, sheetName = "Directory"): string {
  const rows = parseCsv(csvText);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buf.toString("base64");
}
