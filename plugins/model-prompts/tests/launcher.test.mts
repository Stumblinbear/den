// The runtime selector: the Node version floor on its own, since nothing else
// can reach it -- the harness legs run the launcher under each interpreter --
// and spawns proving the launcher prints its refusal on stderr and exits
// non-zero, so a hook run it cannot make fails visibly instead of doing
// nothing.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { selectRuntime } from "../hooks/select-runtime.mjs";
import { HOOKS, LAUNCHER, STATE_DIR } from "./harness.mts";

// Windows spells it `Path`, so the variable to drop is matched, not named.
const PATH_VARIABLE = /^path$/i;

const RUNTIME_FILE = join("fixture-data", ".runtime");

const CASES: ReadonlyArray<{
	readonly what: string;
	readonly requested: string;
	readonly bunFound: boolean;
	readonly node: string;
	readonly kind: "bun" | "node" | "error";
}> = [
	{
		what: "node asked for, below the type-stripping floor",
		requested: "node",
		bunFound: true,
		node: "22.5.1",
		kind: "error",
	},
	{
		what: "node asked for, exactly at the floor",
		requested: "node",
		bunFound: false,
		node: "22.6.0",
		kind: "node",
	},
	{
		// A minor compared as text puts "10" below "6", which is every Node
		// release from 22.10 on.
		what: "node asked for, a minor above the floor that sorts below it",
		requested: "node",
		bunFound: false,
		node: "22.10.0",
		kind: "node",
	},
];

for (const one of CASES) {
	test(`selectRuntime: ${one.what} -> ${one.kind}`, () => {
		const selected = selectRuntime(
			one.requested,
			one.bunFound,
			one.node,
			RUNTIME_FILE,
		);

		assert.equal(selected.kind, one.kind);
	});
}

// `hooks.json` writes `--data "${CLAUDE_PLUGIN_DATA}"`, which is an empty
// argument on a host that does not set the variable. Every path built from it
// is then wrong, so the run has to stop rather than quietly look elsewhere.
test("an empty data directory is refused, not run with", (t) => {
	const dir = mkdtempSync(join(tmpdir(), "launcher-empty-data-"));
	const session = `launcher-test-${process.pid}-empty-data`;

	t.after(() => {
		rmSync(dir, { recursive: true, force: true });
		rmSync(join(STATE_DIR, `${session}.json`), { force: true });
	});

	const config = join(dir, "config.toml");

	writeFileSync(config, "[models.'opus-5\\b']\nprompt = \"OPUS\"\n");

	const result = spawnSync(
		process.execPath,
		[LAUNCHER, "--data", "", "model-prompts", "--config", config],
		{
			input: JSON.stringify({
				session_id: session,
				hook_event_name: "SessionStart",
				session_start_reason: "startup",
				model: "claude-opus-5",
			}),
			encoding: "utf8",
		},
	);

	assert.equal(result.stdout, "");
	assert.equal(result.status, 1);
	assert.equal(
		result.stderr.split("\n").filter(Boolean).length,
		1,
		result.stderr,
	);
});

test("a forced runtime that is not there fails the hook run with one line", (t) => {
	// A PATH with nothing on it, rather than no PATH at all: on Windows a child
	// spawned without one still searches the parent's, and bun would be found.
	const empty = mkdtempSync(join(tmpdir(), "launcher-test-"));

	t.after(() => {
		rmSync(empty, { recursive: true, force: true });
	});

	const data = join(empty, "data");

	mkdirSync(data, { recursive: true });
	writeFileSync(join(data, ".runtime"), "bun\n");

	const env: Record<string, string> = {};

	// biome-ignore lint/style/noProcessEnv: the child inherits everything but a usable PATH.
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined && !PATH_VARIABLE.test(key)) {
			env[key] = value;
		}
	}

	env["PATH"] = empty;

	const result = spawnSync(
		process.execPath,
		[LAUNCHER, "--data", data, "model-prompts"],
		{ input: "{}", encoding: "utf8", env },
	);

	assert.equal(result.status, 1);
	assert.equal(result.stdout, "");
	assert.equal(
		result.stderr,
		`model-prompts: ${join(data, ".runtime")} says bun, but no bun was found on PATH.\n`,
	);
});

// A plugin directory can be reached through a link, such as a config directory
// kept in a dotfiles repository. Node resolves the module URL to the real path
// but leaves `process.argv[1]` as spelled, so the two disagree here, and a hook
// run reached this way still has to happen.
test("the hook runs when the launcher is reached through a link", (t) => {
	const dir = mkdtempSync(join(tmpdir(), "launcher-linked-"));
	const session = `launcher-test-${process.pid}-linked`;
	const link = join(dir, "hooks");

	t.after(() => {
		// The link points at the real hook sources; it goes first, on its own, so
		// the recursive removal never has it in reach.
		rmSync(link, { force: true });
		rmSync(dir, { recursive: true, force: true });
		rmSync(join(STATE_DIR, `${session}.json`), { force: true });
	});

	const data = join(dir, "data");
	const config = join(dir, "config.toml");

	symlinkSync(HOOKS, link, "junction");
	mkdirSync(data);
	writeFileSync(join(data, ".runtime"), "node\n");
	writeFileSync(config, "[models.'opus-5\\b']\nprompt = \"THROUGH A LINK\"\n");

	const result = spawnSync(
		process.execPath,
		[
			join(link, "launch.mjs"),
			"--data",
			data,
			"model-prompts",
			"--config",
			config,
		],
		{
			input: JSON.stringify({
				session_id: session,
				hook_event_name: "SessionStart",
				session_start_reason: "startup",
				model: "claude-opus-5",
			}),
			encoding: "utf8",
		},
	);

	assert.equal(result.status, 0, result.stderr);
	assert.ok(result.stdout.includes("THROUGH A LINK"), result.stdout);
});
