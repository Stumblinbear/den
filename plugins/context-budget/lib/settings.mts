// Everything the entries read out of the configuration file, checked once here
// so none of them carries a second opinion about what a usable value looks
// like. A key the file carries is the value; a key it leaves out is a missing
// key and a fault naming it, except where the table below says the key has a
// default. `enabled` has one wherever it appears, a table of keyed rows may be
// left out, and `[watcher]` may be left out with each of its keys defaulted, so
// a file that names none of them still gets a watcher.
import { ANSWER_SCHEMA } from "./answer.mts";
import {
	child,
	countOr,
	defaulted,
	enabled,
	fault,
	labelled,
	number,
	type Section,
	text,
	textOr,
} from "./config-table.mts";
import { compile, type Keyed, rowFor } from "./keyed-rows.mts";
import { fill } from "./messages.mts";
import { CONFIG_FAULTS } from "./plugin.mts";
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

/**
 * A row keyed by a regular expression and what it sets, with null for a row
 * that sets nothing: one written to switch off whatever its key matches, which
 * is why such a row needs no numbers.
 */
export interface Row<Limits> extends Keyed {
	readonly limits: Limits | null;
}

export interface GuardLimits {
	readonly large: number;
	readonly cold: number;
}

/** Everything a resume is measured against, in the order they are tried. */
export interface GuardTables {
	/** Tried first: the agent type is the more specific fact about a resume. */
	readonly agents: readonly Row<GuardLimits>[];
	/** Tried next, against the model the resumed transcript's last turn names. */
	readonly models: readonly Row<GuardLimits>[];
	/** The section's own numbers, for a resume no row above matches. */
	readonly fallback: GuardLimits;
}

export interface Guard {
	/**
	 * Null where the guard is switched off, which `enabled = false` on the
	 * section does to its rows as well: a switch that left them refusing
	 * resumes would be one a user cannot switch off with.
	 */
	readonly limits: GuardTables | null;
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
	readonly tailTurns: number;
	readonly tailTokens: number;
}

export interface Settings {
	/** Tried in the order they are written, before `fallback`. */
	readonly models: readonly Row<Thresholds>[];
	/** `[default]`, or null when every model no row matches is switched off. */
	readonly fallback: Thresholds | null;
	readonly messages: NoticeMessages;
	readonly guard: Guard;
	readonly watcher: Watcher;
}

/**
 * The whole of what the judge is told before the prompt. It answers one
 * question about a conversation it is not part of, and the prompt carries
 * everything that question turns on, so the framing is the only work a system
 * prompt has left to do.
 */
export const DEFAULT_SYSTEM_PROMPT =
	"You are the judge a Claude Code plugin consults: answer the one question the prompt asks, from the prompt alone, and stop.";

/**
 * What the judge is asked with where the file names no command of its own: no
 * tools, two turns, safe mode, a system prompt of our own, no session left
 * behind, the answer as JSON on stdout, and the answer shapes as a schema the
 * CLI samples the model against and validates for it. It runs on the user's
 * subscription, which is why it is `claude` rather than an API call. A
 * `command` written out in full replaces this whole list, schema and all.
 *
 * `--safe-mode` is what keeps everything else out. Without it the child loads
 * the user's plugins, hooks and MCP servers and the project's CLAUDE.md before
 * it reads a word of the prompt: several times the prompt in tokens, this
 * plugin's own hooks firing in a session that is not the user's, and a verdict
 * that turns on whatever the machine happens to have installed.
 *
 * `--system-prompt` is what keeps the project out. Safe mode loads none of the
 * configuration, and Claude Code's default system prompt arrives anyway,
 * carrying the directory the judge was started in, its git branch, the names
 * of the files changed there and the last few commit subjects. One sentence
 * in its place leaves the judge the prompt and nothing else.
 *
 * `--tools ""` is what keeps the judge from acting. It is a Claude Code session
 * of its own, so without the flag it holds every tool this one holds, and a
 * sentence of advice is the whole of what it is asked for. The flag disables
 * the built-in tools; the structured output the schema is wired in as is not
 * one of them and survives it.
 *
 * Two turns because a validated answer costs two responses wherever the model
 * writes it out as text first: the CLI takes the structured output through a
 * tool call, which is a response of its own. Which of the two the model does
 * first is not ours to settle, and at one turn the text-first half of it comes
 * back empty.
 */
