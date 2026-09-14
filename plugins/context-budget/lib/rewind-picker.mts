// The user's own prompts in a transcript, and what the user typed in them:
// `eligible` says whether an entry is one, `asTyped` recovers the typed text,
// and `opening` cuts it short enough to quote in a sentence.
//
// No field of a transcript entry marks a prompt as the user's. The rules here
// follow the `/rewind` picker, which lists exactly those prompts, and are kept
// in step with its own.
import { fieldsOf, isTable } from "./shared/fields.mts";
import { textIn, withoutReminders } from "./transcript.mts";

// Long enough to tell one prompt from its neighbours, short enough to quote
// inside a sentence.
const OPENING_CHARS = 72;

/**
 * The tags of the wrapper forms the picker refuses to list: what a local
 * command or a bash prompt printed, a finished subagent's notification, and
 * the periodic tick. A slash command's `command-name` is not among them, since
 * the picker lists a slash command as the user's prompt; `/compact` alone is
 * refused, in `worthOffering`.
 */
const WRAPPED: readonly string[] = [
	"local-command-stdout",
	"local-command-stderr",
	"bash-stdout",
	"bash-stderr",
	"task-notification",
	"tick",
];

/**
 * Markers the harness writes in the user's place: an interrupt, a refused tool
 * call, a turn it wants no reply to. They are stored as user entries with
 * none of the flags above, and the picker recognises them by their text alone,
 * which is the only thing that can: no prompt anyone types is one of these.
 */
const MARKERS: ReadonlySet<string> = new Set([
	"[Request interrupted by user]",
	"[Request interrupted by user for tool use]",
	"[Tool call did not complete: the turn was ended to deliver the message that follows. Nothing refused it; re-run it if still needed.]",
	"[Tool call skipped: the turn ended to deliver the message that follows before this call ran. Nothing refused it; re-run it if still needed.]",
	"The user doesn't want to take this action right now. STOP what you are doing and wait for the user to tell you how to proceed.",
	"No response requested.",
]);

const inner = (text: string, tag: string): string | null =>
	text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? null;

/**
 * Whether the picker would offer this entry, and whether it is worth offering:
 * a user turn that is not a tool result, not a harness-generated record, and
 * either has no origin or has a human one.
 */
export function eligible(entry: Record<string, unknown>): boolean {
	if (entry["type"] !== "user") {
		return false;
	}

	const content = fieldsOf(entry["message"])["content"];

	if (
		Array.isArray(content) &&
		fieldsOf(content[0])["type"] === "tool_result"
	) {
		return false;
	}

	if (
		entry["isMeta"] ||
		entry["isCompactSummary"] ||
		entry["isVisibleInTranscriptOnly"] ||
		entry["stackedExpansion"]
	) {
		return false;
	}

	const origin = entry["origin"];

	if (isTable(origin) && origin["kind"] !== "human") {
		return false;
	}

	return worthOffering(textIn(content).trim());
}

function worthOffering(text: string): boolean {
	if (
		text === "" ||
		MARKERS.has(text) ||
		text.startsWith("<teammate-message ")
	) {
		return false;
	}

	// The compaction's own command. The harness stores it after the boundary it
	// caused, stamped from before it, so a backward read meets it as the first
	// prompt of the new context. Counted, it would give a context holding only
	// the summary a turn nobody asked for, which the watcher would judge and
	// whose stamp the wake would take for the newest real turn.
	if (inner(text, "command-name")?.trim() === "/compact") {
		return false;
	}

	return !WRAPPED.some((tag) => text.includes(`<${tag}>`));
}

/**
 * A prompt as the user typed it and the `/rewind` picker lists it, rather than
 * as the transcript stores it: a slash command as its name and arguments
 * without the XML around them, and any other prompt without the system
 * reminders the harness put in front of it.
 */
export function asTyped(text: string): string {
	const command = inner(text, "command-name");

	return command
		? `${command} ${inner(text, "command-args") ?? ""}`
		: withoutReminders(text);
}

/**
 * A prompt's opening words, short enough to quote inside a sentence.
 *
 * @remarks
 * The text comes back on one line, whole where it fits, and otherwise cut at a
 * word where one falls late enough and ended with `...`.
 */
export function opening(text: string): string {
	const line = text.replace(/\s+/g, " ").trim();

	if (line.length <= OPENING_CHARS) {
		return line;
	}

	const cut = line.slice(0, OPENING_CHARS);
	const space = cut.lastIndexOf(" ");
	const kept = space > OPENING_CHARS / 2 ? cut.slice(0, space) : cut;

	// Trailing punctuation before the ellipsis reads as a typo ("forwards....").
	return `${kept.replace(/[\s.,;:!?-]+$/, "")}...`;
}
