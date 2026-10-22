// The line a plan script prints: `planLine` builds it, and `count` writes a
// tally in it.
import type { LoadedPlan } from "./load.mts";

/** Writes `n` of `noun`, plural except at one: `1 step`, `2 sources`. */
export const count = (n: number, noun: string): string =>
	`${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * Builds the line a plan script prints, naming what it made in `head`, with
 * `summary` and what loading the plan left unread or found wrong.
 *
 * @remarks
 * The line reads `head (summary; N sources unread; N problems)`, then each
 * unread source with its reason and each problem in full. A tally and its
 * names are left out where there are none.
 */
export function planLine(
	head: string,
	summary: readonly string[],
	{ unread, problems }: LoadedPlan,
): string {
	const tallies: string[] = [];
	const notes: string[] = [];

	if (unread.length > 0) {
		const named = unread.map(({ source, reason }) => `${source}: ${reason}`);

		tallies.push(`${count(unread.length, "source")} unread`);
		notes.push(`Not read: ${named.join("; ")}`);
	}

	if (problems.length > 0) {
		tallies.push(count(problems.length, "problem"));
		notes.push(`Problems: ${problems.join(" ")}`);
	}

	const tail = notes.map((note) => `. ${note}`).join("");

	return `${head} (${[...summary, ...tallies].join("; ")})${tail}`;
}
