/** Parses a comma-separated list of researcher user IDs. */
export function parseResearcherIds(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(',')
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
}
