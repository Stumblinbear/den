// The `--flag value` arguments this plugin's own entries are handed: the Stop
// hook gets its price files from `hooks.json`, and the cut-point script gets
// its session and its price files from the skill's preamble. Both want the
// same thing out of a command line, so both ask for it the same way.
//
// The shared launcher reads `--config` for itself, in `lib/shared`, which is
// copied kit and answers to no one plugin.

/** The value a flag was given, and null for a flag the run was not passed. */
export function argValue(args: readonly string[], flag: string): string | null {
	const at = args.indexOf(flag);

	return at < 0 ? null : (args[at + 1] ?? null);
}
