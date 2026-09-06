// The out-of-band contract a configured plugin's failure policy is: an exit
// code, one line on stderr, and the class written into the session's record,
// which silences the rest of that session. Everything about it but the
// plugin's own name and directory is the same for every plugin that has one.
// den reads no configuration and has none of it, which is why this is not in
// the harness every plugin's tests import. Importing this registers no test of
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
	/**
	 * Asserts one line per class named, in the field a hook says something to
	 * the user in, and hands back what that field held.
	 */
	recovered(result: Result, ...classes: readonly string[]): string;
}

export function faultChecks(plugin: string, dir: string): FaultChecks {
	return {
		withoutParser: () => withoutParser(dir),
		reported: (result, cls) => reported(result, plugin, cls),
		quiet,
		recovered: (result, ...classes) => recovered(result, plugin, classes),
	};
}

// The temp directory is outside any `node_modules`, because Node refuses to
// strip types under one. The copy keeps the plugin's own shape, since that is
// what the launcher resolves an entry against.
function withoutParser(dir: string): string {
	const copy = fixtureDir("no-parser");

	writeFileSync(join(copy, "package.json"), JSON.stringify({ type: "module" }));
	copySources(copy, dir, "hooks");
	copySources(copy, dir, "lib");
	copySources(copy, dir, join("lib", "shared"));

	return join(copy, "lib", "shared", "launch.mjs");
}

// Read off the directory, so a source added to a plugin is carried into the
// copy without anyone remembering to add it here. One directory at a time
// rather than a recursive copy, so a plugin's `node_modules` is never dragged
// into a fixture whose whole point is that the parser cannot be resolved.
function copySources(dir: string, from: string, name: string): void {
	const source = join(from, name);
	const into = join(dir, name);

	mkdirSync(into, { recursive: true });

	let files: readonly string[];

	try {
		files = readdirSync(source);
	} catch {
		// A directory this plugin does not have is nothing to copy.
		return;
	}

	for (const file of files.filter((f) => /\.m[tj]s$/.test(f))) {
		cpSync(join(source, file), join(into, file));
	}
}

// Exit 1 so Claude Code shows it, one line, naming the plugin and the class.
function reported(result: Result, plugin: string, cls: string): string {
	assert.equal(result.status, 1, "a reported fault exits 1");
	assert.equal(result.stdout, "", "a hook that reports must not also act");
	assert.ok(
		result.stderr.startsWith(`${plugin}: ${cls} error: `),
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

/** What a hook writes when it has something for the user rather than Claude. */
interface Said {
	readonly systemMessage?: unknown;
}

// Exit 0 and the message in the JSON output, since good news is not a hook
// error: stderr from a run that exits 0 reaches nobody but the debug log.
function recovered(
	result: Result,
	plugin: string,
	classes: readonly string[],
): string {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, "", "a recovery is not reported as a failure");

	const output = JSON.parse(result.stdout) as Said;
	const said = String(output.systemMessage ?? "");
	const lines = said.split("\n").filter(Boolean);

	assert.equal(lines.length, classes.length, said);

	for (const [at, cls] of classes.entries()) {
		assert.ok(
			lines[at]?.startsWith(`${plugin}: the ${cls} error is gone`),
			said,
		);
	}

	return said;
}
