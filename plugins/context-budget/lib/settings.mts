// Everything the entries read out of the configuration file, checked once here
// so none of them carries a second opinion about what a usable value looks
// like. A key the file carries is the value; a key it leaves out is a missing
// key and a fault naming it, except where the table below says the key has a
// default. `enabled` has one wherever it appears, `[models]` may be left out,
// and `[watcher]` may be left out with each of its keys defaulted, so a file
// that names none of them still gets a watcher.
import { dirname } from "node:path";
import {
	child,
	countOr,
	defaulted,
	enabled,
	fault,
	number,
	type Section,
	text,
	textOr,
} from "./config-table.mts";
import { fill } from "./messages.mts";
import { compile, type ModelMatch, rowFor } from "./model-rows.mts";
import { FAULTS } from "./plugin.mts";
import { loadConfigFile } from "./shared/config.mts";
import { isTable } from "./shared/fields.mts";

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
export interface ModelRow extends ModelMatch {
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

/** What the watcher runs on. Every key has a default; see the header. */
export interface Watcher {
	readonly enabled: boolean;
	/**
	 * The judge itself, which is the first word of `command` with `{model}`
	 * filled in. A user whose judge is another runtime writes the whole of that
	 * key, which is why the model reaches the default through a placeholder
	 * rather than being appended to it.
	 */
	readonly program: string;
	/** The rest of `command`, filled in the same way. */
	readonly args: readonly string[];
	/**
	 * Where the judge runs, which is the directory this file was read from. A
	 * judge left in the hook's own working directory would load the project's
	 * CLAUDE.md, hooks and MCP servers on every consultation.
	 */
	readonly cwd: string;
	readonly tailTurns: number;
	readonly tailTokens: number;
}

export interface Settings {
	/** Tried in the order they are written, before `fallback`. */
	readonly models: readonly ModelRow[];
	/** `[default]`, or null when every model no row matches is switched off. */
	readonly fallback: Thresholds | null;
	readonly messages: NoticeMessages;
	readonly guard: Guard;
	readonly watcher: Watcher;
}

/**
 * What the judge is asked with where the file names no command of its own:
 * one turn, no session left behind, and the answer as JSON on stdout. It runs
 * on the user's subscription, which is why it is `claude` rather than an API
 * call.
 */
const JUDGE: readonly string[] = [
	"claude",
	"-p",
	"--model",
	"{model}",
	"--max-turns",
	"1",
	"--output-format",
	"json",
	"--no-session-persistence",
];

/** Null when there is no configuration file: every entry then does nothing. */
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
	const row = rowFor(settings.models, model);

	// A row that matched and carries no thresholds is a model switched off, so
	// its null is the answer rather than a reason to fall back.
	return row === null ? settings.fallback : row.limits;
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
		watcher: watcher(root),
	};
}

function watcher(root: Section): Watcher {
	const section = defaulted(root, "watcher");
	const [program, ...args] = command(
		section,
		textOr(section, "model", "haiku"),
	);

	return {
		enabled: enabled(section),
		program,
		args,
		cwd: dirname(section.path),
		tailTurns: countOr(section, "tail_turns", 16),
		tailTokens: countOr(section, "tail_tokens", 20_000),
	};
}

/**
 * The judge invocation, whether the file wrote one or took the default, as the
 * program and its arguments: a command with no first word is nothing to spawn,
 * and the check that rules it out belongs where the value is read.
 */
function command(
	section: Section,
	model: string,
): readonly [string, ...string[]] {
	const written = section.table["command"] ?? JUDGE;
	const argv: string[] = [];

	if (Array.isArray(written)) {
		for (const word of written) {
			if (typeof word === "string" && word !== "") {
				argv.push(fill(word, { model }));
			}
		}
	}

	const [program, ...args] = argv;

	if (
		!Array.isArray(written) ||
		argv.length !== written.length ||
		program === undefined
	) {
		fault(
			section,
			`has ${section.label} command that is not a non-empty array of non-empty strings`,
		);
	}

	return [program, ...args];
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
