// The TOML configuration both hooks read: how it is found, merged and checked,
// the report that stands in place of any recovery when it cannot be used, and
// the number formatting and placeholder substitution both hooks apply to the
// messages it carries.
//
// What a model charges for a cached token is not configuration and is not
// here; it is `pricing.mjs`.
import { pathArgs } from "./args.mjs";
import { claimReport } from "./session-record.mjs";
import {
  firstMatchingRow,
  HOOKS_OFF,
  isPattern,
  PARSER_FAULT_MESSAGE,
  readToml,
  tomlParser,
} from "./toml-table.mjs";

// A fault reported to the session. `printed` is true where this run is the one
// that wrote the line and false where the class had already been reported,
// settled before the throw, since what a caller does about a fault turns on
// whether the line it carries has just reached the user.
class HookFault extends Error {
  constructor(cls, message, printed) {
    super(message);
    this.cls = cls;
    this.printed = printed;
  }
}

export const configPaths = (args) =>
  pathArgs(args, {
    "--defaults": "defaultsPath",
    "--overrides": "overridesPath",
  });

// Loads the merged, checked configuration. Throws a `HookFault` it has already
// reported for anything that stops it.
export async function loadConfig(sessionId, { defaultsPath, overridesPath }) {
  const parse = await tomlParser();

  if (!parse) {
    throw fault(sessionId, "parser", PARSER_FAULT_MESSAGE);
  }

  const paths = { sessionId, defaultsPath, overridesPath };
  const base = read(paths, defaultsPath, parse, true);
  const over = read(paths, overridesPath, parse, false);

  const file = {
    // One section of the config: the shipped table with the override's table
    // of the same name merged over it key by key, so an override that sets
    // one key keeps the rest. More than one name walks into a nested table
    // ([resume-guard.messages]), which merges the same way at its own level.
    section(...path) {
      let shipped = base;
      let override = over;

      for (const name of path) {
        shipped = shipped?.[name] ?? {};
        override = override?.[name] ?? {};
      }

      return { ...shipped, ...override };
    },

    // Which file the merged value of `key` came from, so a report about it
    // names the file its author has to edit.
    origin(path, key) {
      let table = over;

      for (const name of path) table = table?.[name];

      return isTable(table) && Object.hasOwn(table, key)
        ? overridesPath
        : defaultsPath;
    },
  };

  validate(paths, file);

  return file;
}

// --- reading ---------------------------------------------------------------

function read(paths, path, parse, required) {
  const { table, detail } = readToml(path, parse, required);

  if (detail) throw configFault(paths, path, detail);

  return table ?? {};
}

const configFault = (paths, path, detail) =>
  fault(
    paths.sessionId,
    "config",
    `context-budget: config error -- ${path} ${detail}. ${HOOKS_OFF}; ` +
      (path === paths.defaultsPath
        ? "reinstall the plugin."
        : "fix or delete that file."),
  );

// --- checking --------------------------------------------------------------

const isTable = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Every value the two hooks read, checked once here so neither has to carry a
// second opinion about what a usable row looks like.
function validate(paths, file) {
  const raise = (where, detail) => {
    throw configFault(paths, where, detail);
  };

  const row = (where, label, table) => {
    if (table.enabled !== undefined && typeof table.enabled !== "boolean") {
      raise(where("enabled"), `has ${label} enabled that is not a boolean`);
    }

    // A row switched off is never consulted for thresholds, so it needs none.
    if (table.enabled === false) return;

    for (const key of ["notice", "urgent"]) {
      if (!Number.isFinite(table[key]))
        raise(where(key), `has ${label} ${key} that is not a number`);
    }
  };

  const text = (where, label, table, keys) => {
    for (const key of keys) {
      if (typeof table[key] !== "string" || table[key].trim() === "") {
        raise(where(key), `has ${label} ${key} that is not a non-empty string`);
      }
    }
  };

  row(
    (key) => file.origin(["default"], key),
    "[default]",
    file.section("default"),
  );

  const models = file.section("models");
  for (const [pattern, table] of Object.entries(models)) {
    const where = () => file.origin(["models"], pattern);
    const label = `[models.'${pattern}']`;

    // A row is replaced by an override outright rather than merged, so every
    // key in it, and the pattern itself, comes from the one file.
    if (!isTable(table)) raise(where(), `has ${label}, which is not a table`);

    if (!isPattern(pattern)) {
      raise(where(), `has ${label}, whose key is not a regular expression`);
    }

    row(where, label, table);
  }

  text(
    (key) => file.origin(["messages"], key),
    "[messages]",
    file.section("messages"),
    ["notice", "urgent"],
  );

  const guardKey = (key) => file.origin(["resume-guard"], key);
  const guard = file.section("resume-guard");

  if (guard.enabled !== undefined && typeof guard.enabled !== "boolean") {
    raise(
      guardKey("enabled"),
      "has [resume-guard] enabled that is not a boolean",
    );
  }

  for (const key of ["large", "cold"]) {
    if (!Number.isFinite(guard[key])) {
      raise(guardKey(key), `has [resume-guard] ${key} that is not a number`);
    }
  }

  text(
    (key) => file.origin(["resume-guard", "messages"], key),
    "[resume-guard.messages]",
    file.section("resume-guard", "messages"),
    ["denied", "used"],
  );
}

// --- rows ------------------------------------------------------------------

// The row that governs a model: the first `[models.'<regex>']` whose key
// matches the id the transcript records, in the order the rows are written,
// and `[default]` when none do -- a transcript that names no model included,
// since an empty id matches no row. Every row here is one `validate` has
// already checked, so a match is a usable answer.
export const modelRow = (file, model) =>
  firstMatchingRow(file.section("models"), model) ?? file.section("default");

// --- reporting -------------------------------------------------------------

// A fault, told to the session on the way out: one line per class per session
// and then silence, whichever reader meets it first.
function fault(sessionId, cls, message) {
  const printed = claimReport(sessionId, cls);

  if (printed) process.stderr.write(message + "\n");

  return new HookFault(cls, message, printed);
}

// Whether the error `loadConfig` threw is a fault it has just printed. Both
// hooks answer that with a non-blocking exit 1, which is what puts the line in
// front of the user; a fault the session has already heard is silent, and so
// is every other failure.
export const printedFault = (error) =>
  error instanceof HookFault && error.printed === true;

// --- messages --------------------------------------------------------------

export const formatTokens = (n) =>
  (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";

// Placeholder substitution for the configured messages. Only the values the
// caller supplies are substituted; anything else the message writes in braces
// is left alone.
export function fill(message, values) {
  let text = String(message);

  for (const [key, value] of Object.entries(values)) {
    text = text.replaceAll(`{${key}}`, value);
  }

  return text;
}
