// What a hook is handed on stdin.
import process from "node:process";
import { isTable } from "./fields.mts";

/**
 * The input's fields, or null for anything that is not a JSON object. Text
 * that will not parse is on the same footing as text that parses to something
 * else: a hook is handed whatever is written on its stdin, and neither of
 * those is something it can act on, or fail over.
 */
export async function hookInput(): Promise<Record<string, unknown> | null> {
	const text = await stdinText();

	let parsed: unknown;

	try {
		parsed = JSON.parse(text || "{}");
	} catch {
		return null;
	}

	return isTable(parsed) ? parsed : null;
}

/**
 * Stdin, read to the end and left as it arrived. What an entry that decides
 * nothing from its input still has to do: a hook that leaves its stdin unread
 * can stall whatever is writing it, and input that is not JSON is not its
 * business to fail over.
 */
export function stdinText(): Promise<string> {
	return new Promise((done) => {
		let data = "";

		// Decoded as one stream rather than a chunk at a time: a multibyte
		// character split across two reads is otherwise two replacements.
		process.stdin.setEncoding("utf8");

		process.stdin.on("data", (chunk) => {
			data += String(chunk);
		});

		process.stdin.on("end", () => {
			done(data);
		});
	});
}
