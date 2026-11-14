/**
 * Cleaning for text extracted from a participant's attachment (scanned PDF or
 * photo), so what is stored and shown as "the submission" is the participant's
 * work and not the scanner's or the extractor's own furniture.
 */

/** Scanner app watermarks stamped on every page of a phone scan. */
const WATERMARK_PHRASE =
	/(?:dipindai dengan|dipindai menggunakan|scanned with|scanned by|diambil dengan)\s+(?:camscanner|cam scanner|adobe scan|microsoft lens|office lens|genius scan|scanner pro)|\bcs\s+camscanner\b/gi;

/** Removes scanner watermarks, whether on a line of their own or trailing a line of text. */
export function stripScannerWatermarks(text: string): string {
	return (text || '')
		.split('\n')
		.map((line) => line.replace(WATERMARK_PHRASE, '').replace(/[ \t]+$/g, ''))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Extraction headers such as `[DOKUMEN PINDAI: file.pdf]`, `[LAMPIRAN GAMBAR: x.jpg]`
 * and `[Halaman 2]` tell the extractor which file a block came from. They are not
 * the participant's words and must not become line 1 of the stored answer.
 */
const EXTRACTION_MARKER =
	/^[ \t]*\[(?:DOKUMEN(?: PINDAI)?: [^\]\n]*|LAMPIRAN GAMBAR: [^\]\n]*|Halaman \d+)\][ \t]*$/gm;
/** Page markers can end up inline when earlier extraction flattened line breaks. */
const INLINE_PAGE_MARKER = /\[Halaman \d+\][ \t]*/g;

export function stripExtractionMarkers(text: string): string {
	return (text || '')
		.replace(EXTRACTION_MARKER, '')
		.replace(INLINE_PAGE_MARKER, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Trims and bounds extracted text WITHOUT flattening it: line breaks are the
 * participant's own (and what the review panel numbers and anchors to), so only
 * runs of spaces and excess blank lines are normalized.
 */
export function clipKeepLines(value: string | undefined | null, max: number): string {
	const text = (value || '')
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t\f\v]+/g, ' ')
		.replace(/ ?\n ?/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Answer text for storage and review: no extraction headers, no scanner watermarks. */
export function answerTextFromExtraction(text: string): string {
	return stripScannerWatermarks(stripExtractionMarkers(text));
}

/**
 * True when stored answer text still carries what this module strips: an
 * extractor header or a scanner watermark. Those submissions were read before
 * the answer-only OCR and are worth re-reading.
 */
export function hasExtractionArtifacts(text: string): boolean {
	const value = text || '';
	for (const pattern of [WATERMARK_PHRASE, EXTRACTION_MARKER, INLINE_PAGE_MARKER]) pattern.lastIndex = 0;
	const found = WATERMARK_PHRASE.test(value) || EXTRACTION_MARKER.test(value) || INLINE_PAGE_MARKER.test(value);
	for (const pattern of [WATERMARK_PHRASE, EXTRACTION_MARKER, INLINE_PAGE_MARKER]) pattern.lastIndex = 0;
	return found;
}
