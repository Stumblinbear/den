// The judge: what it is handed, the one call that gets an answer, and how what
// comes back is read. It is a model reading a conversation it is not part of,
// so everything it needs is in the prompt and nothing it says is trusted
// without being narrowed first. What it is held to is `answer.mts`.
//
// The call is bounded here rather than left to Claude Code. An async hook is
// backgrounded the moment it starts, and a judge that never returns would hold
// the in-flight marker for the rest of the session.
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import process from "node:process";
import { ANSWER, type Option, optionIn, type Wait, waitIn } from "./answer.mts";
import { formatTokens } from "./messages.mts";
import type { Turn } from "./recent-turns.mts";
import { opening } from "./rewind-picker.mts";
import type { Thresholds, Watcher } from "./settings.mts";
import { errorCode, firstLine, isTable } from "./shared/fields.mts";

/**
 * How long a judge call may run before it is killed. Three minutes rather than
 * one because a call is a Claude Code startup and a model round trip, and a
 * call killed at the bound is a turn the watcher says nothing on.
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
	 * It failed rather than answered, which is the one end worth a word:
	 * silence there is a watcher the user believes is watching and a judge that
	 * never answers. What failed is in `detail` rather than in the kind, since
	 * a command nothing starts and a call that came back an error cost the
	 * session the same thing and are different news to the user.
	 */
	| { readonly kind: "fault"; readonly detail: string };

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
 * answer. A call that failed rather than answered is the one end reported
 * instead.
 */
export function askJudge(watcher: Watcher, prompt: string): Answer {
	const run = judged(watcher, prompt);
	const envelope = objectIn(String(run.stdout ?? ""));

	if (envelope === null) {
		return unstarted(run)
			? { kind: "fault", detail: unstartedDetail(watcher.program, run) }
			: NONE;
	}

	// `is_error` and not the exit status, which a `command` of the user's own
	// spends however it likes, and not `subtype`, which a failed call leaves at
	// "success". A command handed no schema writes no `is_error` either, so an
	// answer of its own that nothing can read stays silence.
	return envelope["is_error"] === true
		? { kind: "fault", detail: failedDetail(watcher.program, envelope) }
		: answerIn(envelope);
}

/**
 * The call itself. The child inherits this process's directory and its
 * environment: the command decides what a judge loads, and `DEFAULT_COMMAND`
 * in `settings.mts` is where the default decides it.
 */
function judged(watcher: Watcher, prompt: string): SpawnSyncReturns<string> {
	const options = {
		input: prompt,
		encoding: "utf8" as const,
		timeout: JUDGE_BOUND_MS,
		windowsHide: true,
	};
	const run = spawnSync(watcher.program, watcher.args, options);

	// An npm install puts a CLI on Windows' PATH as a `.cmd`, which libuv
	// resolves for a bare name only through the command interpreter: without one
	// it looks for an `.exe`, finds none and reports ENOENT. The interpreter is
	// named here and handed the argument list, rather than `shell: true` naming
	// it: that option joins the arguments into one command line with no quoting
	// at all, and the schema is one long argument of braces and quotes, which
	// comes back out as something no JSON parser reads.
	//
	// ENOENT is the whole of what a second spawn is for. A call killed at the
	// bound reports through `error` as well, and running that one again spends
	// two bounds on one consultation, which outlasts the age the in-flight
	// marker is read as dead at: the Stop after it would start a third judge.
	return errorCode(run.error) === "ENOENT" && process.platform === "win32"
		? spawnSync(
				comspec(),
				["/d", "/s", "/c", watcher.program, ...watcher.args],
				options,
			)
		: run;
}

/**
 * Windows' command interpreter, named as the OS names it and as `shell: true`
 * would have found it, so a machine whose interpreter is not at the usual place
 * keeps working.
 */
const comspec = (): string =>
	// biome-ignore lint/style/noProcessEnv: which interpreter Windows runs a `.cmd` through is the OS's to say, and it says it here.
	process.env["ComSpec"] || "cmd.exe";

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
 * What the report says went wrong for a judge that never ran, in one line and
 * naming the command.
 */
const unstartedDetail = (
	program: string,
	run: SpawnSyncReturns<string>,
): string =>
	`the watcher's judge \`${program}\` did not start (${
		errorCode(run.error) || readable(run.stderr) || `exit ${run.status}`
	})`;

/**
 * What the report says went wrong for a judge that ran and failed, in one line
 * and naming the command. `claude -p` marks the envelope `is_error` and names
 * the kind of failure in `terminal_reason`; a judge that marks one and says
 * nothing about it leaves the report with the fact and nothing behind it.
 */
function failedDetail(
	program: string,
	envelope: Record<string, unknown>,
): string {
	const kind = readable(envelope["terminal_reason"]);
	const sentence = sentenceIn(envelope);
	const failed = `the watcher's judge \`${program}\` ran and failed`;

	if (sentence === "") {
		return kind === "" ? `${failed} without saying why` : `${failed} (${kind})`;
	}

	return kind === ""
		? `${failed}: ${sentence}`
		: `${failed} (${kind}): ${sentence}`;
}

/**
 * What the failure came with, in one sentence. A call that reached the model
 * and came back an error writes it in `result`; a call that ran out of turns,
 * died inside its own execution, spent its budget or gave up re-asking for
 * structured output writes no `result` at all and lists what went wrong in
 * `errors` instead. Empty for an envelope carrying neither.
 */
function sentenceIn(envelope: Record<string, unknown>): string {
	const said = readable(envelope["result"]);

	if (said !== "") {
		return said;
	}

	const errors = envelope["errors"];

	return Array.isArray(errors) ? readable(errors[0]) : "";
}

/**
 * A value as a report reads it out, and nothing for a value it cannot read. A
 * shell's line about a command it could not find and a CLI's line about a call
 * that failed both carry the punctuation of a sentence that goes on, and the
 * report's own sentence goes on straight after this one.
 */
const readable = (value: unknown): string =>
	typeof value === "string" ? firstLine(value).replace(/[.,;:\s]+$/, "") : "";

/**
 * The answer inside the envelope the command wrote. `claude --output-format
 * json` puts the object it validated against the schema in `structured_output`,
 * which is the answer where there is one: nothing has to go looking for a
 * brace in prose that may have been written around it. That object is the
 * schema's own wrapper, so the answer is what it holds under `answer`; a judge
 * validated against a schema of somebody else's writing has no wrapper, and
 * what it wrote is read as it stands.
 *
 * A `command` of the user's own is handed no schema, so the fallback is the
 * whole of what it gets: the model's text in the CLI's `result` field, or the
 * object written bare. Both are still read here, so the seam does not oblige a
 * user to imitate one CLI's envelope.
 */
function answerIn(envelope: Record<string, unknown>): Answer {
	const validated = envelope["structured_output"];

	if (isTable(validated)) {
		const inside = validated["answer"];

		return narrowed(isTable(inside) ? inside : validated);
	}

	const answer =
		typeof envelope["result"] === "string"
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
