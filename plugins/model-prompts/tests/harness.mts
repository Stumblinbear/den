// The fixture the hook test files run on: where the plugin's files are, the
// exact command `hooks.json` runs, throwaway files for a case to point it at,
// and a session id per test with whatever state it leaves behind removed with
// it. Importing this registers no test of its own.
//
// Every case runs once per runtime the machine has: Node always, bun when it
// answers a version probe, since the two strip types differently and only
// running both proves the sources are the syntax they both accept.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";

export type Runtime = "node" | "bun";

export interface Result {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

export interface RunOptions {
	/** A copy of the hook somewhere it is broken; the installed one by default. */
	readonly launcher?: string;
	/** A home whose settings.json the run is meant to read. */
	readonly home?: string;
}

export const HOOKS = join(
	fileURLToPath(new URL(".", import.meta.url)),
	"..",
	"hooks",
);
export const LAUNCHER = join(HOOKS, "launch.mjs");

// Spelled out rather than imported from the hook, so a hook that starts
// writing its state somewhere else fails a test instead of taking the tests
// with it.
export const STATE_DIR = join(tmpdir(), "claude-model-prompts");

const FIXTURES = mkdtempSync(join(tmpdir(), "model-prompts-test-"));

process.on("exit", () => {
	rmSync(FIXTURES, { recursive: true, force: true });
});

// A home with no settings.json, so a test that does not mean to exercise the
// SessionStart fallback cannot accidentally pick up the real one.
const BARE_HOME = join(FIXTURES, "bare-home");

mkdirSync(BARE_HOME, { recursive: true });

let seq = 0;

/** A number nothing else in this process has used, for a unique fixture name. */
function next(): number {
	seq += 1;

	return seq;
}

/** A fresh directory to write a case's own files into. */
export function fixtureDir(prefix: string): string {
	const dir = join(FIXTURES, `${prefix}-${next()}`);

	mkdirSync(dir, { recursive: true });

	return dir;
}

export function configFile(contents: string): string {
	const path = join(FIXTURES, `config-${next()}.toml`);

	writeFileSync(path, contents);

	return path;
}

/** A home whose settings.json names a model, for the session start fallback. */
export function homeNaming(model: string): string {
	const home = fixtureDir("home");

	mkdirSync(join(home, ".claude"), { recursive: true });
	writeFileSync(
		join(home, ".claude", "settings.json"),
		JSON.stringify({ model }),
	);

	return home;
}

/**
 * The runtimes to run every case under. Called by each test file rather than
 * read off an import, since a machine without bun is told so in the file's own
 * report: a green run there must not read as bun having passed.
 */
export function runtimes(): readonly Runtime[] {
	if (spawnSync("bun", ["--version"], { stdio: "ignore" }).status === 0) {
		return ["node", "bun"];
	}

	test("the bun leg is skipped: bun did not answer a version probe", {
		skip: true,
	}, () => {
		// Nothing to run; the skipped name is the whole point.
	});

	return ["node"];
}

/**
 * Runs the hook as `hooks.json` does, under one runtime: the launcher reads
 * which interpreter a leg is about from `.runtime` in the data directory it is
 * given.
 */
export function hookRunner(
	runtime: Runtime,
): (
	input: Record<string, unknown>,
	config: string,
	options?: RunOptions,
) => Result {
	const data = join(FIXTURES, `data-${runtime}`);

	mkdirSync(data, { recursive: true });
	writeFileSync(join(data, ".runtime"), `${runtime}\n`);

	return (input, config, options = {}) => {
		const home = options.home ?? BARE_HOME;
		const result = spawnSync(
			process.execPath,
			[
				options.launcher ?? LAUNCHER,
				"--data",
				data,
				"model-prompts",
				"--config",
				config,
			],
			{
				input: JSON.stringify(input),
				encoding: "utf8",
				env: {
					// biome-ignore lint/style/noProcessEnv: the child needs PATH to find its interpreter.
					...process.env,
					HOME: home,
					USERPROFILE: home,
				},
			},
		);

		return {
			status: result.status,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	};
}

/**
 * A per-test session id, with the record and the once-per-session markers it
 * leaves behind removed with it. Ids differ per runtime leg too, so the two
 * legs cannot see each other's state.
 */
export function sessionId(t: TestContext, runtime: Runtime): string {
	const id = `model-prompts-test-${process.pid}-${runtime}-${next()}`;

	t.after(() => {
		for (const suffix of ["json", "parser", "config"]) {
			rmSync(join(STATE_DIR, `${id}.${suffix}`), { force: true });
		}
	});

	return id;
}
