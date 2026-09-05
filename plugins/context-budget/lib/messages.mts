// How a token count is written where a person or an agent reads it: the
// configured messages the hooks fill in, and the cut-point reading's own rows.
// One place, so the same number is not "162.3K" in one and "162300" in the
// next.
export const formatTokens = (tokens: number): string =>
	`${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}K`;

/**
 * Placeholder substitution. Only the values the caller supplies are
 * substituted; anything else the message writes in braces is left alone.
 */
export function fill(
	message: string,
	values: Readonly<Record<string, string>>,
): string {
	let text = message;

	for (const [key, value] of Object.entries(values)) {
		text = text.replaceAll(`{${key}}`, value);
	}

	return text;
}
