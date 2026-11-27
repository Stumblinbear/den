// Autonomy's start hook, its stop script and the hook that runs after a
// compaction, each run through the launcher the way `hooks.json` and the
// autonomy-stop skill's preamble run them, with the temp directory pointed at
// a fixture so the files they write land where the case can see them.
//
// What they assert is what each run leaves: the switch, the log, the path a
// failed stop prints, whether the context gets autonomy's rules, a different
// line, or nothing. The off line's wording is not a contract. A session reads
// it, and no test does.
import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
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
/** Where an internal fault's message asks for a report. An expected failure's message leaves it out. */
const ISSUES = "github.com/stumblinbear/den/issues";
const SESSION = "5e380065-3b50-49b3-b329-aa00f2579153";
const PROMPT = readFileSync(
	join(PLUGIN, "hooks", "autonomy-prompt.md"),
	"utf8",
);

interface HookEntry {
	readonly matcher?: string;
	readonly hooks: readonly { readonly command: string }[];
}

/** The matcher `hooks.json` gives the `event` entry that runs `hook`. */
function matcherFor(event: string, hook: string): string {
	const config = JSON.parse(
		readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8"),
	) as { hooks: Record<string, HookEntry[]> };
	const entry = config.hooks[event]?.find((candidate) =>
		candidate.hooks.some((h) => h.command.includes(`hooks/${hook}`)),
	);

	assert.ok(entry, `no ${event} entry runs ${hook}`);

	return entry.matcher ?? "";
}

const expansion = (command: string, session = SESSION) => ({
	hook_event_name: "UserPromptExpansion",
	session_id: session,
	expansion_type: "slash_command",
	command_name: command,
	command_args: "",
	command_source: "plugin",
	prompt: `/${command}`,
});

const sessionStart = (source: string) => ({
	hook_event_name: "SessionStart",
	session_id: SESSION,
	source,
});

interface Output {
	readonly decision?: string;
	readonly reason?: string;
	readonly systemMessage?: string;
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		readonly additionalContext?: string;
	};
}

/** The context a run added for `event`, asserting that it added some. */
function context(result: Result, event: string): string {
	assert.equal(result.status, 0, result.stderr);

	const output = JSON.parse(result.stdout) as Output;

	assert.equal(output.hookSpecificOutput?.hookEventName, event, result.stdout);

	const text = output.hookSpecificOutput?.additionalContext;

	assert.equal(typeof text, "string", result.stdout);

	return text as string;
}

/** Asserts that a run said nothing at all. */
function silent(result: Result): void {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, "");
}

