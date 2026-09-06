// The recent conversation as a reader that is not pricing it needs: the last
// turns, each cut down to what the user asked, what the assistant said back
// and which tools it called. The watcher's gate reads the newest turn for the
// tool calls that mark a landing point and counts the prompts behind it; the
// judge reads a stretch of them as the conversation it is judging. Neither
// wants tool results, which are most of a transcript's bulk and none of its
// argument.
//
// A turn begins at one of the user's own prompts, the entry `/rewind` would
// list, and runs to the entry before the next one. That is where Claude Code
// ends a turn too, and finding it needs nothing kept between runs.
import { linesBackward } from "./lines-backward.mts";
import { asTyped, eligible } from "./rewind-picker.mts";
import { fieldsOf } from "./shared/fields.mts";
import {
	entryIn,
	isCompaction,
	type ToolUse,
	textIn,
	toolUses,
} from "./transcript.mts";

/** One exchange: a prompt, the replies to it, and the tools they called. */
export interface Turn {
	/**
	 * The uuid of the newest entry in it, which is how a verdict says where it
	 * looked. Empty for a turn whose entries carry none.
	 */
	readonly at: string;
	/** What the user typed, read as `asTyped` reads a prompt. */
	readonly asked: string;
	/** The assistant's text, oldest first, without its tool calls. */
	readonly said: readonly string[];
	/** Every tool call in the turn, oldest first. */
	readonly called: readonly ToolUse[];
}

/** A turn under construction, filled in backward, before it has its prompt. */
interface Building {
	at: string;
	readonly said: string[];
	readonly called: ToolUse[];
}

/**
 * The last `count` turns of the transcript at `path`, oldest first, and fewer
 * where the context holds fewer. The walk stops at a compaction as well, since
 * nothing above one is in the context any more.
 *
 * A turn still in flight, whose prompt has been sent and answered but which no
 * newer prompt has closed, is the last one in the list: the reader is called
 * from a Stop, where that turn is the one that just ended. The oldest turn is
 * left out where the walk ran out of file before its prompt, since half a turn
 * read from its end is not what either reader is asking for.
 *
 * Raises whatever opening the file raised, as `linesBackward` does.
 */
export function recentTurns(path: string, count: number): readonly Turn[] {
	const turns: Turn[] = [];
	let building = opened();

	for (const line of linesBackward(path)) {
		const entry = entryIn(line);

		// A subagent shares the transcript, and its turns are not this
		// conversation.
		if (entry === null || entry["isSidechain"]) {
			continue;
		}

		if (isCompaction(entry)) {
			break;
		}

		if (building.at === "" && typeof entry["uuid"] === "string") {
			building.at = entry["uuid"];
		}

		if (entry["type"] === "assistant") {
			read(building, entry);
		} else if (eligible(entry)) {
			turns.push(closed(building, entry));

			if (turns.length === count) {
				break;
			}

			building = opened();
		}
	}

	return turns.reverse();
}

/** The turn that has just ended, and where it stands in the conversation. */
export interface Latest {
	/** Null where the context holds no whole turn, as a fresh one does not. */
	readonly turn: Turn | null;
	/**
	 * How many of the user's prompts the context holds, this turn's included.
	 * It is what a wait is counted in: it rises by one per prompt however many
	 * times the agent is woken inside that prompt's turn, and it falls back
	 * whenever a compaction or a rewind takes prompts out of the context, which
	 * is how the watcher's state is told that what it holds was judged against
	 * a conversation that is no longer there.
	 */
	readonly count: number;
	/**
	 * What identifies the context that count was taken in: the oldest prompt the
	 * walk reached, or the compaction it stopped at where nothing has been asked
	 * below one yet. A context that only grows keeps the same oldest prompt
	 * however many turns are added to it, and a compaction or a rewind
	 * summarize puts a boundary under everything the session had, so every
	 * prompt of the context that follows is one the context before it never
	 * held. Empty for a transcript with neither in it.
	 */
	readonly context: string;
}

/**
 * The newest turn of the transcript at `path`, and the count above. Only that
 * one turn is built: the walk below it reads nothing out of an entry but
 * whether it is one of the user's prompts, which is what keeps the gate off
 * the cost of the tail the judge is shown.
 *
 * Raises whatever opening the file raised, as `linesBackward` does.
 */
export function latestTurn(path: string): Latest {
	let building: Building | null = opened();
	let turn: Turn | null = null;
	let count = 0;
	// Overwritten by every prompt the walk passes, so it ends on the oldest.
	let context = "";

	for (const line of linesBackward(path)) {
		const entry = entryIn(line);

		if (entry === null || entry["isSidechain"]) {
			continue;
		}

		if (isCompaction(entry)) {
			if (context === "") {
				context = uuidOf(entry);
			}

			break;
		}

		if (building === null) {
			if (eligible(entry)) {
				count += 1;
				context = uuidOf(entry);
			}

			continue;
		}

		if (building.at === "" && typeof entry["uuid"] === "string") {
			building.at = entry["uuid"];
		}

		if (entry["type"] === "assistant") {
			read(building, entry);
		} else if (eligible(entry)) {
			turn = closed(building, entry);
			count += 1;
			context = uuidOf(entry);
			building = null;
		}
	}

	return { turn, count, context };
}

const uuidOf = (entry: Record<string, unknown>): string =>
	String(entry["uuid"] ?? "");

const opened = (): Building => ({ at: "", said: [], called: [] });

/** What an assistant entry adds to the turn it is in: its text and its calls. */
function read(building: Building, entry: Record<string, unknown>): void {
	const text = textIn(fieldsOf(entry["message"])["content"]).trim();

	if (text !== "") {
		building.said.push(text);
	}

	building.called.push(...toolUses(entry));
}

/** The turn as the prompt that opened it closes it, in reading order. */
const closed = (building: Building, prompt: Record<string, unknown>): Turn => ({
	at: building.at === "" ? String(prompt["uuid"] ?? "") : building.at,
	asked: asTyped(textIn(fieldsOf(prompt["message"])["content"])).trim(),
	// Both were pushed newest first, walking backward.
	said: [...building.said].reverse(),
	called: [...building.called].reverse(),
});
