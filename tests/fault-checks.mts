// The out-of-band contract a configured plugin's failure policy is: an exit
// code, one line on stderr, and a marker file that silences the rest of the
// session. Everything about it but the plugin's own name and directory is the
// same for every plugin that has one, and a plugin that reads no
// configuration -- den -- has none of it, which is why this is not in the
// harness every plugin's tests import. Importing this registers no test of
// its own.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureDir, type Result } from "./harness.mts";

export interface FaultChecks {
	/**
	 * The plugin copied somewhere `smol-toml` cannot be resolved, so the
	 * dynamic import throws wherever the copy is run from, which is the
	 * `parser` class. The launcher of that copy, for a case to run instead of
	 * the installed one.
	 */
	withoutParser(): string;
	/** Asserts the report, and hands back the line it was made of. */
	reported(result: Result, cls: string): string;
	/** Asserts silence: the session has already been told. */
	quiet(result: Result): void;
}

export function faultChecks(plugin: string, dir: string): FaultChecks {
	return {
		withoutParser: () => withoutParser(dir),
		reported: (result, cls) => reported(result, plugin, cls),
		quiet,
	};
}

// The temp directory is outside any `node_modules`, because Node refuses to
// strip types under one. The copy keeps the plugin's own shape, since that is
// what the launcher resolves an entry against.
function withoutParser(dir: string): string {
	const copy = fixtureDir("no-parser");

	writeFileSync(join(copy, "package.json"), JSON.stringify({ type: "module" }));
	copySources(copy, join(dir, "hooks"), "hooks");
	copySources(copy, join(dir, "lib"), "lib");

	return join(copy, "lib", "launch.mjs");
}

// Read off the directory, so a source added to a plugin is carried into the
// copy without anyone remembering to add it here.
function copySources(dir: string, from: string, name: string): void {
	const into = join(dir, name);

	mkdirSync(into, { recursive: true });

	for (const file of readdirSync(from).filter((f) => /\.m[tj]s$/.test(f))) {
		cpSync(join(from, file), join(into, file));
	}
}

// Exit 1 so Claude Code shows it, one line, naming the plugin and the class.
function reported(result: Result, plugin: string, cls: string): string {
	assert.equal(result.status, 1, "a reported fault exits 1");
	assert.equal(result.stdout, "", "a hook that reports must not also act");
	assert.ok(
		result.stderr.startsWith(`${plugin}: ${cls} error `),
		result.stderr,
	);
	assert.equal(
		result.stderr.split("\n").filter(Boolean).length,
		1,
		"the report is one line",
	);

	return result.stderr;
}

function quiet(result: Result): void {
	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
	assert.equal(result.stdout, "");
}
