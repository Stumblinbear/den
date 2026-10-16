// den's two relays, exercised through the launcher, which is the exact command
// `hooks.json` runs. What they assert is the structure of the relay: which
// hand-backs leave a flag, that the prompt delivering a hand-back turns that
// agent's flag into an injection and leaves every other flag, that the file it
// read is gone, and which task notifications and hand-backs carry a reminder
// or a fault of their own.
// The reminder's wording is not a contract; a session reads it, no test does.
//
// Each case is given a temp directory of its own, which is where the relays
// keep their flags, so nothing a case leaves behind reaches the next one.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	dataDir,
	fixtureDir,
	type Result,
	runHook,
	runtimes,
} from "../../../tests/harness.mts";
import { workflowDescription } from "./workflow-harness.mts";

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

interface HookEntry {
	readonly matcher?: string;
	readonly hooks: readonly { readonly command: string }[];
}

/** The PreToolUse matcher `hooks.json` gives the entry that runs `hook`. */
function matcherFor(hook: string): string {
	const config = JSON.parse(
		readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8"),
	) as { hooks: { PreToolUse: HookEntry[] } };
	const entry = config.hooks.PreToolUse.find((candidate) =>
		candidate.hooks.some((h) => h.command.includes(`hooks/${hook}`)),
	);
	assert.ok(entry, `no PreToolUse entry runs ${hook}`);
	return entry.matcher ?? "";
}

// Spelled out rather than imported from the relays, so a relay that starts
// writing its flags somewhere else fails a test instead of taking the tests
// with it.
const REVIEW = "claude-review-triage";
const IMPLEMENTER = "claude-implementer-triage";

interface Injection {
	readonly systemMessage?: string;
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		readonly additionalContext?: string;
	};
}

// Every input carries a session id, since the flags are kept per session, and
// a hand-back carries the lead's; see `reviewTriageDir`.
const SESSION = "session-1";

const handBack = (
	agentType: string,
	agentId: string,
	session = SESSION,
): Record<string, unknown> => ({
	hook_event_name: "PreToolUse",
	session_id: session,
	agent_type: agentType,
	agent_id: agentId,
	tool_name: "SubagentHandback",
	tool_input: { message: "done" },
	transcript_path: "",
});

const prompt = (session = SESSION, text = "carry on") => ({
	hook_event_name: "UserPromptSubmit",
	session_id: session,
	prompt: text,
});

/** The prompt delivering `agentId`'s report, framed as Claude Code 2.1.301 does. */
const report = (agentId: string): string =>
	[
		`<agent-message from="${agentId}">`,
		"[Subagent hand-back] The text below is the final report of a subagent this session delegated to. The report follows:",
		"  done",
		"</agent-message>",
	].join("\n");

/** `text` escaped as Claude Code escapes a task notification's text. */
const escaped = (text: string): string =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** A workflow's task notification as Claude Code 2.1.301 writes it. */
const notification = (status: string, summary: string): string =>
	[
		"<task-notification>",
		"<task-id>wbpkz7z60</task-id>",
		"<tool-use-id>toolu_01</tool-use-id>",
		"<output-file>out.txt</output-file>",
		`<status>${status}</status>`,
		`<summary>${escaped(summary)}</summary>`,
		'<result>{"status":"clean","summary":"<status>failed</status>"}</result>',
	].join("\n");

const REVIEW_AND_FIX = await workflowDescription("review-and-fix-workflow");

/** The flags waiting in one relay's directory, empty until the first one. */
function pending(
	temp: string,
	relay: string,
	session = SESSION,
): readonly string[] {
	try {
		return readdirSync(join(temp, relay, session)).sort();
	} catch {
		return [];
	}
}

/** Asserts that a run injected something into the prompt's turn. */
function injected(result: Result): void {
	assert.equal(result.status, 0, result.stderr);

	const output = JSON.parse(result.stdout) as Injection;

	assert.equal(output.hookSpecificOutput?.hookEventName, "UserPromptSubmit");

	const context = output.hookSpecificOutput?.additionalContext;

	assert.equal(typeof context, "string", result.stdout);
	assert.notEqual(context, "", "the injection is empty");
}

/** Asserts that a run said nothing at all. */
function silent(result: Result): void {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, "");
}

/**
 * Asserts that a run told the user of a fault and put nothing in the lead's
 * context.
 */
function faulted(result: Result): void {
	assert.equal(result.status, 0, result.stderr);

	const output = JSON.parse(result.stdout) as Injection;

	assert.equal(typeof output.systemMessage, "string", result.stdout);
	assert.notEqual(output.systemMessage, "", "the message is empty");
	assert.equal(output.hookSpecificOutput, undefined, result.stdout);
}

