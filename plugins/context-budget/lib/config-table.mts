// One table of the configuration file and how a value is read out of it: the
// narrowing every key goes through, and the fault each failed narrowing
// raises. Its own subject because none of it knows what this plugin's settings
// are, and `settings.mts` says what they are without restating what a usable
// number or a usable table looks like.
//
// Every reader here faults rather than substituting anything, since a stand-in
// value is a plugin doing something the user did not write down.
import { CONFIG_FAULTS } from "./plugin.mts";
import { isTable } from "./shared/fields.mts";

/** One table of the configuration, and what a fault about it names. */
export interface Section {
	/** Named in every report about it. */
	readonly path: string;
	/** How a fault spells it: empty at the root, `[key]` or `[a.b]` below. */
	readonly label: string;
	readonly table: Record<string, unknown>;
}

/** A table the file has to carry, named in a fault where it does not. */
export function child(parent: Section, key: string): Section {
	const label = labelled(parent.label, key);
	const table = parent.table[key];

	if (table === undefined) {
		fault(parent, `is missing ${label}`);
	}

	if (!isTable(table)) {
		fault(parent, `has ${label}, which is not a table`);
	}

	return { path: parent.path, label, table };
}

/**
 * A table the file need not carry at all, read as empty where it does not:
 * every key under one has a default, so an absent table and a table written
 * out in full are the same settings.
 */
export function defaulted(parent: Section, key: string): Section {
	const label = labelled(parent.label, key);
	const table = parent.table[key] ?? {};

	if (!isTable(table)) {
		fault(parent, `has ${label}, which is not a table`);
	}

	return { path: parent.path, label, table };
}

/** Whether a table is switched on, and true where it says nothing. */
export function enabled(section: Section): boolean {
	const value = section.table["enabled"] ?? true;

	if (typeof value !== "boolean") {
		fault(section, `has ${section.label} enabled that is not a boolean`);
	}

	return value;
}

export function number(section: Section, key: string): number {
	const value = section.table[key];

	if (value === undefined) {
		fault(section, `is missing ${section.label} ${key}`);
	}

	if (typeof value !== "number" || !Number.isFinite(value)) {
		fault(section, `has ${section.label} ${key} that is not a number`);
	}

	return value;
}

/** A string the file has to carry; a blank one is a fault as well. */
export function text(section: Section, key: string): string {
	const value = section.table[key];

	if (value === undefined) {
		fault(section, `is missing ${section.label} ${key}`);
	}

	if (typeof value !== "string" || value.trim() === "") {
		fault(
			section,
			`has ${section.label} ${key} that is not a non-empty string`,
		);
	}

	return value;
}

/** The same as `text`, for a key whose table carries a default for it. */
export const textOr = (
	section: Section,
	key: string,
	fallback: string,
): string => (section.table[key] === undefined ? fallback : text(section, key));

/**
 * A count, for a key whose table carries a default for it. Whole and above
 * zero, since both of the ones read this way size something: a tail of no
 * turns, or of half a token, is not a smaller tail but a broken one.
 */
export function countOr(
	section: Section,
	key: string,
	fallback: number,
): number {
	const value = section.table[key];

	if (value === undefined) {
		return fallback;
	}

	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
		fault(
			section,
			`has ${section.label} ${key} that is not a whole number above 0`,
		);
	}

	return value;
}

/**
 * How a fault names a table: `[key]` at the root, `[parent.key]` under one.
 * A keyed row is named by passing its quoted key, `'fable'`, as the key.
 */
export const labelled = (parent: string, key: string): string =>
	parent === "" ? `[${key}]` : `[${parent.slice(1, -1)}.${key}]`;

export const fault: (section: Section, detail: string) => never = (
	section,
	detail,
) => {
	throw CONFIG_FAULTS.configFault(section.path, detail);
};
