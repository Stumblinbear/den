// What a model charges for a token read from the prompt cache: the rates the
// plugin ships, the file a user writes beside them to correct one that has
// moved, and what the two come to for the model a transcript names.
//
// It is a shipped file of its own (`pricing.toml`) rather than a section of
// the configuration: a fact about the model and not a preference. It is a
// table rather than a constant because the read is the one price in a cut with
// a per-model exception; the rest of that arithmetic is `payback.mts`.
//
// Nothing here throws, nothing here stops a caller, and nothing here reports:
// a price table that cannot be used is dropped whole and the caller is handed
// the next-best one (the shipped rates in place of a user file, the default
// rate in place of the shipped file), since a payback figure on the shipped
// rate is worth more to the agent than no figure at all.
import { readFileSync } from "node:fs";
import { compile, type ModelMatch, rowFor } from "./model-rows.mts";
import { fieldsOf, isTable } from "./shared/fields.mts";

/**
 * The rate to assume where there is no model to price against: a transcript
 * whose turns name none, or no price table to ask. Claude Code's own price
 * table puts every tier here but Fable, so it is the likeliest answer as well
 * as the shipped one. A reading that has fallen back to it says so, since a
 * figure four times out is worth flagging.
 */
export const DEFAULT_READ_MULTIPLIER = 0.1;

/** The two files a reading is priced from: the shipped one, and the user's. */
export interface PricingPaths {
	/** Null for a hand run that named none, which prices at the default rate. */
	readonly shipped: string | null;
	readonly overrides: string | null;
}

/** One row: what a token read from the cache costs the models it matches. */
interface PriceRow extends ModelMatch {
	readonly rate: number;
}

export interface Pricing {
	readonly fallback: number;
	/** Tried in the order they are written, before `fallback`. */
	readonly models: readonly PriceRow[];
}

/**
 * One file's table, checked. The rows are kept under the keys they were
 * written as, because that is what the user file replaces them by, and in the
 * order they were written, which is the order they are tried in.
 */
interface RawPricing {
	readonly fallback: number | undefined;
	readonly models: ReadonlyMap<string, PriceRow>;
}

/**
 * The merged, checked price table, or null where there is none to be had: no
 * shipped path, no parser, or a shipped file that cannot be used.
 *
 * The user file replaces rather than merges within a row, because a row is one
 * number: a row whose key matches a shipped one replaces it where it stands,
 * so it keeps the shipped row's place in the order, a row with a new key is
 * tried after all the shipped ones, and `default` replaces `default`.
 */
export async function loadPricing(
	paths: PricingPaths,
): Promise<Pricing | null> {
	if (paths.shipped === null) {
		return null;
	}

	const parse = await tomlParser();

	if (parse === null) {
		return null;
	}

	const shipped = read(parse, paths.shipped);

	if (shipped === null || shipped.fallback === undefined) {
		// Only the shipped file has to carry a default: a user file correcting
		// one model says nothing about the rest.
		return null;
	}

	const over = paths.overrides === null ? null : read(parse, paths.overrides);
	// Setting a key a map already holds leaves it where it stands, which is
	// what puts a replacing row back in the shipped row's place and a row with
	// a new key after all of them.
	const models = new Map(shipped.models);

	for (const [key, row] of over?.models ?? []) {
		models.set(key, row);
	}

	return {
		fallback: over?.fallback ?? shipped.fallback,
		models: [...models.values()],
	};
}

/**
 * What one cached input token costs the model the transcript names, from the
 * first row whose key matches it, and the table's default when none do, an
 * empty model id included, since that matches no row. Null where there is no
 * table to ask.
 */
export const readMultiplier = (
	pricing: Pricing | null,
	model: string,
): number | null =>
	pricing === null
		? null
		: (rowFor(pricing.models, model)?.rate ?? pricing.fallback);

type Parse = (text: string) => unknown;

/**
 * The TOML parser, or null when the package is not installed. Unlike the
 * configuration, which reports that and stops, a reading without it is simply
 * priced at the default rate.
 */
async function tomlParser(): Promise<Parse | null> {
	try {
		const { parse } = await import("smol-toml");

		return parse;
	} catch {
		return null;
	}
}

/**
 * One price file, checked, or null: a file that is not there, one that cannot
 * be read or parsed, and one carrying a price the API cannot charge all come
 * back the same way, because they cost the caller the same thing: the rates in
 * that file, and nothing else.
 */
function read(parse: Parse, path: string): RawPricing | null {
	let table: unknown;

	try {
		table = parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}

	return checked(table);
}

/**
 * A rate of 0 would price a cut as free and one above 1 would make a cached
 * token dearer than a fresh one, which is not a price the API has. Either way
 * the payback figure comes out plausible and wrong.
 */
const isRate = (value: unknown): value is number =>
	typeof value === "number" &&
	Number.isFinite(value) &&
	value > 0 &&
	value <= 1;

/**
 * The table if every price in it is one the API could charge and every key is
 * the regular expression it is meant to be, and null otherwise. Null drops the
 * whole file rather than the rows that passed: the half of a price list that
 * parsed is not a price list anybody wrote.
 */
function checked(table: unknown): RawPricing | null {
	if (!isTable(table)) {
		return null;
	}

	const fallback = table["default"];
	const models = table["models"];

	if (
		(fallback !== undefined && !isRate(fallback)) ||
		(models !== undefined && !isTable(models))
	) {
		return null;
	}

	const rows = new Map<string, PriceRow>();

	for (const [pattern, rate] of Object.entries(fieldsOf(models))) {
		const match = compile(pattern);

		if (match === null || !isRate(rate)) {
			return null;
		}

		rows.set(pattern, { match, rate });
	}

	return { fallback: isRate(fallback) ? fallback : undefined, models: rows };
}
