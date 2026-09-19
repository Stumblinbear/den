// The diff-page skill's argument, split into the `git diff` arguments it
// holds.

/** The argument as `git diff` is given it, and what it holds. */
export interface DiffArgs {
	/** The options, the revisions, then `--` and the paths if there are any. */
	readonly words: readonly string[];
	readonly options: readonly string[];
	readonly revisions: readonly string[];
	readonly paths: readonly string[];
}

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

	return {
		words: [...options, ...revisions, ...(dash === -1 ? [] : ["--", ...paths])],
		options,
		revisions,
		paths,
	};
}
