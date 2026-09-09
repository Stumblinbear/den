// What the handoff-cost skill's preamble runs: the reading of the current
// context priced for a fork, a model switch and a brief. Run on demand rather
// than fed from a file, so the reading is never older than the moment the
// skill was invoked.
//
// Arguments: `--session <id>`, and `--target <model>` for the switch row,
// which defaults to opus.
import process from "node:process";
import { measuredFrom, reading, unknown } from "../lib/handoff.mts";
import { recordedTranscript } from "../lib/session-record.mts";
import { newestTurn, tailEntries } from "../lib/transcript.mts";

function argument(name: string): string {
	const at = process.argv.indexOf(name);
	const value = at === -1 ? undefined : process.argv[at + 1];

	return value === undefined || value.startsWith("--") ? "" : value.trim();
}

function state() {
	const session = argument("--session");
	const transcript = session === "" ? null : recordedTranscript(session);

	if (transcript === null) {
		return unknown(
			"no transcript is recorded for this session yet; a prompt submitted while den is enabled records it",
		);
	}

	const entries = tailEntries(transcript);

	return entries === null
		? unknown("the recorded transcript is not there")
		: measuredFrom(newestTurn(entries));
}

process.stdout.write(`${reading(state(), argument("--target"))}\n`);
