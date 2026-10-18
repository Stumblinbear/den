// Refreshes the installed copy of one plugin from this checkout. Claude Code
// installs a plugin as a version-keyed copy under its cache, `update` does
// nothing while the version stands, and `uninstall` deletes the plugin's data
// directory with the user's configuration in it. Copying over the cached
// files is the refresh that keeps both; `/reload-plugins` then reads them.
//
//   node scripts/plugin-refresh.mts <plugin>
import {
	cpSync,
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKETPLACE = "den";

/**
 * Whether the refresh leaves `path` in the installed copy as it is.
 *
 * @remarks
 * `path` is relative to the plugin root. Only the root `node_modules` is
 * kept, since Claude Code installs it from the plugin's lockfile.
 */
function isKept(path: string): boolean {
	return path === "node_modules";
}

const plugin = process.argv[2];

if (plugin === undefined || plugin === "") {
	process.stderr.write("usage: node scripts/plugin-refresh.mts <plugin>\n");
	process.exit(2);
}

const source = join(ROOT, "plugins", plugin);

if (!existsSync(join(source, ".claude-plugin", "plugin.json"))) {
	process.stderr.write(`${plugin}: no plugin at ${source}
`);
	process.exit(1);
}

// Claude Code's own record of what is installed and where. The manifest's
// version is not the installed one whenever the checkout has bumped it ahead
// of a release, so the registry is what names the directory to refresh.
const registry = join(
	homedir(),
	".claude",
	"plugins",
	"installed_plugins.json",
);
const installs: unknown = existsSync(registry)
	? JSON.parse(readFileSync(registry, "utf8")).plugins?.[
			`${plugin}@${MARKETPLACE}`
		]
	: undefined;
const target = Array.isArray(installs)
	? installs
			.map((install) => String(install?.installPath ?? ""))
			.find((path) => path !== "")
	: undefined;

if (target === undefined || !existsSync(target)) {
	process.stderr.write(
		`${plugin}: not installed from the ${MARKETPLACE} marketplace; install it once with \`claude plugin install ${plugin}@${MARKETPLACE}\`
`,
	);
	process.exit(1);
}

// The checkout's listing keeps each name's case, so it decides what is stale:
// `existsSync` on a case-insensitive filesystem finds `skills/Foo` after a
// rename to `skills/foo`, and the installed `Foo` would keep its old name.
const checkoutPaths = new Set(entries(source));

for (const path of entries(target)) {
	const installed = join(target, path);
	const checkout = join(source, path);

	// Removing a stale directory removes the entries listed after it. An entry
	// that is a file on one side and a directory on the other goes too, since
	// `cpSync` refuses to copy either kind over the other.
	if (
		existsSync(installed) &&
		(!checkoutPaths.has(path) ||
			statSync(installed).isDirectory() !== statSync(checkout).isDirectory())
	) {
		rmSync(installed, { recursive: true });
	}
}

cpSync(source, target, {
	recursive: true,
	filter: (path) => !isKept(relative(source, path)),
});

process.stdout.write(`${plugin} refreshed at ${target}; run /reload-plugins\n`);

/**
 * Every file and directory below `dir`, as a path relative to `root`, leaving
 * out each path {@link isKept} keeps and everything under it.
 *
 * @remarks
 * `dir` is relative to `root`. A directory comes before its contents.
 */
function entries(root: string, dir = ""): string[] {
	const found: string[] = [];

	for (const name of readdirSync(join(root, dir))) {
		const path = join(dir, name);

		if (isKept(path)) {
			continue;
		}

		found.push(path);

		if (statSync(join(root, path)).isDirectory()) {
			found.push(...entries(root, path));
		}
	}

	return found;
}
