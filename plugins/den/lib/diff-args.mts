// The diff-page skill's argument, split into the `git diff` arguments it
// holds.

/** The argument as `git diff` is given it, and what it holds. */
export interface DiffArgs {
	/** The options, the revisions, then `--` and the paths if there are any. */
	readonly words: readonly string[];
	readonly options: readonly string[];
	readonly revisions: readonly string[];
	readonly paths: readonly string[];
	/** Whether an option names the whitespace the diff ignores. */
	readonly whitespace: boolean;
	/**
	 * Whether an option chooses how the line diff compares lines or cuts
	 * them into hunks, beyond the context `-U` sets.
	 */
	readonly shapesLines: boolean;
	/** The context lines a hunk keeps around a change: the last `-U`, or git's 3. */
	readonly context: number;
}

// git's own options for the whitespace a diff ignores. With none of them in
// the argument the diff ignores all whitespace, as `-w` does, so a line
// reindented or rewrapped is not read as changed; with one, the caller's
// option is the only one.
const WHITESPACE = new Set([
	"-w",
	"--ignore-all-space",
	"-b",
	"--ignore-space-change",
	"--ignore-space-at-eol",
	"--ignore-cr-at-eol",
	"--ignore-blank-lines",
]);

// The options besides whitespace's that choose how lines are compared or
// cut into hunks, which a structural diff has no counterpart for.
const LINE_SHAPING = new Set([
	"-W",
	"--function-context",
	"--minimal",
	"--patience",
	"--histogram",
]);
const LINE_SHAPING_VALUED = /^--(inter-hunk-context|diff-algorithm|anchored)=/;

const CONTEXT = /^(?:-U|--unified=)(\d+)$/;

/**
 * `argument` as `git diff` arguments. Before a `--`, a word that starts with
 * `-` is an option and any other a revision, so an option's value is
 * written into it (`-U5`, `--diff-filter=M`); after one, every word is a
 * path. An argument naming no revision compares against HEAD.
 */
export function diffArgs(argument: string): DiffArgs {
	const given = argument
		.trim()
		.split(/\s+/)
		.filter((w) => w !== "");
	const dash = given.indexOf("--");
	const before = dash === -1 ? given : given.slice(0, dash);
	const paths = dash === -1 ? [] : given.slice(dash + 1);
	const options = before.filter((w) => w.startsWith("-"));
	const named = before.filter((w) => !w.startsWith("-"));
	const revisions = named.length === 0 ? ["HEAD"] : named;
	const whitespace = options.some((option) => WHITESPACE.has(option));
	const context = options
		.map((option) => CONTEXT.exec(option)?.[1])
		.findLast((count) => count !== undefined);

	return {
		words: [...options, ...revisions, ...(dash === -1 ? [] : ["--", ...paths])],
		options,
		revisions,
		paths,
		whitespace,
		shapesLines:
			whitespace ||
			options.some(
				(option) =>
					LINE_SHAPING.has(option) || LINE_SHAPING_VALUED.test(option),
			),
		context: context === undefined ? 3 : Number(context),
	};
}
