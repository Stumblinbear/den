// A TOML table this plugin reads: a shipped file with a user file over it,
// whose per-model rows are keyed by a regular expression. The configuration
// and the price table both are one, and say entirely different things and are
// merged by different rules, but everything under those differences is here --
// how one file becomes a table or a complaint about itself, which per-model
// row governs a model id, and the one failure that stops both readers at once.
// Shared so the two cannot drift on any of it: a difference in which row wins
// is one nobody notices until a session is priced wrong.
import { readFileSync } from "node:fs";

// What a TOML file the plugin cannot read costs the session. The configuration
// carries the thresholds the notice fires on and the limits the guard denies
// on, so neither runs without it; an unusable price table costs a reading its
// accuracy and nothing else, and so never says this.
export const HOOKS_OFF =
  "The context notice and the resume guard are off for this session";

// The message for the one failure that stops every reader here at once, in one
// wording, since a session that has heard it from one reader has heard it.
export const PARSER_FAULT_MESSAGE =
  "context-budget: parser error -- the smol-toml package could not be imported. " +
  `${HOOKS_OFF}; reinstall the plugin, or run \`npm ci\` in its cache directory.`;

// The TOML parser, or null when the package is not installed. The one failure
// that stops every reader here at once, which is why each of them asks for it
// before anything else.
export async function tomlParser() {
  try {
    return (await import("smol-toml")).parse;
  } catch {
    return null;
  }
}

// One TOML file read and parsed: `{ table }` for a file that yielded one, `{}`
// for a file that is not there and did not have to be, and `{ detail }` for
// one that could not be used -- a phrase to hang after the path in whatever
// complaint its reader makes of it, since what that costs the session differs
// between them and the reason does not.
export function readToml(path, parse, required) {
  // No path at all is the same thing as no file: a hand run with the argument
  // left off.
  if (!path && !required) return {};

  let text;

  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    // A file the user never wrote is the normal case for every optional one.
    if (!required && error?.code === "ENOENT") return {};

    return { detail: `cannot be read (${error?.code ?? error?.message})` };
  }

  try {
    return { table: parse(text) };
  } catch (error) {
    return { detail: `is not valid TOML: ${firstLine(error?.message)}` };
  }
}

const firstLine = (text) =>
  String(text ?? "unparseable")
    .split("\n")[0]
    .trim();

// --- model rows -------------------------------------------------------------

// Whether a row key is usable as the regular expression it is meant to be.
export const isPattern = (key) => {
  try {
    new RegExp(key);

    return true;
  } catch {
    return false;
  }
};

// The value of the first row whose key matches the model id, in the order the
// rows are written, or null when none does and the caller's own default is the
// answer. Both files key their rows this way, so both resolve them this way.
export function firstMatchingRow(rows, model) {
  // An empty model id is not a model: it is a transcript that says nothing
  // about what it was sent to, and nobody writes a row for that. Matched
  // against the rows, a key that matches everything -- '.*', '^', '' -- takes
  // it, and both tables then answer with that row while calling it the
  // default.
  if (!model) {
    return null;
  }

  for (const [pattern, row] of Object.entries(rows)) {
    if (new RegExp(pattern).test(model)) {
      return row;
    }
  }

  return null;
}