for (const runtime of runtimes()) {
	const data = dataDir(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (entry: string, temp: string, input: unknown) =>
		runHook({
			launcher: LAUNCHER,
			data,
			temp,
			argv: [`hooks/${entry}`],
			input,
		});

	test(name("a quality reviewer's hand-back leaves a review flag"), () => {
		const temp = fixtureDir("review-flags");

		silent(
			run(
				"review-triage-flag",
				temp,
				handBack("den:quality-reviewer", "quality-1"),
			),
		);
		assert.deepEqual(pending(temp, REVIEW), ["quality-1.json"]);

		assert.equal(matcherFor("review-triage-flag"), "^SubagentHandback$");

		// The reviewers a review-and-fix run launches report to its script (see
		// `lib/relay.mts`), and an implementer is the other relay's; none of them
		// is flagged here, and neither is a hand-back that names no type.
		for (const type of [
			"den:reviewer",
			"den:closure-verifier",
			"den:implementer",
			"",
		]) {
			silent(run("review-triage-flag", temp, handBack(type, `other-${type}`)));
		}

		assert.deepEqual(pending(temp, REVIEW), ["quality-1.json"]);
	});

	test(name("a flag is announced only in the session that raised it"), () => {
		const temp = fixtureDir("review-sessions");

		run("review-triage-flag", temp, handBack("den:quality-reviewer", "q-1"));
		run(
			"review-triage-flag",
			temp,
			handBack("den:quality-reviewer", "q-2", "session-2"),
		);

		injected(
			run("review-triage-inject", temp, prompt("session-2", report("q-2"))),
		);
		assert.deepEqual(pending(temp, REVIEW), ["q-1.json"]);
		assert.deepEqual(pending(temp, REVIEW, "session-2"), []);

		// Without a session id there is nothing to announce and nothing to keep.
		silent(
			run(
				"review-triage-flag",
				temp,
				handBack("den:quality-reviewer", "q-3", ""),
			),
		);
		// The relay directory holds the two sessions' subdirectories and no file.
		assert.deepEqual(pending(temp, REVIEW, ""), ["session-1", "session-2"]);

		silent(run("review-triage-inject", temp, prompt("", report("q-1"))));
		assert.deepEqual(pending(temp, REVIEW), ["q-1.json"]);
	});

	// A session id is a directory component. `..` would resolve a relay to the
	// temp directory itself, whose every JSON file the drain would then delete
	// and announce as a finished agent.
	test(
		name("a dot-segment session id reaches nothing outside the relay"),
		() => {
			const temp = fixtureDir("review-traversal");
			writeFileSync(join(temp, "victim.json"), "{}");

			silent(run("review-triage-inject", temp, prompt("..", report("victim"))));
			assert.ok(readdirSync(temp).includes("victim.json"));
		},
	);

	test(name("a review's hand-back injects for its own flag, once"), () => {
		const temp = fixtureDir("review-inject");

		run("review-triage-flag", temp, handBack("den:quality-reviewer", "q-1"));
		run("review-triage-flag", temp, handBack("den:quality-reviewer", "q-2"));

		injected(run("review-triage-inject", temp, prompt(SESSION, report("q-1"))));
		assert.deepEqual(pending(temp, REVIEW), ["q-2.json"]);

		// The flag is consumed, so the same report again has nothing to say.
		silent(run("review-triage-inject", temp, prompt(SESSION, report("q-1"))));
	});

	// See the header of `lib/relay.mts` for why a flag hook never fails loudly.
	test(name("a flag hook that cannot write lets the hand-back through"), () => {
		for (const [hook, relay, type] of [
			["review-triage-flag", REVIEW, "den:quality-reviewer"],
			["implementer-triage-flag", IMPLEMENTER, "den:implementer"],
		] as const) {
			const temp = fixtureDir("flag-unwritable");

			// A file where the relay's directory goes, so no flag can be made.
			writeFileSync(join(temp, relay), "");

			silent(run(hook, temp, handBack(type, "blocked-1")));
		}
	});

	test(name("a hand-back that names no sender is told to the user"), () => {
		const temp = fixtureDir("handback-unreadable");
		const anonymous = report("q-1").replace(' from="q-1"', "");

		run("review-triage-flag", temp, handBack("den:quality-reviewer", "q-1"));
		run("implementer-triage-flag", temp, handBack("den:implementer", "q-1"));

		for (const hook of ["review-triage-inject", "implementer-triage-inject"]) {
			faulted(run(hook, temp, prompt(SESSION, anonymous)));
		}

		assert.deepEqual(pending(temp, REVIEW), ["q-1.json"]);
		assert.deepEqual(pending(temp, IMPLEMENTER), ["q-1.json"]);
	});

	// Claude Code puts auto mode's note on a report its classifier blocked,
	// refused or could not review between the sender's line and the hand-back
	// line, indented as the report is (seen on 2.1.284; `SubagentHandback` in
	// 2.1.301 still prepends it).
	test(
		name("a hand-back with a note above its frame injects for its sender"),
		() => {
			const temp = fixtureDir("handback-note");
			const noted = report("opus-1").replace(
				'">\n',
				`">\n  Note: The server-side auto mode classifier (the safety classifier) was unavailable (error) when reviewing this subagent's work.\n`,
			);

			run(
				"implementer-triage-flag",
				temp,
				handBack("den:implementer", "opus-1"),
			);

			injected(run("implementer-triage-inject", temp, prompt(SESSION, noted)));
		},
	);

	test(name("a review-and-fix return carries the in-run reminder"), () => {
		const temp = fixtureDir("review-return");
		const completed = notification(
			"completed",
			`Dynamic workflow "${REVIEW_AND_FIX}" completed`,
		);

		injected(run("review-triage-inject", temp, prompt(SESSION, completed)));

		// The return raised no flag, so nothing is left for the next prompt.
		silent(run("review-triage-inject", temp, prompt()));
	});

	test(name("only a completed review-and-fix run is reminded of"), () => {
		const temp = fixtureDir("review-other-returns");

		// Another workflow's return, and a run that ended without one, are no
		// return to triage and no fault either.
		for (const [status, description] of [
			["completed", "Three blind explorers propose"],
			["failed", REVIEW_AND_FIX],
			["killed", REVIEW_AND_FIX],
		] as const) {
			const text = notification(
				status,
				`Dynamic workflow "${description}" ${status}`,
			);

			silent(run("review-triage-inject", temp, prompt(SESSION, text)));
		}
	});

	test(name("an unreadable review-and-fix return is told to the user"), () => {
		const temp = fixtureDir("review-unreadable");
		const statusless = [
			"<task-notification>",
			`<summary>Dynamic workflow "${REVIEW_AND_FIX}" completed</summary>`,
		].join("\n");
		const reworded = notification(
			"completed",
			`Workflow "${REVIEW_AND_FIX}" finished`,
		);

		for (const text of [statusless, reworded]) {
			faulted(run("review-triage-inject", temp, prompt(SESSION, text)));
		}

		// One that names some other workflow is not this relay's to report.
		const elsewhere = notification("completed", 'Workflow "other" finished');

		silent(run("review-triage-inject", temp, prompt(SESSION, elsewhere)));
	});

	test(name("an implementer's hand-back leaves a flag"), () => {
		const temp = fixtureDir("implementer-flags");

		for (const type of [
			"den:implementer",
			"den:implementer-low",
			"den:implementer-high",
			"den:implementer-haiku",
		]) {
			silent(run("implementer-triage-flag", temp, handBack(type, type)));
		}

		assert.deepEqual(pending(temp, IMPLEMENTER), [
			"den_implementer-haiku.json",
			"den_implementer-high.json",
			"den_implementer-low.json",
			"den_implementer.json",
		]);

		assert.equal(matcherFor("implementer-triage-flag"), "^SubagentHandback$");

		// A fork of the session, and a reviewer, are not implementers here.
		for (const type of ["fork", "den:quality-reviewer"]) {
			silent(run("implementer-triage-flag", temp, handBack(type, "other")));
		}

		assert.equal(pending(temp, IMPLEMENTER).length, 4);
	});

	test(
		name("an implementer's hand-back injects for its own flag, once"),
		() => {
			const temp = fixtureDir("implementer-inject");

			run(
				"implementer-triage-flag",
				temp,
				handBack("den:implementer", "opus-1"),
			);
			run(
				"implementer-triage-flag",
				temp,
				handBack("den:implementer-haiku", "haiku-1"),
			);

			injected(
				run(
					"implementer-triage-inject",
					temp,
					prompt(SESSION, report("opus-1")),
				),
			);
			assert.deepEqual(pending(temp, IMPLEMENTER), ["haiku-1.json"]);

			// The flag is consumed, so the same report again has nothing to say.
			silent(
				run(
					"implementer-triage-inject",
					temp,
					prompt(SESSION, report("opus-1")),
				),
			);
		},
	);

	// A message the user sends while a hand-back waits for the lead's stop (see
	// `lib/relay.mts`) fires UserPromptSubmit first (2.1.301 probe: PreToolUse
	// 20:29:37.628, user prompt 20:29:38.649, hand-back prompt 20:29:42.914).
	test(
		name(
			"a hand-back's reminder arrives with the hand-back, not a prompt before it",
		),
		() => {
			const temp = fixtureDir("implementer-intervening-prompt");

			run(
				"implementer-triage-flag",
				temp,
				handBack("den:implementer", "opus-1"),
			);

			silent(
				run(
					"implementer-triage-inject",
					temp,
					prompt(SESSION, "while you work: one more thing"),
				),
			);
			injected(
				run(
					"implementer-triage-inject",
					temp,
					prompt(SESSION, report("opus-1")),
				),
			);
		},
	);
}
