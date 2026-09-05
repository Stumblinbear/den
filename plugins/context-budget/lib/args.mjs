// The file paths a hook or the script is handed on its command line. Every
// reader in the plugin is given its files as arguments rather than deriving
// them, since only Claude Code knows where a plugin was installed, and this is
// the one place that knows how to read them off `argv`.
//
// `flags` maps each flag to the name its path is returned under, and a flag
// that was not passed comes back null.
export function pathArgs(args, flags) {
  const paths = {};

  for (const name of Object.values(flags)) {
    paths[name] = null;
  }

  for (let i = 0; i < args.length; i++) {
    const name = flags[args[i]];

    if (name) paths[name] = args[++i];
  }

  return paths;
}
