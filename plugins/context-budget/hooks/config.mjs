// The TOML configuration both hooks read: how it is found, merged and checked,
// the once-per-session report that stands in place of any recovery when it
// cannot be used, and the number formatting and placeholder substitution both
// hooks apply to the messages it carries.
import { readFileSync } from "node:fs";
import { readRecord, writeRecord } from "./session-record.mjs";

const OFF = "The context notice and the resume guard are off for this session";

class HookFault extends Error {
  constructor(cls, message) {
    super(message);
    this.cls = cls;
  }
}

export function configPaths(args) {
  let defaultsPath = null;
  let overridesPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--defaults") defaultsPath = args[++i];
    else if (args[i] === "--overrides") overridesPath = args[++i];
  }

  return { defaultsPath, overridesPath };
}

// Loads the merged, checked configuration.
export async function loadConfig(sessionId, { defaultsPath, overridesPath }) {
  try {
    let parse;

    try {
      ({ parse } = await import("smol-toml"));
    } catch {
      throw new HookFault(
        "parser",
        "context-budget: parser error -- the smol-toml package could not be imported. " +
          `${OFF}; reinstall the plugin, or run \`npm ci\` in its cache directory.`,
      );
    }

    const paths = { defaultsPath, overridesPath };
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
  } catch (error) {
    if (error instanceof HookFault) report(sessionId, error);

    throw error;
  }
}

// --- reading ---------------------------------------------------------------

function read(paths, path, parse, required) {
  // No --overrides argument at all is the same thing as no override file: a
  // hand-run against the shipped config alone.
  if (!path && !required) return {};

  let text;

  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    // No override file is the normal case: the user has not written one.
    if (!required && error?.code === "ENOENT") return {};

    throw configFault(
      paths,
      path,
      `cannot be read (${error?.code ?? error?.message})`,
    );
  }

  try {
    return parse(text);
  } catch (error) {
    throw configFault(
      paths,
      path,
      `is not valid TOML: ${firstLine(error?.message)}`,
    );
  }
}

const firstLine = (text) =>
  String(text ?? "unparseable")
    .split("\n")[0]
    .trim();

const configFault = (paths, path, detail) =>
  new HookFault(
    "config",
    `context-budget: config error -- ${path} ${detail}. ${OFF}; ` +
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
  const fault = (where, detail) => {
    throw configFault(paths, where, detail);
  };

  const row = (where, label, table) => {
    if (table.enabled !== undefined && typeof table.enabled !== "boolean") {
      fault(where("enabled"), `has ${label} enabled that is not a boolean`);
    }

    // A row switched off is never consulted for thresholds, so it needs none.
    if (table.enabled === false) return;

    for (const key of ["notice", "urgent"]) {
      if (!Number.isFinite(table[key]))
        fault(where(key), `has ${label} ${key} that is not a number`);
    }
  };

  const text = (where, label, table, keys) => {
    for (const key of keys) {
      if (typeof table[key] !== "string" || table[key].trim() === "") {
        fault(where(key), `has ${label} ${key} that is not a non-empty string`);
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
    if (!isTable(table)) fault(where(), `has ${label}, which is not a table`);

    try {
      new RegExp(pattern);
    } catch {
      fault(where(), `has ${label}, whose key is not a regular expression`);
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
    fault(
      guardKey("enabled"),
      "has [resume-guard] enabled that is not a boolean",
    );
  }

  for (const key of ["large", "cold"]) {
    if (!Number.isFinite(guard[key])) {
      fault(guardKey(key), `has [resume-guard] ${key} that is not a number`);
    }
  }

  text(
    (key) => file.origin(["resume-guard", "messages"], key),
    "[resume-guard.messages]",
    file.section("resume-guard", "messages"),
    ["denied", "used"],
  );
}

// --- reporting -------------------------------------------------------------

// One report per class per session, then silence, whichever hook gets there
// first: the classes already reported are listed in the session's record,
// which both hooks read and write.
function report(sessionId, fault) {
  const done = readRecord(sessionId).reported;
  const reported = Array.isArray(done) ? done : [];

  if (reported.includes(fault.cls)) process.exit(0);

  try {
    writeRecord(sessionId, { reported: [...reported, fault.cls] });
  } catch {}

  process.stderr.write(fault.message + "\n");

  // Non-blocking failure: shown to the user, the tool call or prompt carries on.
  process.exit(1);
}

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
