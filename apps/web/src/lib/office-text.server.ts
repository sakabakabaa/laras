/**
 * Office-document text extraction for the Manajemen berkas parser.
 *
 * The Berkas library accepts PDF/Office/image/audio/video uploads, but text
 * extraction historically only understood PDF and plain text — every .docx,
 * .pptx, .xlsx or .odt landed in "failed / unsupported format". These helpers
 * close that gap for the ZIP-based Office formats using `jszip` (an existing
 * direct dependency) plus RTF via a small control-word stripper.
 *
 * Design notes:
 *  - No new dependencies: OOXML and ODF are both ZIP + XML, so jszip is enough.
 *  - Read-only and bounded: callers cap input size before we get here.
 *  - Every function returns plain text ('' when nothing readable was found)
 *    and never throws for content reasons — a malformed package yields '' so
 *    the route can classify it as "review" rather than crashing.
 */

// jszip's package.json `main` field ("./lib/index") lacks a file extension,
// which crashes the configured ESLint import resolver at rule-load time. A
// non-literal dynamic import keeps the resolver from resolving the bare
// specifier statically; Node resolves it natively at runtime in this
// server-only module. (Mirrors lib/assistant/attachments.server.ts.)
const JSZIP_SPEC = "jszip";

type JsZipFile = { async: (type: "string") => Promise<string> };
type JsZipInstance = {
  file: (name: string) => JsZipFile | null;
  files: Record<string, JsZipFile>;
};
type JsZipConstructor = {
  loadAsync: (data: Buffer | Uint8Array) => Promise<JsZipInstance>;
};

let jszipPromise: Promise<JsZipConstructor> | null = null;
const loadJszip = (): Promise<JsZipConstructor> => {
  if (!jszipPromise) {
    jszipPromise = import(/* @vite-ignore */ JSZIP_SPEC).then((mod) => {
      const ctor =
        (mod as { default?: JsZipConstructor }).default ??
        (mod as unknown as JsZipConstructor);
      if (!ctor || typeof ctor.loadAsync !== "function") {
        throw new Error("jszip tidak tersedia.");
      }
      return ctor;
    });
  }
  return jszipPromise;
};

const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number.parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const n = Number.parseInt(code, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : " ";
    })
    .replace(/&amp;/g, "&");

/**
 * Converts an OOXML/ODF fragment to readable text, preserving paragraph and
 * line breaks. `xml:space="preserve"` runs rely on raw whitespace, so only
 * runs of spaces/tabs are collapsed — the newlines we insert are kept.
 */
const xmlToText = (xml: string): string =>
  decodeEntities(
    xml
      // Paragraph / row / line boundaries → newline before tags are stripped.
      // The `>` is left in place (lookahead) so it still terminates the tag for
      // the generic tag-strip below; consuming it would glue the tag onto the
      // following text and swallow it.
      .replace(/<w:p(?=[ >])/g, "\n<w:p")
      .replace(/<a:p(?=[ >])/g, "\n<a:p")
      .replace(/<w:br\s*\/?>/g, "\n")
      .replace(/<w:tab\s*\/?>/g, "\t")
      .replace(/<text:p(?=[ >])/g, "\n<text:p")
      .replace(/<text:line-break\s*\/?>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/row>/g, "\n")
      // Cell / column separators.
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<\/table:table-cell>/g, "\t")
      .replace(/<\/c>/g, "\t")
      // Drop all remaining markup.
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, "").trim())
    .filter((line) => line.length > 0)
    .join("\n");

const readEntry = async (zip: JsZipInstance, name: string): Promise<string> => {
  const entry = zip.file(name);
  return entry ? entry.async("string") : "";
};

/** Numeric sort for `prefix<N>.xml` part names (slide2 before slide10). */
const byPartNumber = (pattern: RegExp) => (a: string, b: string) => {
  const na = Number.parseInt(a.match(pattern)?.[1] ?? "0", 10);
  const nb = Number.parseInt(b.match(pattern)?.[1] ?? "0", 10);
  return na - nb;
};

