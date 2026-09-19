// Writes the effort variants of den's implementer, and checks the committed
// variants still match it. An agent definition sets one effort level and has
// nothing to include a shared body from, so the body lives once in
// `implementer.md` and each variant is that file with its name, its effort and
// its description's closing clause changed.
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

/**
 * One effort level, and the brief its description says it is for. The lead
 * skill's Agents list is the home of the rule for picking among them; the
 * clause here is what a session without that skill has to go on. The source's
 * own clause is in `implementer.md` and nowhere else, so rewording it there
 * is the whole edit.
 */
interface Tier {
	readonly effort: string;
	readonly brief: string;
}

const VARIANTS: readonly Tier[] = [
	{ effort: "low", brief: "leaves nothing to weigh" },
	{ effort: "high", brief: "leaves a decision open" },
];

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
function swap(text: string, from: string | RegExp, to: string): string {
	const parts = text.split(from);

	if (parts.length !== 2) {
		const sought = typeof from === "string" ? JSON.stringify(from) : from;

		throw new Error(
			`${named(pathOf(SOURCE))} holds ${parts.length - 1} of ${sought}, and a variant needs exactly one`,
		);
	}

	return parts.join(to);
}

/**
 * How the source's description ends, whatever brief it names: the one
 * sentence in a description that differs by tier.
 */
const SOURCE_ENDING = new RegExp(
	` at ${SOURCE_EFFORT} effort, for a brief that [^.\\n]+\\.\\n`,
);

const ending = (tier: Tier): string =>
	` at ${tier.effort} effort, for a brief that ${tier.brief}.\n`;

function variant(source: string, tier: Tier): string {
	const renamed = swap(
		source,
		`\nname: ${SOURCE}\n`,
		`\nname: ${SOURCE}-${tier.effort}\n`,
	);
	const pinned = swap(
		renamed,
		`\neffort: ${SOURCE_EFFORT}\n`,
		`\neffort: ${tier.effort}\n`,
	);

	return swap(pinned, SOURCE_ENDING, ending(tier));
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
				!VARIANTS.some((tier) => tier.effort === suffix) &&
				!HAND_WRITTEN.includes(suffix),
		)
		.map(
			(suffix) =>
				`${named(pathOf(`${SOURCE}-${suffix}`))} is not a variant this script writes`,
		);

function write(): void {
	const text = source();

	for (const tier of VARIANTS) {
		const path = pathOf(`${SOURCE}-${tier.effort}`);
		const made = variant(text, tier);

		if (contents(path) !== made) {
			writeFileSync(path, made);
			process.stdout.write(`agent-variants: wrote ${named(path)}\n`);
		}
	}
}

function check(): void {
	const text = source();
	const problems: string[] = [...strays()];

	for (const tier of VARIANTS) {
		const path = pathOf(`${SOURCE}-${tier.effort}`);
		const copy = contents(path);

		if (copy === null) {
			problems.push(`${named(path)} is missing`);
		} else if (copy !== variant(text, tier)) {
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

// A source the variants cannot be made from, missing or without a line they
// change, is a finding like drift is, said in a line rather than a stack.
try {
	if (args.length === 0) {
		write();
	} else if (args.length === 1 && args[0] === "--check") {
		check();
	} else {
		process.stderr.write(
			"agent-variants: usage: agent-variants.mts [--check]\n",
		);
		process.exitCode = 1;
	}
} catch (error) {
	const reason = error instanceof Error ? error.message : String(error);

	process.stderr.write(`agent-variants: ${reason}\n`);
	process.exitCode = 1;
}
