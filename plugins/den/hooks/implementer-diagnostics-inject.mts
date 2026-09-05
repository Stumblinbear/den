// UserPromptSubmit half of the implementer-diagnostics relay: every flag
// `implementer-diagnostics-flag` left becomes one reminder that the IDE's
// diagnostics are stale, and the files it read are deleted.
import { stdinText } from "../lib/hook-input.mts";
import {
	type Flag,
	IMPLEMENTER_DIAGNOSTICS_DIR,
	inject,
	takeFlags,
	who,
} from "./relay.mts";

function reminder(pending: readonly Flag[]): string {
	const named = who(pending);

	return [
		`${pending.length} implementer agent(s) reported finishing${named ? ` (${named})` : ""}.`,
		"Any rust-analyzer / IDE diagnostics that appeared after their edits are a",
		"stale mid-edit state, NOT findings. Do not run `cargo check` to 'verify'",
		"them, do not narrate a contradiction between the agent's report and the",
		"diagnostics, and do not treat them as a problem to solve. Trust the reported",
		"completion; the real arbiter is a build or test you were already going to",
		"run -- if you are about to run `cargo test`, go straight to it, and only act",
		"on diagnostics that survive that build.",
	].join(" ");
}

// Drained and discarded: nothing in it decides whether to inject, and input
// that will not parse is still input this hook has no reason to fail over.
await stdinText();

const pending = takeFlags(IMPLEMENTER_DIAGNOSTICS_DIR);

if (pending.length > 0) {
	inject(reminder(pending));
}
