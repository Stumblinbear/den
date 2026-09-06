// The judge: what it is handed, what it is held to, and the one call that gets
// an answer. It is a model reading a conversation it is not part of, so
// everything it needs is in the prompt and nothing it says is trusted without
// being narrowed first.
//
// The call is bounded here rather than left to Claude Code. An async hook is
// backgrounded the moment it starts, and a judge that never returns would hold
// the in-flight marker for the rest of the session.
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import process from "node:process";
import { formatTokens } from "./messages.mts";
import { JUDGE } from "./plugin.mts";
import type { Turn } from "./recent-turns.mts";
import { opening } from "./rewind-picker.mts";
import type { Thresholds, Watcher } from "./settings.mts";
import { errorCode, firstLine, isTable } from "./shared/fields.mts";

/**
 * How long a judge call may run before it is killed. Three minutes rather than
 * one because the judge is a Claude Code session of its own: it loads the
 * user's plugins and starts their MCP servers before it reads a word of the
 * prompt, and a bound tight enough to kill it there would leave the watcher
 * silent on exactly the machines that have the most to say.
 */
const JUDGE_BOUND_MS = 180_000;

/**
 * How old an in-flight marker may be before it belongs to a run that died.
 * Past the call's own bound, because a run still inside a call it is about to
 * kill has written nothing back yet, and a second judge started beside it
 * would spend a second call to overwrite the first.
 */
export const JUDGE_DEAD_MS = 2 * JUDGE_BOUND_MS;

/**
 * Characters to a token, near enough to cut a tail by. Nothing here can
 * tokenize, and the cut is a budget rather than a measurement: what it buys is
 * a bounded prompt, and being a few hundred tokens out costs nothing.
 */
const CHARS_A_TOKEN = 4;

/** What the judge recommends where it finds the moment good. */
export type Option = "compact" | "rewind" | "carry-on";

/** How long the judge asks to be left alone where the moment is not good. */
export type Wait = "next turn" | "a few turns" | "later";

const OPTIONS: readonly Option[] = ["compact", "rewind", "carry-on"];

const WAITS: readonly Wait[] = ["next turn", "a few turns", "later"];

/** The option a judge's answer names, and null for anything that is none. */
export const optionIn = (value: unknown): Option | null =>
	OPTIONS.find((known) => known === value) ?? null;

/** The wait a judge's answer names, and null for anything that is none. */
export const waitIn = (value: unknown): Wait | null =>
	WAITS.find((known) => known === value) ?? null;

/** What came back from one consultation, in the shapes the hook acts on. */
export type Answer =
	| {
			readonly kind: "good";
			readonly option: Option;
			/** The focus line, or the opening words of the prompt to rewind to. */
			readonly focus: string;
			readonly reason: string;
	  }
	| { readonly kind: "wait"; readonly wait: Wait }
	/** It ran and answered nothing this can act on, which is silence. */
	| { readonly kind: "none" }
	/**
	 * It never ran, which is the one failure worth a word: silence there would
	 * be a watcher the user believes is watching and a command nothing starts.
	 */
	| { readonly kind: "unstarted"; readonly detail: string };

const NONE: Answer = { kind: "none" };

/** Where the context stands against the thresholds it is judged by. */
export interface Budget {
	readonly tokens: number;
	readonly limits: Thresholds;
}

/**
 * The whole prompt: the arc rule the skill states, the priced reading, the
 * conversation, and the answer it is held to.
 */
export function judgePrompt(
	reading: string,
	turns: readonly Turn[],
	budget: Budget,
	tailTokens: number,
): string {
	return [
		BRIEF,
		`<reading>\n${reading}\n</reading>`,
		`<turns>\n${tail(turns, tailTokens)}\n</turns>`,
		`The session is at ${formatTokens(budget.tokens)} tokens, past its ${formatTokens(budget.limits.notice)} notice threshold and under its ${formatTokens(budget.limits.urgent)} urgent one.`,
		ANSWER,
	].join("\n\n");
}

/**
 * The rules below are the coordinator's own, so that the two cannot rule
 * differently on one moment. The arc test is "Judging the stopping point" and
 * the order of the three options is "Choosing between them", both in
 * `skills/context-budget/SKILL.md`; the priced rule the third step states is
 * "Choosing" in `skills/cut-point/SKILL.md`. Edit them together.
 */
