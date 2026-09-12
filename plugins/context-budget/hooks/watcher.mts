// The Stop hook, registered async: past the notice threshold it asks a small
// model whether the arc of work the session is in has just ended, and hands
// what comes back to the session as advice it may decline.
//
// Claude Code gives an async hook's `additionalContext` to the model on the
// next conversation turn, which is the first moment after this one that the
// session can hear anything.
import process from "node:process";
import { argValue } from "../lib/args.mts";
import {
	type Answer,
	askJudge,
	JUDGE_DEAD_MS,
	judgePrompt,
} from "../lib/judge.mts";
import { measure } from "../lib/measure.mts";
import { WATCHER_FAULTS } from "../lib/plugin.mts";
import { latestTurn, recentTurns, type Turn } from "../lib/recent-turns.mts";
import { opening } from "../lib/rewind-picker.mts";
import { updateRecord } from "../lib/session-record.mts";
import {
	loadSettings,
	type Settings,
	thresholdsFor,
	type Watcher,
} from "../lib/settings.mts";
import { injected, runEntry } from "../lib/shared/entry.mts";
import { ifPresent } from "../lib/transcript.mts";
import {
	consults,
	type Judged,
	landed,
	rungAt,
	settled,
	standing,
	watched,
} from "../lib/watcher.mts";

/** The event `hooks.json` registers this entry on, and no other. */
const EVENT = "Stop";

const args = process.argv.slice(2);

/** The turn that has just ended, on a rung the judge is consulted on. */
interface Ended extends Judged {
	/** The turn itself, which the advice quotes the user's prompt from. */
	readonly newest: Turn;
}

/**
 * The turn as the gate reads it, and null where there is nothing to gate: a
 * transcript with no turn in it, a compaction newer than any turn, a model
 * with no thresholds to be past, or a rung the judge is never consulted on.
 * The turn is read only past that last check, since the walk it takes is the
 * dearest thing this hook does on a quiet session.
 */
function ended(transcript: string, settings: Settings): Ended | null {
	const measured = measure(transcript);

	if (measured === null || measured.kind !== "turn") {
		return null;
	}

	const limits = thresholdsFor(settings, measured.model);

	if (limits === null) {
		return null;
	}

	const rung = rungAt(measured.tokens, limits);

	if (!watched(rung)) {
		return null;
	}

	const latest = latestTurn(transcript);

	return latest.turn === null
		? null
		: {
				rung,
				count: latest.count,
				context: latest.context,
				landing: landed(latest.turn),
				newest: latest.turn,
			};
}

/**
 * The turn's count written into the record, a verdict dropped where it has
 * stopped standing, and the in-flight marker claimed where the judge is to be
 * consulted. True says this run holds that marker and is to make the call.
 *
 * All of it is one change under the lock, because the gate is read out of the
 * record and the claim is written back into it: two Stops of one session that
 * each read before either wrote would both call the judge.
 */
function claimed(session: string, turn: Ended): boolean {
	const claim = updateRecord(session, (before) => {
		const now = Date.now();
		const state = standing(before.watcher, turn);
		const judging = consults(state, turn, now, JUDGE_DEAD_MS);

		return {
			fields: {
				watcher: {
					...state,
					turn: turn.count,
					context: turn.context,
					startedAt: judging ? now : state.startedAt,
				},
			},
			result: judging,
		};
	});

	// A run that could not take the lock changes nothing and calls nothing: the
	// next Stop reads a record no worse than this one left it.
	return claim.held && claim.result;
}

/**
 * The judge's answer written back, and the marker released whatever it says. A
 * run that could not take the lock here loses the answer and leaves the marker
 * standing, which the next Stop past the marker's own age reads as a run that
 * died and starts again from.
 */
function answered(session: string, turn: Ended, answer: Answer): void {
	updateRecord(session, (before) => ({
		fields: { watcher: settled(before.watcher, turn, answer) },
		result: null,
	}));
}

/**
 * Whether the answer was the session's to hear. A call runs for as long as
 * minutes, and a compaction or a rewind inside one leaves both the answer and
 * the wait it would book about a conversation that is gone: the marker is
 * released, nothing else is written, and the next Stop starts over from the
 * context there now. A transcript no longer at the path it was named at is
 * read as gone, which is what it is.
 */
