// The launcher every plugin carries: the Node version floor on its own, since
// nothing else can reach it, and spawns proving it starts an entry under the
// interpreter it was asked for and prints its refusal on stderr when it
// cannot, so a hook run it cannot make fails visibly instead of doing nothing.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	cpSync,
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
import { selectRuntime } from "../lib/select-runtime.mjs";
import { fixtureDir, LIB, runtimes } from "./harness.mts";

// Windows spells it `Path`, so the variable to drop is matched, not named.
const PATH_VARIABLE = /^path$/i;

const LAUNCHER = join(LIB, "launch.mjs");

const RUNTIME_FILE = join("fixture-data", ".runtime");

// An entry whose one type annotation is proof the interpreter stripped types,
// and whose output is proof the launcher forwarded the arguments after the
// entry name.
const ENTRY = `import process from "node:process";

const said: string = process.argv[2] ?? "nothing";

process.stdout.write(said);
`;

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
test("an empty data directory is refused, not run with", () => {
	const result = spawnSync(
		process.execPath,
		[LAUNCHER, "--data", "", "some-entry"],
		{ input: "{}", encoding: "utf8" },
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
		[LAUNCHER, "--data", data, "some-entry"],
		{ input: "{}", encoding: "utf8", env },
	);

	assert.equal(result.status, 1);
	assert.equal(result.stdout, "");
	assert.equal(
		result.stderr,
		`some-entry: ${join(data, ".runtime")} says bun, but no bun was found on PATH.\n`,
	);
});

// The entry is named relative to the plugin directory and lives outside the
// launcher's own, which is how `hooks.json` spells it. And a plugin directory
// can be reached through a link, such as a config directory kept in a dotfiles
// repository: Node resolves the module URL to the real path but leaves
// `process.argv[1]` as spelled, so the two disagree here, and a run reached
// this way still has to happen.
for (const runtime of runtimes()) {
	test(`${runtime}: an entry under the plugin runs, through a link`, (t) => {
		const plugin = fixtureDir(`plugin-${runtime}`);
		const dir = mkdtempSync(join(tmpdir(), "launcher-linked-"));
		const link = join(dir, "plugin");

		t.after(() => {
			// The link points at the fixture plugin; it goes first, on its own, so
			// the recursive removal never has it in reach.
			rmSync(link, { force: true });
			rmSync(dir, { recursive: true, force: true });
		});

		mkdirSync(join(plugin, "lib", "shared"), { recursive: true });
		mkdirSync(join(plugin, "hooks"));

		for (const file of ["launch.mjs", "select-runtime.mjs"]) {
			cpSync(join(LIB, file), join(plugin, "lib", "shared", file));
		}

		writeFileSync(join(plugin, "hooks", "echo.mts"), ENTRY);

		const data = join(dir, "data");

		mkdirSync(data);
		writeFileSync(join(data, ".runtime"), `${runtime}\n`);
		symlinkSync(plugin, link, "junction");

		const result = spawnSync(
			process.execPath,
			[
				join(link, "lib", "shared", "launch.mjs"),
				"--data",
				data,
				"hooks/echo",
				"THROUGH A LINK",
			],
			{ input: "{}", encoding: "utf8" },
		);

		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, "THROUGH A LINK");
	});
}