const BRIEF = `You are judging one thing about a Claude Code session you are not part of: whether it has just reached a good moment to shrink its context. You advise; the session's own agent decides, and it can see everything you cannot.

A good moment is the end of an arc, where the work ahead would not need the detail behind it: a change landed and reviewed, a question answered and acted on, an investigation whose finding is written down somewhere durable. A step inside an arc reads as tidy and is not one, because the next step is written from exactly the detail a summary would thin: a brief written, an agent launched, a report relayed, a change that compiles.

Weigh it in three steps, in this order.

1. Whether the arc has ended. Where it has not, the answer is a wait and nothing else.
2. What may be summarized away. Whatever the next steps still lean on has to survive verbatim. That rules out \`compact\` where the tail it keeps would not hold that setup, however cheap the reading prices it, and it admits \`rewind\` only at a prompt the arc began at or after.
3. What the arc admits, priced. The lowest payback wins and \`compact\` takes a tie. Where every payback is longer than the arc has left to run, the arc has still ended and the recommendation is \`carry-on\`.`;

const ANSWER = `Answer with one JSON object and nothing else, in one of these two shapes.

{"good": false, "wait": "next turn" | "a few turns" | "later"}
{"good": true, "option": "compact" | "rewind" | "carry-on", "focus": "...", "reason": "..."}

The first is the answer for an arc that has not ended, and \`wait\` is how long before this is worth another look: \`next turn\` where the arc is closing now, \`a few turns\` where the session is mid-step, \`later\` where it has just begun.

The second is the answer for an arc that has ended, \`carry-on\` included. \`focus\` is the focus line on \`compact\`, the opening words of the prompt to rewind to on \`rewind\`, copied from the turns above, and "" on \`carry-on\`. \`reason\` is one sentence in the session's own terms, naming the arc that ended. The agent reads both back to the person running the session, so keep each to a line and write them in that session's words.`;

/**
 * The conversation as the judge reads it, oldest turn first, cut to the token
 * budget from the oldest end. Whole lines, so the cut lands between two of
 * them rather than mid-word, and marked, so the judge reads the first turn as
 * a fragment rather than as the start of the session.
 */
function tail(turns: readonly Turn[], tailTokens: number): string {
	const text = turns.map(written).join("\n\n");
	const budget = tailTokens * CHARS_A_TOKEN;

	if (text.length <= budget) {
		return text;
	}

	const cut = text.slice(text.length - budget);

	return `[earlier turns cut]\n${cut.slice(cut.indexOf("\n") + 1)}`;
}

// The uuid heads each turn so that the judge reads one prompt and its replies
// as one thing. Nothing is answered with it: where a verdict lands is the
// hook's, and a uuid copied back by a model is a verdict lost to a typo.
const written = (turn: Turn): string =>
	[
		`turn ${turn.at}`,
		`user: ${turn.asked}`,
		...turn.said.map((said) => `assistant: ${said}`),
		...(turn.called.length === 0
			? []
			: [`tools: ${turn.called.map((use) => use.name).join(", ")}`]),
	].join("\n");

/**
 * What the judge answered. Silence is the safe end of a call that did not
 * finish inside the bound or answered something this cannot act on: the
 * watcher advises, so an answer nobody can read is worth exactly as much as no
 * answer.
 */
export function askJudge(watcher: Watcher, prompt: string): Answer {
	const run = judged(watcher, prompt);

	return unstarted(run)
		? { kind: "unstarted", detail: detailOf(watcher.program, run) }
		: answerIn(String(run.stdout ?? ""));
}

/**
 * The call itself, run in the directory `Watcher.cwd` names. See that field in
 * `settings.mts` for why the judge is not started where the hook stands.
 */
