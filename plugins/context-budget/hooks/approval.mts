// The user's consent to a resume, taken from the session transcript rather
// than from anything the agent says about it, and spent once.
import { readFileSync } from "node:fs";
import { fieldsOf } from "../lib/fields.mts";
import { updateRecord } from "./session-record.mts";
import { ifPresent, newestFirst } from "./transcript.mts";

const ANSWERED = /^Your questions have been answered:/;

/**
 * The uuid of the user's latest AskUserQuestion answer choosing the option
 * labeled "Resume", or null. A human prompt after an answer supersedes it, and
 * a transcript that is not there reads as null too: the guard then denies a
 * resume the user may well have approved somewhere it cannot see, which is the
 * safe way round.
 *
 * One answer approves one resume, whichever agent Claude then messages, since
 * the question Claude asked named it.
 */
export function resumeApproval(transcript: string): string | null {
	const text = ifPresent(() => readFileSync(transcript, "utf8"));

	if (text === null) {
		return null;
	}

	for (const entry of newestFirst(text.split("\n"))) {
		if (entry["type"] !== "user" || entry["isMeta"]) {
			continue;
		}

		const content = fieldsOf(entry["message"])["content"];

		if (typeof content === "string") {
			return null;
		}

		if (!Array.isArray(content)) {
			continue;
		}

		const chose = choseResume(content);

		if (chose !== null) {
			return chose ? String(entry["uuid"] ?? "") : null;
		}
	}

	return null;
}

/**
 * True the first time an answer is spent. The user approves each resume, not
 * just the first, so an answer already spent denies the attempt after it.
 */
export function consume(sessionId: string, uuid: string): boolean {
	const spent = updateRecord(sessionId, (record) =>
		record.consumed.includes(uuid)
			? { record: null, result: false }
			: {
					record: { ...record, consumed: [...record.consumed, uuid] },
					result: true,
				},
	);

	// A run that could not take the lock cannot mark the answer spent, so the
	// answer stays fresh and this resume goes ahead on it: the guard denying a
	// resume the user has answered for is worse than the one answer buying a
	// second resume, which is all an unmarked answer costs.
	return spent.held ? spent.result : true;
}

/** Null when the entry carries no answer at all, so the walk goes on past it. */
function choseResume(content: readonly unknown[]): boolean | null {
	for (const block of content) {
		const fields = fieldsOf(block);

		if (fields["type"] !== "tool_result") {
			continue;
		}

		const text = typeof fields["content"] === "string" ? fields["content"] : "";

		if (!ANSWERED.test(text)) {
			continue;
		}

		for (const [, , answer] of text.matchAll(/"([^"]*)"="([^"]*)"/g)) {
			if (/^resume\b/i.test(String(answer).trim())) {
				return true;
			}
		}

		return false;
	}

	return null;
}
