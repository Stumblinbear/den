// The invocation the watcher starts its judge with where the file names no
// `command` of its own, which is what nearly every session runs and the one
// invocation no test that writes a `command` can reach. A command the file
// does name is `watcher-schema.test.mts`: what it is handed, and how its
// answer is read.
//
// The settings are read in process, since the subject is the list the reader
// defaults to rather than anything a run of the entry prints.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANSWER_SCHEMA } from "../lib/answer.mts";
import { DEFAULT_SYSTEM_PROMPT, loadSettings } from "../lib/settings.mts";
import {
	configFile,
	DEFAULTS,
	GUARD,
	GUARD_MESSAGES,
	MESSAGES,
} from "./harness.mts";

// The whole list, because every entry of it bounds a judge that would answer
// without it, and an entry dropped in an edit costs tokens, privacy or the
// answer's shape without showing up in a verdict the rest of the suite reads
// as good. What each entry buys is the doc on `DEFAULT_COMMAND` in
// `settings.mts`.
test("the default command is the whole judge invocation", async () => {
	const path = configFile(DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES);
	const settings = await loadSettings(["--config", path]);

	assert.ok(settings, "the file the case wrote was read");

	const { program, args } = settings.watcher;

	assert.deepEqual(
		[program, ...args],
		[
			"claude",
			"-p",
			"--model",
			"haiku",
			"--tools",
			"",
			"--max-turns",
			"2",
			"--output-format",
			"json",
			"--no-session-persistence",
			"--safe-mode",
			"--system-prompt",
			DEFAULT_SYSTEM_PROMPT,
			"--json-schema",
			ANSWER_SCHEMA,
		],
	);
});