function judged(watcher: Watcher, prompt: string): SpawnSyncReturns<string> {
	const options = {
		input: prompt,
		encoding: "utf8" as const,
		timeout: JUDGE_BOUND_MS,
		windowsHide: true,
		cwd: watcher.cwd,
		// biome-ignore lint/style/noProcessEnv: the judge is a Claude Code run of its own, so it fires this plugin's hooks; the marker is how they are told whose child they are in.
		env: { ...process.env, [JUDGE]: "1" },
	};
	const run = spawnSync(watcher.program, watcher.args, options);

	// An npm install puts a CLI on Windows' PATH as a `.cmd`, which libuv
	// resolves for a bare name only through a shell: without one it looks for an
	// `.exe`, finds none and reports ENOENT. The prompt goes in on stdin and the
	// arguments are flags, so a shell has nothing here to reinterpret.
	//
	// ENOENT is the whole of what a second spawn is for. A call killed at the
	// bound reports through `error` as well, and running that one again spends
	// two bounds on one consultation, which outlasts the age the in-flight
	// marker is read as dead at: the Stop after it would start a third judge.
	return errorCode(run.error) === "ENOENT" && process.platform === "win32"
		? spawnSync(watcher.program, watcher.args, { ...options, shell: true })
		: run;
}

/**
 * Whether the judge never ran. A command nothing could start says so through
 * `error`; one a shell could not find exits without writing a byte, which is
 * as close as the shell lets anyone get to the same news. A call killed at the
 * bound ran and was slow, and a call that wrote anything at all answered
 * something, usable or not.
 */
function unstarted(run: SpawnSyncReturns<string>): boolean {
	if (errorCode(run.error) === "ETIMEDOUT") {
		return false;
	}

	return run.status !== 0 && String(run.stdout ?? "").trim() === "";
}

/**
 * What the report says went wrong, in one line and naming the command. A
 * shell's own line about a command it could not find carries the punctuation
 * of a sentence that goes on, which this one does not.
 */
const detailOf = (program: string, run: SpawnSyncReturns<string>): string =>
	`the watcher's judge \`${program}\` did not start (${
		errorCode(run.error) ||
		firstLine(String(run.stderr ?? "")).replace(/[.,;:\s]+$/, "") ||
		`exit ${run.status}`
	})`;

/**
 * The answer inside whatever the command wrote. `claude --output-format json`
 * wraps the model's text in a `result` field; a runtime configured in its place
 * may write the object itself, and both are read here so that the `command`
 * seam does not oblige a user to imitate one CLI's envelope.
 */
function answerIn(stdout: string): Answer {
	const envelope = objectIn(stdout);
	const answer =
		envelope !== null && typeof envelope["result"] === "string"
			? objectIn(envelope["result"])
			: envelope;

	return answer === null ? NONE : narrowed(answer);
}

/** The judge's own fields, and `none` for an answer carrying none it can use. */
function narrowed(answer: Record<string, unknown>): Answer {
	if (answer["good"] !== true) {
		const wait = waitIn(answer["wait"]);

		return wait === null ? NONE : { kind: "wait", wait };
	}

	const option = optionIn(answer["option"]);
	const focus = String(answer["focus"] ?? "").trim();
	// The reason is read out mid-sentence, where the model's own full stop
	// would land beside the sentence's.
	const reason = String(answer["reason"] ?? "")
		.trim()
		.replace(/[.\s]+$/, "");

	// A recommendation with nothing to act on is one the coordinator would have
	// to invent the missing half of, and the reason is the whole of what makes
	// it advice rather than an instruction.
	if (option === null || reason === "") {
		return NONE;
	}

	if (option === "carry-on") {
		return { kind: "good", option, focus: "", reason };
	}

	// A rewind is named to the user in a sentence, and the picker's own rows are
	// the words they will be reading it against.
	return focus === ""
		? NONE
		: {
				kind: "good",
				option,
				focus: option === "rewind" ? opening(focus) : focus,
				reason,
			};
}

/**
 * The JSON object in a piece of text, and null where there is none. A model
 * asked for JSON writes a fenced block about as often as a bare object, so the
 * object is taken from the first brace to the last rather than from the whole
 * of what was written.
 */
function objectIn(text: string): Record<string, unknown> | null {
	const opened = text.indexOf("{");
	const closed = text.lastIndexOf("}");

	if (opened < 0 || closed < opened) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(text.slice(opened, closed + 1));

		return isTable(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