for (const runtime of runtimes()) {
	const data = dataDir(runtime);
	const run = (temp: string, argv: string[], input: unknown) =>
		runHook({ launcher: LAUNCHER, data, temp, argv, input });
	const start = (temp: string, project: string, input: unknown) =>
		run(temp, ["hooks/autonomy-start", project], input);
	const stop = (temp: string) =>
		run(temp, ["scripts/autonomy", "stop", SESSION], {});
	const afterCompact = (temp: string, source = "compact") =>
		run(temp, ["hooks/autonomy-after-compact"], sessionStart(source));
	const switchFile = (temp: string) =>
		join(temp, "claude-context-budget", `${SESSION}.unattended`);

	test(`[${runtime}] typing the start command adds the rules and a confirmation, writes the switch and removes the earlier log`, () => {
		const temp = fixtureDir("autonomy-temp");
		const project = fixtureDir("autonomy-project");
		const log = join(project, ".local", "autonomy-log.md");

		mkdirSync(join(project, ".local"));
		writeFileSync(log, "an earlier run\n");

		const started = context(
			start(temp, project, expansion("den:autonomy-start")),
			"UserPromptExpansion",
		);

		// The rules, then a line that only the start adds.
		assert.ok(started.startsWith(PROMPT), started);
		assert.ok(started.length > PROMPT.length, started);
		assert.ok(existsSync(switchFile(temp)));
		assert.ok(!existsSync(log));

		assert.equal(
			matcherFor("UserPromptExpansion", "autonomy-start"),
			"^den:autonomy-start$",
		);
	});

	test(`[${runtime}] another command starts nothing`, () => {
		const temp = fixtureDir("autonomy-temp");

		silent(
			start(temp, fixtureDir("autonomy-project"), expansion("den:planning")),
		);
		assert.ok(!existsSync(switchFile(temp)));
		silent(afterCompact(temp));
	});

	test(`[${runtime}] a start for a session ID that could reach another path blocks the command and writes nothing`, () => {
		const temp = fixtureDir("autonomy-temp");
		const result = start(
			temp,
			fixtureDir("autonomy-project"),
			expansion("den:autonomy-start", "../escape"),
		);

		assert.equal(result.status, 0, result.stderr);

		const output = JSON.parse(result.stdout) as Output;

		assert.equal(output.decision, "block", result.stdout);
		assert.equal(output.hookSpecificOutput, undefined, result.stdout);
		assert.ok(!existsSync(join(temp, "escape.unattended")));
		assert.ok(!existsSync(join(temp, "claude-context-budget")));
		assert.ok(!existsSync(join(temp, "claude-den")));
	});

	/** Asserts that a run blocked the command for a cause the user can fix, without asking for a bug report. */
	function blockedForExpectedCause(result: Result): void {
		assert.equal(result.status, 0, result.stderr);

		const output = JSON.parse(result.stdout) as Output;

		assert.equal(output.decision, "block", result.stdout);
		assert.equal(output.hookSpecificOutput, undefined, result.stdout);
		assert.ok(!output.reason?.includes(ISSUES), result.stdout);
	}

	test(`[${runtime}] a start with an unwritable temp directory blocks the command without asking for a bug report`, () => {
		const temp = join(fixtureDir("autonomy-temp"), "a-file");

		writeFileSync(temp, "");

		blockedForExpectedCause(
			start(
				temp,
				fixtureDir("autonomy-project"),
				expansion("den:autonomy-start"),
			),
		);
	});

	test(`[${runtime}] a start with no project directory blocks the command without asking for a bug report`, () => {
		const temp = fixtureDir("autonomy-temp");

		blockedForExpectedCause(start(temp, "", expansion("den:autonomy-start")));
		assert.ok(!existsSync(switchFile(temp)));
	});

	test(`[${runtime}] stop prints nothing and removes the switch`, () => {
		const temp = fixtureDir("autonomy-temp");

		start(
			temp,
			fixtureDir("autonomy-project"),
			expansion("den:autonomy-start"),
		);
		silent(stop(temp));
		assert.ok(!existsSync(switchFile(temp)));
	});

	test(`[${runtime}] a stop that cannot remove the switch turns autonomy off and says the switch is left`, () => {
		const temp = fixtureDir("autonomy-temp");

		start(
			temp,
			fixtureDir("autonomy-project"),
			expansion("den:autonomy-start"),
		);

		// A non-empty directory at the switch's path, so removing the switch fails.
		rmSync(switchFile(temp));
		mkdirSync(switchFile(temp));
		writeFileSync(join(switchFile(temp), "x"), "");

		const stopped = stop(temp);

		assert.equal(stopped.status, 0, stopped.stderr);
		assert.ok(stopped.stdout.includes(switchFile(temp)), stopped.stdout);
		assert.notEqual(context(afterCompact(temp), "SessionStart"), PROMPT);
	});

	test(`[${runtime}] a second start that fails leaves the switch standing exactly when autonomy is on`, () => {
		const temp = fixtureDir("autonomy-temp");
		const project = fixtureDir("autonomy-project");

		start(temp, project, expansion("den:autonomy-start"));

		// A non-empty directory at the log's path, so removing the log fails.
		const log = join(project, ".local", "autonomy-log.md");

		mkdirSync(log, { recursive: true });
		writeFileSync(join(log, "x"), "");

		blockedForExpectedCause(
			start(temp, project, expansion("den:autonomy-start")),
		);

		assert.equal(
			existsSync(switchFile(temp)),
			context(afterCompact(temp), "SessionStart") === PROMPT,
			"the switch and autonomy's state disagree",
		);
	});

	test(`[${runtime}] a failed first start leaves a switch another plugin wrote`, () => {
		const temp = fixtureDir("autonomy-temp");
		const project = fixtureDir("autonomy-project");

		// Another plugin's switch, in a session that never used autonomy.
		mkdirSync(join(temp, "claude-context-budget"), { recursive: true });
		writeFileSync(switchFile(temp), "");

		// A non-empty directory at the log's path, so removing the log fails.
		const log = join(project, ".local", "autonomy-log.md");

		mkdirSync(log, { recursive: true });
		writeFileSync(join(log, "x"), "");

		blockedForExpectedCause(
			start(temp, project, expansion("den:autonomy-start")),
		);

		assert.ok(
			existsSync(switchFile(temp)),
			"the failed start removed the switch",
		);
	});

	test(`[${runtime}] a failed first start in a session with no switch leaves no switch`, () => {
		const temp = fixtureDir("autonomy-temp");
		const project = fixtureDir("autonomy-project");

		// A non-empty directory at the log's path, so removing the log fails.
		const log = join(project, ".local", "autonomy-log.md");

		mkdirSync(log, { recursive: true });
		writeFileSync(join(log, "x"), "");

		blockedForExpectedCause(
			start(temp, project, expansion("den:autonomy-start")),
		);

		assert.ok(
			!existsSync(switchFile(temp)),
			"the failed start left its switch",
		);
	});

	test(`[${runtime}] after a compaction the rules come back without the confirmation while autonomy is on, a different line while it is off, and nothing in a session that never used it`, () => {
		const temp = fixtureDir("autonomy-temp");

		silent(afterCompact(temp));

		start(
			temp,
			fixtureDir("autonomy-project"),
			expansion("den:autonomy-start"),
		);

		assert.equal(context(afterCompact(temp), "SessionStart"), PROMPT);

		silent(stop(temp));

		const off = context(afterCompact(temp), "SessionStart");

		assert.notEqual(off, "", "the off line is empty");
		assert.notEqual(off, PROMPT);

		assert.equal(
			matcherFor("SessionStart", "autonomy-after-compact"),
			"compact",
		);
	});

	test(`[${runtime}] a resumed session is told nothing, whatever autonomy's state`, () => {
		const temp = fixtureDir("autonomy-temp");

		start(
			temp,
			fixtureDir("autonomy-project"),
			expansion("den:autonomy-start"),
		);
		silent(afterCompact(temp, "resume"));
	});
}
