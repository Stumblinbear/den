// The out-of-band contract a configured plugin's failure policy is: one line
// on the field Claude Code hands the agent, addressed to the event the run was
// called for, and a run that ends the way a run with nothing to say ends.
// Everything about it but the plugin's own name and directory is the same for
// every plugin that has one. den reads no configuration and has none of it,
// which is why this is not in the harness every plugin's tests import.
// Importing this registers no test of its own.
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
	/** Asserts the report, and hands back the text it was made of. */
	reported(result: Result, cls: string): string;
	/** Asserts silence: this run had nothing to say. */
	quiet(result: Result): void;
	/** The event a report was addressed to, which is what carries it. */
	addressedTo(result: Result): string;
}

export function faultChecks(plugin: string, dir: string): FaultChecks {
	return {
		withoutParser: () => withoutParser(dir),
		reported: (result, cls) => reported(result, plugin, cls),
		quiet,
		addressedTo: (result) => String(carried(result).hookEventName ?? ""),
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

/** What a hook writes when it has something for the agent. */
interface Injection {
	readonly hookEventName?: unknown;
	readonly additionalContext?: unknown;
}

// Exit 0 and one JSON object, since a hook that fails is one Claude Code folds
// away: stderr and the exit code reach the debug log and nobody else.
function reported(result: Result, plugin: string, cls: string): string {
	const said = String(carried(result).additionalContext ?? "");

	assert.ok(said.startsWith(`${plugin}: ${cls} error: `), said);
	assert.equal(
		said.split("\n").length,
		1,
		`the report is one line: ${JSON.stringify(said)}`,
	);
	assert.ok(
		said.includes("Put it to them in your next reply"),
		`the agent is told to pass it on: ${said}`,
	);

	return said;
}

/** The `hookSpecificOutput` of a run, which is the whole of what it wrote. */
function carried(result: Result): Injection {
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, "", "a report is not a hook failure");

	const output = JSON.parse(result.stdout) as {
		readonly hookSpecificOutput?: Injection;
	};

	return output.hookSpecificOutput ?? {};
}

function quiet(result: Result): void {
	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
	assert.equal(result.stdout, "");
}
