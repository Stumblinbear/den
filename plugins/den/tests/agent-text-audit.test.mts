// The reminder on an edit to text an agent follows, exercised through the
// launcher, which is the exact command `hooks.json` runs. What it asserts is
// which paths are that text: the hook has nothing else to decide, and a path
// is written differently on every platform the plugin runs on. The reminder's
// wording is not a contract; a session reads it, no test does.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

interface Injection {
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		readonly additionalContext?: string;
	};
}

const edit = (path: string, tool = "Edit"): Record<string, unknown> => ({
	hook_event_name: "PreToolUse",
	session_id: "session-1",
	tool_name: tool,
	tool_input: { file_path: path },
});

/** The PreToolUse matcher `hooks.json` gives the hook. */
function matcher(): string {
	const config = JSON.parse(
		readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8"),
	) as {
		hooks: {
			PreToolUse: { matcher?: string; hooks: { command: string }[] }[];
		};
	};
	const entry = config.hooks.PreToolUse.find((candidate) =>
		candidate.hooks.some((hook) =>
			hook.command.includes("hooks/agent-text-audit"),
		),
	);

	assert.ok(entry, "no PreToolUse entry runs agent-text-audit");

	return entry.matcher ?? "";
}

function reminder(result: Result): string {
	assert.equal(result.status, 0, result.stderr);

	const output = JSON.parse(result.stdout) as Injection;

	assert.equal(output.hookSpecificOutput?.hookEventName, "PreToolUse");

	const context = output.hookSpecificOutput?.additionalContext;

	assert.equal(typeof context, "string", result.stdout);

	return String(context);
}

function silent(result: Result): void {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, "");
}

for (const runtime of runtimes()) {
	const data = dataDir(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (input: unknown) =>
		runHook({
			launcher: LAUNCHER,
			data,
			temp: fixtureDir("agent-text-audit"),
			argv: ["hooks/agent-text-audit"],
			input,
		});

	test(
		name("a skill, an agent definition, a hook and a rules file carry it"),
		() => {
			for (const path of [
				"/home/dev/den/plugins/den/skills/lead/SKILL.md",
				"/home/dev/den/plugins/den/agents/reviewer.md",
				"/home/dev/den/plugins/context-budget/hooks/hooks.json",
				"/home/dev/den/plugins/den/skills/lead/references/routes.md",
				// A tree that holds no plugin keeps the same text in the same
				// directories, and a rules file sits wherever its scope starts.
				"/home/dev/project/.claude/agents/surveyor.md",
				"/home/dev/project/CLAUDE.md",
				"/home/dev/project/crates/world/CLAUDE.md",
				// A Windows path reaches the hook with separators of its own.
				"D:\\den\\plugins\\den\\skills\\lead\\SKILL.md",
			]) {
				assert.ok(reminder(run(edit(path))).length > 0, path);
			}

			// A Write of a new skill is the same edit.
			assert.ok(
				reminder(
					run(edit("/home/dev/project/.claude/skills/run/SKILL.md", "Write")),
				).length > 0,
			);
		},
	);

	test(name("code and prose elsewhere say nothing"), () => {
		for (const path of [
			"/home/dev/project/src/main.rs",
			"/home/dev/den/plugins/den/lib/relay.mts",
			"/home/dev/den/tests/harness.mts",
			// A name is not a segment: the directories are what carry the text.
			"/home/dev/project/docs/agents.md",
			"/home/dev/project/docs/CLAUDE-notes.md",
		]) {
			silent(run(edit(path)));
		}
	});

	test(name("a call naming no file says nothing"), () => {
		silent(run({ hook_event_name: "PreToolUse", tool_name: "Edit" }));
		silent(
			run({
				hook_event_name: "PreToolUse",
				tool_name: "Edit",
				tool_input: "not a table",
			}),
		);
	});

	test(name("the matcher, not the hook, keeps other tools out"), () => {
		assert.equal(matcher(), "^(Edit|Write)$");
	});
}
