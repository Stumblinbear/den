// Copies the shared library sources into every plugin, and checks the
// committed copies still match them. Claude Code caches and installs each
// plugin on its own, so a plugin can import nothing from outside its own
// directory: the shared source lives here once and is duplicated on purpose.
//
//   node scripts/plugin-lib.mts            copy
//   node scripts/plugin-lib.mts --check    list what drifted and exit non-zero
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(ROOT, "lib");
const PLUGIN_DIR = join(ROOT, "plugins");

// Every plugin starts its entries through the launcher and reads what Claude
// Code writes on their stdin, so every plugin takes those. The rest belongs to
// a plugin that reads a TOML configuration: den reads none, so it declares no
// dependency and ships no lockfile for Claude Code to install from, and the
// loader's parser import would resolve to nothing there.
//
// A plugin takes a shared source when what it runs imports it, directly or
// through another shared source: every write of a session record takes a lock,
// so `file-lock.mts` comes with `session-state.mts`.
const EVERY_PLUGIN: readonly string[] = [
	"fields.mts",
	"hook-input.mts",
	"launch.mjs",
	"select-runtime.mjs",
];
const CONFIGURED: readonly string[] = [
	...EVERY_PLUGIN,
	"config.mts",
	"entry.mts",
	"fault.mts",
	"file-lock.mts",
	"run.mts",
	"session-state.mts",
	"standing.mts",
];

interface Plugin {
	readonly name: string;
	readonly files: readonly string[];
}

const PLUGINS: readonly Plugin[] = [
	{ name: "context-budget", files: CONFIGURED },
	{ name: "den", files: EVERY_PLUGIN },
	{ name: "model-prompts", files: CONFIGURED },
];

const sources = (): readonly string[] =>
	readdirSync(LIB)
		.filter((file) => /\.m[tj]s$/.test(file))
		.sort();

const source = (file: string): string => readFileSync(join(LIB, file), "utf8");

/**
 * The copies sit in `lib/shared/` rather than in `lib/` itself, so that a
 * plugin's own modules have `lib/` to live in and nothing here has to tell the
 * two apart by name.
 */
const libOf = (plugin: Plugin): string =>
	join(PLUGIN_DIR, plugin.name, "lib", "shared");

const copyOf = (plugin: Plugin, file: string): string =>
	join(libOf(plugin), file);

/** Paths are reported from the repository root, the way they are committed. */
const named = (path: string): string =>
	relative(ROOT, path).replaceAll("\\", "/");

const contents = (path: string): string | null => {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
};

/** Every copy that does not match its source, in the words of the fix for it. */
function drift(): readonly string[] {
	const problems: string[] = [...unassigned(), ...unlisted()];

	for (const plugin of PLUGINS) {
		for (const file of plugin.files) {
			const path = copyOf(plugin, file);
			const copy = contents(path);

			if (copy === null) {
				problems.push(`${named(path)} is missing`);
			} else if (copy !== source(file)) {
				problems.push(`${named(path)} differs from lib/${file}`);
			}
		}

		problems.push(...strays(plugin));
	}

	return problems;
}

/**
 * Anything in a plugin's `lib/shared/` this script did not put there: a source
 * withdrawn from that plugin and left behind, or a file nobody meant to
 * commit. Read off the directory, since a copy of nothing has no source here
 * to notice it by. Only that directory: `lib/` beside it is the plugin's own,
 * and nothing here has any opinion about what a plugin keeps in it.
 */
function strays(plugin: Plugin): readonly string[] {
	let entries: readonly string[];

	try {
		entries = readdirSync(libOf(plugin));
	} catch {
		// No directory at all, which the missing copies above already say.
		return [];
	}

	return entries
		.filter((file) => !plugin.files.includes(file))
		.map((file) =>
			sources().includes(file)
				? `${named(copyOf(plugin, file))} is a copy of lib/${file}, which ${plugin.name} is not given`
				: `${named(copyOf(plugin, file))} is not a shared source`,
		);
}

/** A shared source nobody receives is one nobody's hooks can reach. */
const unassigned = (): readonly string[] =>
	sources()
		.filter((file) => !PLUGINS.some((plugin) => plugin.files.includes(file)))
		.map((file) => `lib/${file} is listed for no plugin`);

/** A plugin this script does not know about silently gets nothing. */
const unlisted = (): readonly string[] =>
	readdirSync(PLUGIN_DIR, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				!PLUGINS.some((plugin) => plugin.name === entry.name),
		)
		.map((entry) => `plugins/${entry.name} is not listed in this script`);

function copy(): void {
	for (const plugin of PLUGINS) {
		// A plugin listed here for the first time has no `lib/shared/` yet, and
		// the copies are what puts one there.
		mkdirSync(libOf(plugin), { recursive: true });

		for (const file of plugin.files) {
			const path = copyOf(plugin, file);
			const text = source(file);

			if (contents(path) !== text) {
				writeFileSync(path, text);
				process.stdout.write(`plugin-lib: wrote ${named(path)}\n`);
			}
		}
	}
}

function check(): void {
	const problems = drift();

	if (problems.length === 0) {
		return;
	}

	for (const problem of problems) {
		process.stderr.write(`plugin-lib: ${problem}\n`);
	}

	process.stderr.write(
		"plugin-lib: run `npm run plugin-lib` and commit the result, then delete anything it did not write\n",
	);
	process.exitCode = 1;
}

const args = process.argv.slice(2);

if (args.length === 0) {
	copy();
} else if (args.length === 1 && args[0] === "--check") {
	check();
} else {
	process.stderr.write("plugin-lib: usage: plugin-lib.mts [--check]\n");
	process.exitCode = 1;
}
