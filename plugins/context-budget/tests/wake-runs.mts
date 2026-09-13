// What the cache-wake cases share: an inbox the case reads the wire off, the
// configuration that puts a wake one second away, the Stop a case runs, and
// the idling session it reads. Importing this registers no test of its own.
//
// Every case runs the real entry through the launcher, since what is under
// test is a run that waits, posts and reads the transcript again. The clock
// knob is the 5m row's lead: a lead one second short of the lifetime makes a
// wake fall due a second after the turn the fixture wrote, and the bound on a
// wait is that same second, so a case waits seconds where a session waits
// minutes and nothing about the decision is faked.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type { Result, Runtime, Started } from "../../../tests/harness.mts";
import { agentLaunch, taskNotification } from "./background-fixtures.mts";
import { assistant, at, crossSessionMessage, prompt } from "./fixtures.mts";
import {
	appendTranscript,
	configFile,
	hookRunner,
	hookStarter,
	sessionId,
	transcript,
	USABLE,
} from "./harness.mts";
import { type Inbox, inbox } from "./inbox-fixture.mts";

/**
 * A wake section of `times` wakes over the five-minute lifetime, each due a
 * second after the turn it is measured from, with a body carrying all three
 * placeholders, so a case sees which numbers were substituted into it.
 */
const wakeSection = (times: number): string =>
	[
		"[wake]",
		"[wake.'5m']",
		`times = ${times}`,
		'before = "4m59s"',
		"[wake.messages]",
		'wake = "Say how the {pending} still running are going, wake {n} of {times}."',
		"",
	].join("\n");

/** What a case that is not about the count runs on: two wakes, then stop. */
export const WAKE = wakeSection(2);

/** More wakes than a case will spend, for one about what else ends a run. */
export const WAKE_UNSPENT = wakeSection(5);

/** The same, switched off outright. */
export const WAKE_OFF = "[wake]\nenabled = false\n";

/** The same, with no row for the lifetime the session is on. */
export const ROW_OFF = "[wake]\n[wake.'5m']\nenabled = false\n";

/**
 * The environment of a session with no inbox: empty, since the harness takes
 * the two inbox variables out of every child it spawns and what a case names
 * here is only what it puts back.
 */
export const NO_INBOX: Readonly<Record<string, string>> = {};

/** The background work the fixture session is waiting on. */
export const TASKS = ["agent-survey", "agent-review"];

/**
 * What a case changes about one Stop: what Claude Code wrote, or where the
 * session listens.
 */
export interface Over {
	/** Merged over the Stop input, for a case about what the input names. */
	readonly input?: Record<string, unknown>;
	/** In place of the inbox variables, for a case about a session with none. */
	readonly env?: Readonly<Record<string, string>>;
}

/** The runs a wake case makes, under one runtime. */
export interface WakeRuns {
	/** The session's inbox, and everything that has reached it. */
	readonly inbox: Inbox;
	/** A session id nothing else in this run has used. */
	session(): string;
	/** One Stop, waited out: what a case that expects no wake at all runs. */
	stop(id: string, path: string, over?: Over): Result;
	/** One Stop left running, which is how Claude Code starts an async hook. */
	start(id: string, path: string): Started;
	/**
	 * Rewrites the configuration the runs read, with `section` as its wake
	 * settings: the user editing the file while a run is waiting.
	 */
	reconfigure(section: string): void;
	/** Stops listening. A case that opened one closes it. */
	close(): Promise<void>;
}

/**
 * An inbox open and a configuration written, for the cache-wake cases of one
 * runtime. `section` is the `[wake]` table the runs are made under.
 */
export async function wakeRuns(
	runtime: Runtime,
	section: string = WAKE,
): Promise<WakeRuns> {
	const listening = await inbox();
	const hook = hookRunner(runtime);
	const starter = hookStarter(runtime);
	const config = configFile(USABLE, section);
	const call = (id: string, path: string, over: Over = {}) => ({
		input: {
			hook_event_name: "Stop",
			session_id: id,
			transcript_path: path,
			...over.input,
		},
		options: { env: over.env ?? listening.env },
	});

	return {
		inbox: listening,
		session: () => sessionId(runtime),
		stop: (id, path, over) => {
			const run = call(id, path, over);

			return hook("wake", run.input, config, run.options);
		},
		start: (id, path) => {
			const run = call(id, path);

			return starter("wake", run.input, config, run.options);
		},
		reconfigure: (section) =>
			writeFileSync(config, [USABLE, section].join("\n")),
		close: () => listening.close(),
	};
}

/** How the fixture session stands when the wake's Stop arrives. */
export interface Idle {
	/** The work still in the background; none is a session waiting on nothing. */
	readonly tasks?: readonly string[];
	/**
	 * How long ago the newest turn was taken. Past the five minutes that turn
	 * was billed under, the cache is already cold.
	 */
	readonly minutesAgo?: number;
}

/**
 * A session that ended its turn with `tasks` still running, its newest turn
 * billed on the five-minute lifetime.
 */
export const idling = ({ tasks = TASKS, minutesAgo = 0 }: Idle = {}): string =>
	transcript(
		prompt("Launch the surveys and tell me when they land", at(30)),
		...tasks.map((id) => agentLaunch(id, at(29))),
		assistant(120_000, { minutesAgo, ttl: "5m" }),
	);

/**
 * Appends the turn a woken session takes to the transcript the run is reading:
 * the wake as Claude Code records a delivered message, and the reply it drew.
 * The reply refreshes the cache, and the message itself is no turn of the
 * user's, which is what keeps the wake count rising rather than starting over.
 */
export const woken = (path: string, line: string): void => {
	appendTranscript(
		path,
		crossSessionMessage(line, at(0)),
		assistant(120_000, { ttl: "5m" }),
	);
};

/**
 * Appends the notifications that end the fixture's background work, which is
 * what a waiting run stops on while the session is still idle.
 */
export const finished = (path: string): void => {
	appendTranscript(path, ...TASKS.map((id) => taskNotification(id, at(0))));
};

/**
 * How long a run is given to end once what it was waiting on is over: its own
 * last check, and the moment it takes to write what it has. A run still going
 * after that is a run that is not ending, and it would sit there for the whole
 * of the cache's lifetime, so the wait is bounded here.
 */
const ENDS_WITHIN_MS = 5_000;

/** A run's result, and a named failure for one still going at the bound. */
export async function endedWithin(run: Started, what: string): Promise<Result> {
	const bound = new Promise<null>((resolve) => {
		setTimeout(() => resolve(null), ENDS_WITHIN_MS).unref();
	});
	const result = await Promise.race([run.ended(), bound]);

	// A run that lost the race waits the fixture's whole five minutes out, and
	// this file's own process stays up on its pipes for as long. Killing it is
	// what gets the failure below reported at the bound.
	if (result === null) {
		run.kill();
	}

	assert.ok(result, `${what} was still running ${ENDS_WITHIN_MS}ms later`);

	return result;
}
