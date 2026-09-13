// The cache wake: an async Stop hook that keeps an idle session's prompt cache
// warm by posting a short message into the session's own inbox shortly before
// the cache would expire. The session takes one cheap turn on it, reads its
// context back at the cached rate, and the cache lives another lifetime.
//
// This is the run that waits. An async hook's process outlives the turn that
// started it and the session's own exit (probed on Claude Code 2.1.269), so
// the whole idle stretch is waited out here, one process per session: the lock
// beside the session record is what makes it one, and it is held for as long
// as the stretch lasts. What the run does at each check is `lib/wake.mts`.
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { type Address, inboxAddress, post } from "../lib/inbox.mts";
import { SESSION_STATE, WAKE_FAULTS } from "../lib/plugin.mts";
import { loadSettings, type Wake } from "../lib/settings.mts";
import { runEntry } from "../lib/shared/entry.mts";
import { ifPresent } from "../lib/transcript.mts";
import {
	FRESH,
	nextStep,
	type Reading,
	reading,
	type Step,
	type Stretch,
	wakeText,
} from "../lib/wake.mts";

/** The event `hooks.json` registers this entry on, and no other. */
const EVENT = "Stop";

const args = process.argv.slice(2);

/** One check of the transcript, and what the run does about it. */
interface Check {
	readonly reading: Reading;
	readonly step: Step;
}

/**
 * Reads the transcript at `path`, and the step a run holding `stretch` takes
 * on that reading.
 */
function checked(path: string, wake: Wake, stretch: Stretch): Check {
	const read = reading(path);

	return { reading: read, step: nextStep(stretch, read, wake, Date.now()) };
}

/**
 * One check, and null where it threw.
 *
 * @remarks
 * A run that has begun waiting has nobody left to tell: whatever it reported
 * would reach the session on a turn an hour from now, about a conversation
 * that has moved on. A check that fails ends the stretch and nothing else.
 */
function quietly(read: () => Check): Check | null {
	try {
		return read();
	} catch {
		// The transcript was moved, compacted away or taken with the session.
		return null;
	}
}

/**
 * Waits the idle stretch out: read, sleep, post, read again, until `nextStep`
 * says to stop.
 *
 * @remarks
 * A post the inbox refuses ends the stretch, since the session that would have
 * heard it is gone.
 *
 * Only the first check's failure reaches the session. That check runs inside
 * the turn that started this run, where a fault is still about the moment the
 * user is in, and `runEntry` reports it.
 */
async function waited(
	path: string,
	wake: Wake,
	address: Address,
): Promise<void> {
	let stretch = FRESH;
	let check = ifPresent(() => checked(path, wake, stretch));

	while (check !== null && check.step.kind !== "stop") {
		if (check.step.kind === "wait") {
			await sleep(check.step.ms);
		} else if (
			await post(address, wakeText(check.step, check.reading, wake.message))
		) {
			stretch = check.step.stretch;
		} else {
			return;
		}

		check = quietly(() => checked(path, wake, stretch));
	}
}

// The run itself sits last, below every binding it reads: a `const` read from
// here before its own declaration throws a ReferenceError.
await runEntry({ faults: WAKE_FAULTS }, async ({ input, session, event }) => {
	// The session id is what the lock holds the stretch by, and a subagent,
	// which `agent_id` names, has no cache worth an hour of waiting.
	if (event !== EVENT || session === "" || input["agent_id"]) {
		return null;
	}

	const settings = await loadSettings(args);

	if (settings === null || !settings.wake.enabled) {
		return null;
	}

	// biome-ignore lint/style/noProcessEnv: the inbox is not configuration; it is where this session listens, and Claude Code names it in the environment of what it runs and nowhere else.
	const address = inboxAddress(process.env);
	const transcript = input["transcript_path"];

	// A session with no inbox to post to, or no transcript to read, is left to
	// go cold, and silently: nothing here can fix either one.
	if (address === null || typeof transcript !== "string" || transcript === "") {
		return null;
	}

	// One waiter per stretch: a run that cannot take the hold is a later Stop of
	// a session already being waited out. The reply to a wake is one of those
	// Stops, and the waiter that posted it still holds the lock, which is what
	// keeps this run from starting the count over.
	await SESSION_STATE.hold(session, "wake", () =>
		waited(transcript, settings.wake, address),
	);

	// Nothing for the agent. What this run has to say it says by posting; a
	// line injected from here lands on whatever turn the session takes next,
	// hours after the reason for it.
	return null;
});
