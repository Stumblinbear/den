// What the standing-fault cases share: the two configuration files a case is
// broken or fixed with, and the hook runs it makes. A case names a session, an
// event and a file; everything else about the input is the same from case to
// case, since what is under test is what the record carries between runs
// rather than anything the input says. Importing this registers no test of its
// own.
import type { Result, Runtime } from "../../../tests/harness.mts";
import { assistant } from "./fixtures.mts";
import {
	DEFAULTS,
	GUARD,
	GUARD_MESSAGES,
	hookRunner,
	MESSAGES,
	sessionId,
	transcript,
	unreadableSession,
} from "./harness.mts";

/** The whole file, as a config that has been fixed. */
export const USABLE = [DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES].join("\n");

/** A file that does not parse, which is the same config fault on every run. */
export const BROKEN = "[resume-guard\nlarge = 10\n";

/**
 * A file that parses and is missing a key: the second mistake behind the
 * first, which is a fault of the same class in different words.
 */
export const HALF_FIXED = [
	"[default]\nnotice = 150_000\n",
	MESSAGES,
	GUARD,
	GUARD_MESSAGES,
].join("\n");

/** The runs a standing-fault case makes, under one runtime. */
export interface StandingRuns {
	/** A session id nothing else in this run has used. */
	session(): string;
	/** The measurement hook, on the event and the extra input fields named. */
	run(
		session: string,
		event: string,
		config: string,
		fields?: Record<string, unknown>,
	): Result;
	/** A prompt with a transcript under every threshold, so it injects nothing. */
	prompt(session: string, config: string): Result;
	/** A tool call with the same transcript. */
	toolCall(session: string, config: string): Result;
	/** A prompt over the notice threshold, which has a message to inject. */
	measured(session: string, config: string): Result;
	/**
	 * A prompt whose transcript path no runtime will open: a NUL byte in a
	 * path is refused before any file is looked for, and a refusal that is not
	 * the absence the reader forgives stops the run as a plain error. Nothing
	 * here has a fault of its own for that, which is what `internal` is.
	 */
	crash(session: string, config: string): Result;
	/** The guard, on a resume of a subagent whose transcript is at `path`. */
	guardOn(session: string, path: string, config: string): Result;
	/**
	 * The guard on a session transcript that cannot be read, which is the
	 * guard's own `internal` fault.
	 */
	guardCrash(session: string, config: string): Result;
}

export function standingRuns(runtime: Runtime): StandingRuns {
	const hook = hookRunner(runtime);
	// Under every threshold, so a run that has nothing to report has nothing to
	// inject either and its silence is the whole of its output.
	const quietly = transcript(assistant(50_000));
	const run = (
		session: string,
		event: string,
		config: string,
		fields: Record<string, unknown> = {},
	) =>
		hook(
			"context-budget",
			{
				hook_event_name: event,
				session_id: session,
				transcript_path: quietly,
				...fields,
			},
			config,
		);
	const guardOn = (session: string, path: string, config: string) =>
		hook(
			"resume-guard",
			{
				hook_event_name: "PreToolUse",
				tool_name: "SendMessage",
				session_id: session,
				tool_input: { to: "big" },
				transcript_path: path,
			},
			config,
		);

	return {
		session: () => sessionId(runtime),
		run,
		prompt: (session, config) => run(session, "UserPromptSubmit", config),
		toolCall: (session, config) => run(session, "PostToolUse", config),
		measured: (session, config) =>
			run(session, "UserPromptSubmit", config, {
				transcript_path: transcript(assistant(200_000)),
			}),
		crash: (session, config) =>
			run(session, "UserPromptSubmit", config, {
				transcript_path: `${quietly}\u0000`,
			}),
		guardOn,
		guardCrash: (session, config) =>
			guardOn(session, unreadableSession("big", [assistant(162_300)]), config),
	};
}
