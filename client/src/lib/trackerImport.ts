// Client-side parsers for import files. Keeps server lean: CSV is split here and
// MAL XML is parsed with the browser DOMParser, then sent as normalized payloads.

export type ImportMode = "merge" | "replace";

export type ParsedImport =
  | { kind: "json"; payload: unknown }
  | { kind: "csv"; payload: { seriesBookmarks: { seriesId: number; status: string }[] } }
  | { kind: "mal-xml"; provider: "my_anime_list"; entries: { externalId: string; status: string }[] };

const VALID_STATUSES = new Set(["reading", "rereading", "planned", "completed", "paused", "dropped"]);

// MAL <my_status> labels -> our bookmark status.
const MAL_LABEL_TO_STATUS: Record<string, string> = {
  reading: "reading",
  completed: "completed",
  "on-hold": "paused",
  dropped: "dropped",
  "plan to read": "planned",
};

/** Minimal RFC-4180-ish CSV row parser (handles quotes, escaped quotes, commas in quotes). */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

export function parseCsv(text: string): { seriesBookmarks: { seriesId: number; status: string }[] } {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { seriesBookmarks: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idIdx = header.indexOf("seriesid");
  const statusIdx = header.indexOf("status");
  if (idIdx === -1 || statusIdx === -1) {
    throw new Error("CSV is missing required seriesId/status columns");
  }

  const seriesBookmarks: { seriesId: number; status: string }[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const seriesId = Number(rows[i][idIdx]);
    const status = (rows[i][statusIdx] ?? "").trim().toLowerCase();
    if (Number.isInteger(seriesId) && seriesId > 0 && VALID_STATUSES.has(status)) {
      seriesBookmarks.push({ seriesId, status });
    }
  }
  return { seriesBookmarks };
}

export function parseMalXml(text: string): { externalId: string; status: string }[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Could not parse XML file");
  }

  const entries: { externalId: string; status: string }[] = [];
  doc.querySelectorAll("manga").forEach((node) => {
    const externalId = node.querySelector("manga_mangadb_id")?.textContent?.trim() ?? "";
    const label = node.querySelector("my_status")?.textContent?.trim().toLowerCase() ?? "";
    const status = MAL_LABEL_TO_STATUS[label];
    if (externalId && externalId !== "0" && status) entries.push({ externalId, status });
  });
  return entries;
}

/** Route an uploaded file to the right parser by extension/content. */
export async function detectImport(file: File): Promise<ParsedImport> {
  const text = await file.text();
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) return { kind: "csv", payload: parseCsv(text) };
  if (name.endsWith(".xml")) return { kind: "mal-xml", provider: "my_anime_list", entries: parseMalXml(text) };
  if (name.endsWith(".json")) return { kind: "json", payload: JSON.parse(text) };

  // Fall back to sniffing content for files without a known extension.
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) return { kind: "mal-xml", provider: "my_anime_list", entries: parseMalXml(text) };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return { kind: "json", payload: JSON.parse(text) };
  return { kind: "csv", payload: parseCsv(text) };
}