function recorded(
	session: string,
	transcript: string,
	turn: Ended,
	answer: Answer,
): boolean {
	if (ifPresent(() => latestTurn(transcript).context) !== turn.context) {
		released(session);

		return false;
	}

	answered(session, turn, answer);

	return true;
}

/** The marker released, on a turn the judge was never asked anything. */
function released(session: string): void {
	updateRecord(session, (before) => ({
		fields: { watcher: { ...before.watcher, startedAt: 0 } },
		result: null,
	}));
}

/**
 * The judge's prompt for this turn, and null where the transcript has left the
 * path it was named at by the time this reads it.
 */
function prompted(transcript: string, watcher: Watcher): string | null {
	return ifPresent(() =>
		judgePrompt(recentTurns(transcript, watcher.tailTurns), watcher.tailTokens),
	);
}

/**
 * What an ended arc is owed: the cut priced through the `cut-point` skill, and
 * that answer put to the user with any command in a fenced block of its own,
 * where a recommendation buried in a paragraph goes unread.
 *
 * The line carries all of it, since it reaches the session many turns after
 * any skill was loaded. Asking again is part of that: a verdict stands until
 * the context leaves the rung it was judged on, so nothing consults the judge
 * again about a cut the user has not answered.
 */
const RELAY = [
	"Invoke the `context-budget:cut-point` skill and give the user its answer in",
	"your next reply: where it names a cut, one sentence with the command in a",
	"fenced block on its own line at the end; where it comes to carrying on, say",
	"that and give no command. If the work in hand should finish first, say so",
	"beside it and raise it again at each later pause, read afresh from the",
	"skill, until the user runs a cut or says they want none.",
].join(" ");

/**
 * What the session is told: the turn the arc was judged after, the judge's own
 * sentence for what ended, and what that is owed.
 */
const advice = (
	answer: Extract<Answer, { kind: "good" }>,
	where: string,
): string =>
	[
		`Context watcher: after the turn that began "${where}", the arc looked over: ${answer.reason}.`,
		RELAY,
	].join(" ");

// The run itself, last in the file and below every binding it reads: a `const`
// read from here before its own declaration throws a ReferenceError.
await runEntry(
	{ faults: WATCHER_FAULTS },
	async ({ input, session, event }) => {
		// Without a session id there is no record to pace the judge by.
		if (event !== EVENT || session === "") {
			return null;
		}

		const settings = await loadSettings(args);

		// A subagent, which its input names, is short-lived and cannot compact.
		if (settings === null || !settings.watcher.enabled || input["agent_id"]) {
			return null;
		}

		const transcript = input["transcript_path"];

		if (typeof transcript !== "string" || transcript === "") {
			return null;
		}

		const watcher = settings.watcher;
		// A moved transcript is silence, and every other read failure stops the
		// run: a bug in the reader passing for a quiet turn would make a watcher
		// that reads nothing look like one with nothing to say.
		const turn = ifPresent(() => ended(transcript, settings));

		if (turn === null || !claimed(session, turn)) {
			return null;
		}

		const prompt = prompted(transcript, watcher);

		if (prompt === null) {
			released(session);

			return null;
		}

		const answer = askJudge(watcher, prompt);
		const kept = recorded(session, transcript, turn, answer);

		// Thrown on every consult, because a judge that failed this turn fails
		// the next one too, and the session is owed the reason its watcher has
		// gone quiet. An answer the session kept books a wait against the same
		// command, which is what paces the repeat. The fix names the command
		// rather than the failure: a mistyped word and a model refusing the call
		// are both answered by editing that key or by switching the watcher off.
		if (answer.kind === "fault") {
			throw WATCHER_FAULTS.fault(
				"internal",
				answer.detail,
				`change \`[watcher] command\` in ${argValue(args, "--config") ?? ""}, or switch the watcher off with \`[watcher] enabled = false\``,
			);
		}

		return kept && answer.kind === "good"
			? injected(event, advice(answer, opening(turn.newest.asked)))
			: null;
	},
);
