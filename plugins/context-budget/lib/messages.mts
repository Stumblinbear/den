// Filling in the text the hooks show a person or an agent: `formatTokens` for
// a token count, and `fill` for a configured message's placeholders.

/**
 * A token count as every message writes it: in thousands to one decimal
 * place, "162.3K", and a whole thousand without the decimal, "162K".
 */
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
