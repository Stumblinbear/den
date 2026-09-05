// Prepares one plugin's release in the working tree: writes the given version
// into its plugin.json and moves its changelog's Unreleased entries under a
// dated heading for it. Prints the version on stdout. Makes no git changes; the
// Release workflow commits, tags, and publishes afterwards.
//
//   node --experimental-strip-types prepare-release.mts --plugin den --version 1.2.3
//
// The plugin names a directory under plugins/, and is also the tag prefix:
// every plugin in this repository is versioned and tagged on its own.
//
// Exits non-zero, touching nothing, when the Unreleased section is empty, the
// requested version is below the current one, or its tag already exists.
//
// Resumes rather than fails when --version names the version already in
// plugin.json and the changelog already has that version's section: a prior
// run committed the bump but failed before tagging or publishing, so the
// working tree is already the release and only the later steps remain.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const REPO_URL = "https://github.com/Stumblinbear/den";

type Version = readonly [number, number, number];

const fail: (message: string) => never = (message) => {
	process.stderr.write(`prepare-release: ${message}\n`);
	process.exit(1);
};

function parseVersion(text: unknown): Version {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(text));

	if (match === null) {
		fail(`version "${String(text)}" is not MAJOR.MINOR.PATCH`);
	}

	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

const compareVersions = (a: Version, b: Version): number =>
	a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function existingTags(plugin: string): readonly string[] {
	const out = execFileSync(
		"git",
		["tag", "--list", `${plugin}--v*`, "--sort=-v:refname"],
		{ encoding: "utf8" },
	);

	return out.split("\n").filter(Boolean);
}

const args = process.argv.slice(2);

let plugin: string | null = null;
let next: string | null = null;

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--plugin") {
		i += 1;
		plugin = args[i] ?? null;
	} else if (args[i] === "--version") {
		i += 1;
		next = args[i] ?? null;
	} else {
		fail(`unexpected argument "${String(args[i])}"`);
	}
}

if (plugin === null) {
	fail("pass --plugin NAME");
}

if (!/^[A-Za-z0-9._-]+$/.test(plugin)) {
	fail(`plugin "${plugin}" is not a directory name`);
}

if (next === null) {
	fail("pass --version MAJOR.MINOR.PATCH");
}

const MANIFEST = `plugins/${plugin}/.claude-plugin/plugin.json`;
const CHANGELOG = `plugins/${plugin}/CHANGELOG.md`;

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<
	string,
	unknown
>;
const current = parseVersion(manifest["version"]);

if (compareVersions(parseVersion(next), current) < 0) {
	fail(
		`requested version ${next} is below the current ${String(manifest["version"])}`,
	);
}

const lines = readFileSync(CHANGELOG, "utf8").split("\n");
const alreadyPrepared =
	next === manifest["version"] &&
	lines.some((line) => line.startsWith(`## [${next}]`));

if (alreadyPrepared) {
	process.stdout.write(`${next}\n`);
	process.exit(0);
}

const tags = existingTags(plugin);
const nextTag = `${plugin}--v${next}`;

if (tags.includes(nextTag)) {
	fail(`tag ${nextTag} already exists`);
}

const previousTag = tags[0] ?? null;

const unreleasedAt = lines.findIndex((line) => /^## \[Unreleased\]/.test(line));

if (unreleasedAt < 0) {
	fail(`${CHANGELOG} has no "## [Unreleased]" heading`);
}

let sectionEnd = lines.findIndex(
	(line, i) =>
		i > unreleasedAt && (/^## \[/.test(line) || /^\[[^\]]+\]: /.test(line)),
);

if (sectionEnd < 0) {
	sectionEnd = lines.length;
}

if (
	lines.slice(unreleasedAt + 1, sectionEnd).every((line) => line.trim() === "")
) {
	fail("the Unreleased section is empty");
}

const date = new Date().toISOString().slice(0, 10);

lines.splice(unreleasedAt + 1, 0, "", `## [${next}] - ${date}`);

const unreleasedLink = `[Unreleased]: ${REPO_URL}/compare/${nextTag}...HEAD`;
const versionLink = previousTag
	? `[${next}]: ${REPO_URL}/compare/${previousTag}...${nextTag}`
	: `[${next}]: ${REPO_URL}/releases/tag/${nextTag}`;
const linkAt = lines.findIndex((line) => line.startsWith("[Unreleased]: "));

if (linkAt >= 0) {
	lines.splice(linkAt, 1, unreleasedLink, versionLink);
} else {
	while (lines.length > 0 && (lines[lines.length - 1] ?? "").trim() === "") {
		lines.pop();
	}

	lines.push("", unreleasedLink, versionLink, "");
}

manifest["version"] = next;
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, "\t")}\n`);
writeFileSync(CHANGELOG, lines.join("\n"));
process.stdout.write(`${next}\n`);
