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
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MARKETPLACE = "den";

// Installed by Claude Code from the plugin's lockfile, and never part of the
// checkout's copy.
const KEPT = "node_modules";

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

for (const path of files(target)) {
	if (!existsSync(join(source, path))) {
		rmSync(join(target, path));
	}
}

cpSync(source, target, {
	recursive: true,
	filter: (path) => path !== join(source, KEPT),
});

process.stdout.write(`${plugin} refreshed at ${target}; run /reload-plugins\n`);

function files(dir: string): string[] {
	const found: string[] = [];

	for (const name of readdirSync(dir)) {
		if (name === KEPT) {
			continue;
		}

		const path = join(dir, name);

		if (statSync(path).isDirectory()) {
			found.push(...files(path).map((child) => join(name, child)));
		} else {
			found.push(name);
		}
	}

	return found;
}
