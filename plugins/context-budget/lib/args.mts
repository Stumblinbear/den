// Reading the `--flag value` arguments `hooks.json` passes this plugin's
// entries: `argValue`, which the watcher uses to name the configuration file in
// a fault.
//
// The shared kit in `lib/shared` reads `--config` for itself, since it is
// copied into every plugin and belongs to none of them.

/** The value a flag was given, and null for a flag the run was not passed. */
export function argValue(args: readonly string[], flag: string): string | null {
	const at = args.indexOf(flag);

	return at < 0 ? null : (args[at + 1] ?? null);
}
