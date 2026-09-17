// Writes the effort variants of den's implementer, and checks the committed
// variants still match it. An agent definition sets one effort level and has
// nothing to include a shared body from, so the body lives once in
// `implementer.md` and each variant is that file with its name and its effort
// changed.
//
//   node scripts/agent-variants.mts            write
//   node scripts/agent-variants.mts --check    list what drifted and exit non-zero
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS = join(ROOT, "plugins", "den", "agents");

const SOURCE = "implementer";
const SOURCE_EFFORT = "medium";
const VARIANT_EFFORTS: readonly string[] = ["low", "high"];

// The haiku implementer shares the prefix and none of the body: it is written
// by hand, for another model and another kind of work.
const HAND_WRITTEN: readonly string[] = ["haiku"];

/** Paths are reported from the repository root, the way they are committed. */
const named = (path: string): string =>
	relative(ROOT, path).replaceAll("\\", "/");

const pathOf = (agent: string): string => join(AGENTS, `${agent}.md`);

const contents = (path: string): string | null => {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
};

/**
 * `text` with its one occurrence of `from` replaced. A source that stopped
 * carrying a line a variant changes would otherwise produce a variant that
 * silently kept the source's value.
 */
function swap(text: string, from: string, to: string): string {
	const parts = text.split(from);

	if (parts.length !== 2) {
		throw new Error(
			`${named(pathOf(SOURCE))} holds ${parts.length - 1} of ${JSON.stringify(from)}, and a variant needs exactly one`,
		);
	}

	return parts.join(to);
}

function variant(source: string, effort: string): string {
	const renamed = swap(
		source,
		`\nname: ${SOURCE}\n`,
		`\nname: ${SOURCE}-${effort}\n`,
	);
	const pinned = swap(
		renamed,
		`\neffort: ${SOURCE_EFFORT}\n`,
		`\neffort: ${effort}\n`,
	);

	return swap(
		pinned,
		` at ${SOURCE_EFFORT} effort.\n`,
		` at ${effort} effort.\n`,
	);
}

function source(): string {
	const text = contents(pathOf(SOURCE));

	if (text === null) {
		throw new Error(`${named(pathOf(SOURCE))} is missing`);
	}

	return text;
}

/**
 * An `implementer-*.md` this script does not write and nobody wrote by hand: a
 * variant whose effort left the list above. Claude Code goes on offering it,
 * and its body stops following the source.
 */
const strays = (): readonly string[] =>
	readdirSync(AGENTS)
		.map((file) => new RegExp(`^${SOURCE}-(.+)\\.md$`).exec(file)?.[1])
		.filter(
			(suffix): suffix is string =>
				suffix !== undefined &&
				!VARIANT_EFFORTS.includes(suffix) &&
				!HAND_WRITTEN.includes(suffix),
		)
		.map(
			(suffix) =>
				`${named(pathOf(`${SOURCE}-${suffix}`))} is not a variant this script writes`,
		);

function write(): void {
	const text = source();

	for (const effort of VARIANT_EFFORTS) {
		const path = pathOf(`${SOURCE}-${effort}`);
		const made = variant(text, effort);

		if (contents(path) !== made) {
			writeFileSync(path, made);
			process.stdout.write(`agent-variants: wrote ${named(path)}\n`);
		}
	}
}

function check(): void {
	const text = source();
	const problems: string[] = [...strays()];

	for (const effort of VARIANT_EFFORTS) {
		const path = pathOf(`${SOURCE}-${effort}`);
		const copy = contents(path);

		if (copy === null) {
			problems.push(`${named(path)} is missing`);
		} else if (copy !== variant(text, effort)) {
			problems.push(`${named(path)} differs from ${named(pathOf(SOURCE))}`);
		}
	}

	if (problems.length === 0) {
		return;
	}

	for (const problem of problems) {
		process.stderr.write(`agent-variants: ${problem}\n`);
	}

	process.stderr.write(
		`agent-variants: edit ${named(pathOf(SOURCE))}, run \`npm run agent-variants\` and commit the result, then delete anything it did not write\n`,
	);
	process.exitCode = 1;
}

const args = process.argv.slice(2);

if (args.length === 0) {
	write();
} else if (args.length === 1 && args[0] === "--check") {
	check();
} else {
	process.stderr.write("agent-variants: usage: agent-variants.mts [--check]\n");
	process.exitCode = 1;
}
