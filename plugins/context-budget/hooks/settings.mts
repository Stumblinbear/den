// Everything the two hooks read out of the configuration file, checked once
// here so neither carries a second opinion about what a usable value looks
// like. Nothing is merged over anything, so a key the file does not carry is
// missing rather than defaulted -- except `enabled`, which is what a table is
// switched off with, and `[models]`, which a file need not have at all.
import { loadConfigFile } from "../lib/config.mts";
import { isTable } from "../lib/fields.mts";
import { FAULTS } from "./plugin.mts";

/** The two levels a message is written for. */
export type NoticeLevel = "notice" | "urgent";

export interface Thresholds {
	readonly notice: number;
	readonly urgent: number;
}

export interface NoticeMessages {
	readonly notice: string;
	readonly urgent: string;
}

/** A per-model row: its thresholds, or null for a model switched off. */
export interface ModelRow {
	readonly match: RegExp;
	readonly limits: Thresholds | null;
}

export interface GuardLimits {
	readonly large: number;
	readonly cold: number;
}

export interface Guard {
	/** Null when the guard is switched off, which needs no numbers. */
	readonly limits: GuardLimits | null;
	readonly denied: string;
	readonly used: string;
}

export interface Settings {
	/** Tried in the order they are written, before `fallback`. */
	readonly models: readonly ModelRow[];
	/** `[default]`, or null when every model no row matches is switched off. */
	readonly fallback: Thresholds | null;
	readonly messages: NoticeMessages;
	readonly guard: Guard;
}

/** One table of the configuration, and what a fault about it names. */
interface Section {
	readonly path: string;
	readonly label: string;
	readonly table: Record<string, unknown>;
}

/** Null when there is no configuration file: both hooks then do nothing. */
export async function loadSettings(
	args: readonly string[],
): Promise<Settings | null> {
	const file = await loadConfigFile(FAULTS, args);

	return file === null
		? null
		: settingsIn({ path: file.path, label: "", table: file.table });
}

/**
 * The first row whose key matches the model id, and `[default]` when none do.
 * Null says this model is switched off and has no thresholds to cross.
 */
export function thresholdsFor(
	settings: Settings,
	model: string,
): Thresholds | null {
	for (const row of settings.models) {
		if (row.match.test(model)) {
			return row.limits;
		}
	}

	return settings.fallback;
}

function settingsIn(root: Section): Settings {
	const fallback = thresholds(child(root, "default"));
	const models = modelRows(root);
	const messages = child(root, "messages");

	return {
		models,
		fallback,
		messages: {
			notice: text(messages, "notice"),
			urgent: text(messages, "urgent"),
		},
		guard: guard(root),
	};
}

function modelRows(root: Section): readonly ModelRow[] {
	const models = root.table["models"];

	if (models === undefined) {
		return [];
	}

	if (!isTable(models)) {
		fault(root, "has [models], which is not a table");
	}

	return Object.entries(models).map(([pattern, row]) =>
		modelRow(root, pattern, row),
	);
}

function modelRow(root: Section, pattern: string, row: unknown): ModelRow {
	const label = `[models.'${pattern}']`;

	if (!isTable(row)) {
		fault(root, `has ${label}, which is not a table`);
	}

	const match = compile(pattern);

	if (match === null) {
		fault(root, `has ${label}, whose key is not a regular expression`);
	}

	return { match, limits: thresholds({ path: root.path, label, table: row }) };
}

function guard(root: Section): Guard {
	const section = child(root, "resume-guard");
	const messages = child(section, "messages");

	return {
		limits: enabled(section)
			? { large: number(section, "large"), cold: number(section, "cold") }
			: null,
		denied: text(messages, "denied"),
		used: text(messages, "used"),
	};
}

/** Null for a table switched off, which is never consulted for a threshold. */
const thresholds = (section: Section): Thresholds | null =>
	enabled(section)
		? { notice: number(section, "notice"), urgent: number(section, "urgent") }
		: null;

function child(parent: Section, key: string): Section {
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

function enabled(section: Section): boolean {
	const value = section.table["enabled"] ?? true;

	if (typeof value !== "boolean") {
		fault(section, `has ${section.label} enabled that is not a boolean`);
	}

	return value;
}

function number(section: Section, key: string): number {
	const value = section.table[key];

	if (value === undefined) {
		fault(section, `is missing ${section.label} ${key}`);
	}

	if (typeof value !== "number" || !Number.isFinite(value)) {
		fault(section, `has ${section.label} ${key} that is not a number`);
	}

	return value;
}

function text(section: Section, key: string): string {
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

/** How a fault names a table: `[key]` at the root, `[parent.key]` under one. */
const labelled = (parent: string, key: string): string =>
	parent === "" ? `[${key}]` : `[${parent.slice(1, -1)}.${key}]`;

function compile(pattern: string): RegExp | null {
	try {
		return new RegExp(pattern);
	} catch {
		return null;
	}
}

const fault: (section: Section, detail: string) => never = (
	section,
	detail,
) => {
	throw FAULTS.configFault(section.path, detail);
};