const DEFAULT_COMMAND: readonly string[] = [
	"claude",
	"-p",
	"--model",
	"{model}",
	"--tools",
	"",
	"--max-turns",
	"2",
	"--output-format",
	"json",
	"--no-session-persistence",
	"--safe-mode",
	"--system-prompt",
	DEFAULT_SYSTEM_PROMPT,
	"--json-schema",
	ANSWER_SCHEMA,
];

/** Null when there is no configuration file: every entry then does nothing. */
export async function loadSettings(
	args: readonly string[],
): Promise<Settings | null> {
	const file = await loadConfigFile(CONFIG_FAULTS, args);

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

/**
 * The limits a resume is measured against: the first agent-type row that
 * matches, then the first model row, then the section's own numbers. Null says
 * the row that matched carries none, which is a row written to leave what it
 * matches unguarded.
 */
export function guardLimitsFor(
	tables: GuardTables,
	type: string,
	model: string,
): GuardLimits | null {
	// A row that matched and carries no limits switches the guard off for what
	// it matches, so its null is the answer rather than a reason to look on.
	const row = rowFor(tables.agents, type) ?? rowFor(tables.models, model);

	return row === null ? tables.fallback : row.limits;
}

function settingsIn(root: Section): Settings {
	const fallback = thresholds(child(root, "default"));
	const models = rows(root, "models", thresholds);
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
		tailTurns: countOr(section, "tail_turns", 16),
		tailTokens: countOr(section, "tail_tokens", 20_000),
	};
}

/**
 * The judge invocation, whether the file wrote one or took the default, as the
 * program and its arguments: a command with no first word is nothing to spawn,
 * and the check that rules it out belongs where the value is read. An empty
 * word after that one is an argument rather than a mistake, since `--tools ""`
 * is how the default switches the judge's own tools off.
 */
function command(
	section: Section,
	model: string,
): readonly [string, ...string[]] {
	const written = section.table["command"] ?? DEFAULT_COMMAND;
	const argv: string[] = [];

	if (Array.isArray(written)) {
		for (const word of written) {
			if (typeof word === "string") {
				argv.push(fill(word, { model }));
			}
		}
	}

	const [program, ...args] = argv;

	if (!Array.isArray(written) || argv.length !== written.length || !program) {
		fault(
			section,
			`has ${section.label} command that is not an array of strings beginning with a program to run`,
		);
	}

	return [program, ...args];
}

/**
 * A table of keyed rows, in the order the file writes them, and no rows at all
 * where the file leaves the table out. What a row carries beside its key is
 * `limits`, which is the whole of the difference between the tables read this
 * way.
 */
function rows<Limits>(
	parent: Section,
	key: string,
	limits: (row: Section) => Limits | null,
): readonly Row<Limits>[] {
	const table = defaulted(parent, key);

	return Object.entries(table.table).map(([pattern, row]) => {
		const label = labelled(table.label, `'${pattern}'`);

		if (!isTable(row)) {
			fault(table, `has ${label}, which is not a table`);
		}

		const match = compile(pattern);

		if (match === null) {
			fault(table, `has ${label}, whose key is not a regular expression`);
		}

		return { match, limits: limits({ path: table.path, label, table: row }) };
	});
}

function guard(root: Section): Guard {
	const section = child(root, "resume-guard");
	const messages = child(section, "messages");
	// Read whether or not they will be consulted, so a row nobody is measured
	// against is still a row whose mistakes the file's author hears about.
	const agents = rows(section, "agents", guardLimits);
	const models = rows(section, "models", guardLimits);
	const fallback = guardLimits(section);

	return {
		limits: fallback === null ? null : { agents, models, fallback },
		denied: text(messages, "denied"),
		used: text(messages, "used"),
	};
}

/** Null for a table switched off, which is never consulted for a threshold. */
const thresholds = (section: Section): Thresholds | null =>
	enabled(section)
		? { notice: number(section, "notice"), urgent: number(section, "urgent") }
		: null;

/** The same for the guard: null is a table that guards nothing it governs. */
const guardLimits = (section: Section): GuardLimits | null =>
	enabled(section)
		? { large: number(section, "large"), cold: number(section, "cold") }
		: null;
