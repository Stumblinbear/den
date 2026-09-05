// How the configured messages carry numbers.
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
