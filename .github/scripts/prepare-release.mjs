// Prepares a den release in the working tree: writes the given version into
// plugin.json and moves the changelog's Unreleased entries under a dated
// heading for it. Prints the version on stdout. Makes no git changes; the
// Release workflow commits, tags, and publishes afterwards.
//
//   node prepare-release.mjs --version 1.2.3
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

const PLUGIN = "den";
const REPO_URL = "https://github.com/Stumblinbear/den";
const MANIFEST = "plugins/den/.claude-plugin/plugin.json";
const CHANGELOG = "plugins/den/CHANGELOG.md";

function fail(message) {
  console.error(`prepare-release: ${message}`);
  process.exit(1);
}

function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (!match) fail(`version "${text}" is not MAJOR.MINOR.PATCH`);
  return match.slice(1).map(Number);
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function existingTags() {
  const out = execFileSync("git", ["tag", "--list", `${PLUGIN}--v*`, "--sort=-v:refname"], {
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

// --- arguments -------------------------------------------------------------

const args = process.argv.slice(2);
let next = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--version") next = args[++i];
  else fail(`unexpected argument "${args[i]}"`);
}
if (next === null) fail("pass --version MAJOR.MINOR.PATCH");

// --- version ---------------------------------------------------------------

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const current = parseVersion(manifest.version);
const nextParsed = parseVersion(next);
if (compareVersions(nextParsed, current) < 0) {
  fail(`requested version ${next} is below the current ${manifest.version}`);
}

const lines = readFileSync(CHANGELOG, "utf8").split("\n");
const alreadyPrepared =
  next === manifest.version && lines.some((line) => line.startsWith(`## [${next}]`));
if (alreadyPrepared) {
  process.stdout.write(next + "\n");
  process.exit(0);
}

const tags = existingTags();
const nextTag = `${PLUGIN}--v${next}`;
if (tags.includes(nextTag)) fail(`tag ${nextTag} already exists`);
const previousTag = tags[0] ?? null;

// --- changelog -------------------------------------------------------------

const unreleasedAt = lines.findIndex((line) => /^## \[Unreleased\]/.test(line));
if (unreleasedAt < 0) fail(`${CHANGELOG} has no "## [Unreleased]" heading`);
let sectionEnd = lines.findIndex(
  (line, i) => i > unreleasedAt && (/^## \[/.test(line) || /^\[[^\]]+\]: /.test(line)),
);
if (sectionEnd < 0) sectionEnd = lines.length;
const entries = lines.slice(unreleasedAt + 1, sectionEnd);
if (entries.every((line) => line.trim() === "")) fail("the Unreleased section is empty");

const date = new Date().toISOString().slice(0, 10);
lines.splice(unreleasedAt + 1, 0, "", `## [${next}] - ${date}`);

const unreleasedLink = `[Unreleased]: ${REPO_URL}/compare/${nextTag}...HEAD`;
const versionLink = previousTag
  ? `[${next}]: ${REPO_URL}/compare/${previousTag}...${nextTag}`
  : `[${next}]: ${REPO_URL}/releases/tag/${nextTag}`;
const linkAt = lines.findIndex((line) => line.startsWith("[Unreleased]: "));
if (linkAt >= 0) lines.splice(linkAt, 1, unreleasedLink, versionLink);
else {
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  lines.push("", unreleasedLink, versionLink, "");
}

// --- write -----------------------------------------------------------------

manifest.version = next;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(CHANGELOG, lines.join("\n"));
process.stdout.write(next + "\n");