/** Sorted slide part names (slide1, slide2, … slide10 — numeric, not lexical). */
const slideNames = (zip: JsZipInstance): string[] =>
  Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(byPartNumber(/slide(\d+)\.xml/i));

/** .docx (Word) → text from the main document part. */
const extractDocx = async (buffer: Buffer): Promise<string> => {
  const zip = await (await loadJszip()).loadAsync(buffer);
  const xml = await readEntry(zip, "word/document.xml");
  return xml ? xmlToText(xml) : "";
};

/** .pptx (PowerPoint) → text from each slide part, in slide order. */
const extractPptx = async (buffer: Buffer): Promise<string> => {
  const zip = await (await loadJszip()).loadAsync(buffer);
  const parts: string[] = [];
  for (const name of slideNames(zip)) {
    const text = xmlToText(await readEntry(zip, name));
    if (text) parts.push(text);
  }
  // Speaker notes often carry the actual explanation; include when present.
  const notes: string[] = [];
  const noteNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
    .sort(byPartNumber(/notesSlide(\d+)\.xml/i));
  for (const name of noteNames) {
    const text = xmlToText(await readEntry(zip, name));
    if (text) notes.push(text);
  }
  const body = parts.join("\n\n");
  return notes.length
    ? `${body}\n\nCatatan slide:\n${notes.join("\n\n")}`
    : body;
};

/**
 * .xlsx (Excel) → text. Cell values live either inline (`t="inlineStr"`) or in
 * the shared-string table referenced by index, so both are resolved. Sheets
 * are walked in file order and cells joined with tabs.
 */
const extractXlsx = async (buffer: Buffer): Promise<string> => {
  const zip = await (await loadJszip()).loadAsync(buffer);

  // Shared strings: <si><t>…</t></si>, possibly split into rich-text runs.
  const shared: string[] = [];
  const sstXml = await readEntry(zip, "xl/sharedStrings.xml");
  if (sstXml) {
    const items = sstXml.match(/<si[\s>][\s\S]*?<\/si>|<si\/>/g) || [];
    for (const item of items) {
      const runs = item.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [];
      shared.push(
        runs
          .map((run) => decodeEntities(run.replace(/<[^>]+>/g, "")))
          .join("")
          .trim(),
      );
    }
  }

  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort(byPartNumber(/sheet(\d+)\.xml/i));

  const sheets: string[] = [];
  for (const name of sheetNames) {
    const xml = await readEntry(zip, name);
    if (!xml) continue;
    const rows = xml.match(/<row[\s>][\s\S]*?<\/row>|<row\/>/g) || [];
    const lines: string[] = [];
    for (const row of rows) {
      const cells = row.match(/<c[\s>][\s\S]*?<\/c>|<c\/>/g) || [];
      const values: string[] = [];
      for (const cell of cells) {
        const type = cell.match(/\st="([^"]+)"/)?.[1] || "";
        const raw = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
        if (type === "s") {
          const idx = Number.parseInt(raw, 10);
          values.push(Number.isFinite(idx) ? (shared[idx] ?? "") : "");
          continue;
        }
        if (type === "inlineStr") {
          const runs = cell.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [];
          values.push(
            runs
              .map((run) => decodeEntities(run.replace(/<[^>]+>/g, "")))
              .join("")
              .trim(),
          );
          continue;
        }
        values.push(raw ? decodeEntities(raw).trim() : "");
      }
      const line = values.join("\t").replace(/\t+$/g, "").trim();
      if (line) lines.push(line);
    }
    if (lines.length) sheets.push(lines.join("\n"));
  }
  return sheets.join("\n\n");
};

/** .odt/.odp/.ods (OpenDocument) → text from the single content.xml part. */
const extractOpenDocument = async (buffer: Buffer): Promise<string> => {
  const zip = await (await loadJszip()).loadAsync(buffer);
  const xml = await readEntry(zip, "content.xml");
  return xml ? xmlToText(xml) : "";
};

