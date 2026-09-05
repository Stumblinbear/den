// The narrowing everything that reads `unknown` needs: a hook's stdin, a
// transcript line, a parsed configuration file and a caught error all arrive
// as one.

export const isTable = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** The fields of a value, or none, so a caller can read a key either way. */
export const fieldsOf = (value: unknown): Record<string, unknown> =>
	isTable(value) ? value : {};

/** What a caught error is named by -- an errno, mostly -- when it carries one. */
export const errorCode = (error: unknown): string | undefined =>
	isTable(error) && typeof error["code"] === "string"
		? error["code"]
		: undefined;

export const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The first line of a message, for the reports that are one line. Empty when
 * there is no line worth reading, which each caller has its own word for.
 */
export const firstLine = (text: string): string =>
	(text.split("\n")[0] ?? "").trim();