/** Destinations whose contents are metadata, never body text. */
const RTF_DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "pict",
  "object",
  "themedata",
  "datastore",
  "latentstyles",
  "listtable",
  "listoverridetable",
  "rsidtbl",
  "generator",
  "filetbl",
  "revtbl",
  "xmlnstbl",
]);

/**
 * .rtf (Rich Text Format) -> plain text. A brace-depth-aware walk skips metadata
 * destinations (font/colour tables, embedded objects) and interpretive
 * destinations (`\*`), while control words become the breaks/tabs they mean.
 * No dependency required.
 */
const extractRtf = (buffer: Buffer): string => {
  const src = buffer.toString("latin1");
  const out: string[] = [];
  // Stack of group contexts: true = the group is inside a skipped destination.
  const skipping: boolean[] = [];
  const isSkipping = () => skipping.length > 0 && skipping[skipping.length - 1];

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (ch === "{") {
      // A group may open a destination heading: `{\fonttbl`, `{\*\generator`.
      const rest = src.slice(i + 1);
      const m = rest.match(/^\\\*?\\?([a-z]+)/i);
      const dest = m?.[1]?.toLowerCase();
      const star = rest.startsWith("\\*");
      const parentSkipping = isSkipping();
      skipping.push(
        parentSkipping || star || (dest ? RTF_DESTINATIONS.has(dest) : false),
      );
      i += 1;
      continue;
    }
    if (ch === "}") {
      skipping.pop();
      i += 1;
      continue;
    }

    if (ch === "\\") {
      const next = src[i + 1];
      // Escaped literal: \{ \} \\
      if (next === "{" || next === "}" || next === "\\") {
        if (!isSkipping()) out.push(next);
        i += 2;
        continue;
      }
      // Hex escape \'hh
      const hex = src.slice(i + 1).match(/^'([0-9a-f]{2})/i);
      if (hex) {
        if (!isSkipping())
          out.push(String.fromCharCode(Number.parseInt(hex[1], 16)));
        i += 4;
        continue;
      }
      // Control word: \letters[-]digits[ ]  (the trailing space is a delimiter).
      const cw = src.slice(i + 1).match(/^([a-z]+)(-?\d+)?[ ]?/i);
      if (cw) {
        const word = cw[1].toLowerCase();
        if (!isSkipping()) {
          if (word === "par" || word === "line" || word === "pard")
            out.push("\n");
          else if (word === "tab") out.push("\t");
          else if (word === "u") {
            const n = Number.parseInt(cw[2] ?? "0", 10);
            out.push(String.fromCharCode(n < 0 ? n + 65536 : n));
          }
        }
        i += 1 + cw[0].length;
        continue;
      }
      // Unknown control symbol (e.g. \~, \-): drop it.
      i += 2;
      continue;
    }

    if (!isSkipping()) out.push(ch);
    i += 1;
  }

  return out
    .join("")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
};

export type OfficeFormat = "docx" | "pptx" | "xlsx" | "odf" | "rtf";

/** Extensions this module can turn into text, mapped to their extractor. */
export const OFFICE_EXTENSIONS: Record<string, OfficeFormat> = {
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  odt: "odf",
  odp: "odf",
  ods: "odf",
  rtf: "rtf",
};

/** Human-readable coverage, used in the parser's Indonesian status messages. */
export const OFFICE_FORMAT_LABEL = "DOCX, PPTX, XLSX, ODT/ODP/ODS, dan RTF";

/**
 * Extracts text from a supported Office document. Returns '' when the package
 * is malformed or carries no readable text. Throws only if jszip itself is
 * unavailable (an environment fault the route surfaces as a hard failure).
 */
export async function extractOfficeText(
  buffer: Buffer,
  format: OfficeFormat,
): Promise<string> {
  switch (format) {
    case "docx":
      return extractDocx(buffer);
    case "pptx":
      return extractPptx(buffer);
    case "xlsx":
      return extractXlsx(buffer);
    case "odf":
      return extractOpenDocument(buffer);
    case "rtf":
      return extractRtf(buffer);
  }
  return "";
}
