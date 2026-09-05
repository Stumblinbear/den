// What a rewind cut point costs and what it pays back: what a model charges
// for a token read from the prompt cache, what a token written to it costs,
// what the summary a rewind writes costs, and the arithmetic the three make
// between them. One subject, because a cut is the write it pays now against
// the reads it saves every turn after, and none of the three settles that on
// its own.
//
// The read rate is the one of them that varies by model, so it is a shipped
// file of its own (`pricing.toml`) rather than a section of the configuration:
// a fact about the model and not a preference.
//
// Nothing here throws, nothing here stops a caller, and nothing here reports:
// a price table that cannot be used is dropped whole and the caller is handed
// the next-best one -- the shipped rates in place of a user file, the default
// rate in place of the shipped file -- since a payback figure on the shipped
// rate is worth more to the agent than no figure at all.
import { pathArgs } from "./args.mjs";
import { firstMatchingRow, isPattern, readToml, tomlParser } from "./toml-table.mjs";

// The rate to assume where there is no model to price against: a transcript
// whose turns name none, or no price table to ask. Claude Code's own price
// table puts every tier here but Fable, so it is the likeliest answer as well
// as the shipped one -- and a reading that has fallen back to it says so,
// since a figure four times out is worth flagging.
export const DEFAULT_READ_MULTIPLIER = 0.1;

export const pricingPaths = (args) =>
  pathArgs(args, {
    "--pricing": "pricingPath",
    "--pricing-overrides": "overridesPath",
  });

// The merged, checked price table, or null where there is none to be had: no
// `--pricing` argument, or a shipped file that cannot be used.
//
// The user file replaces rather than merges within a row, because a row is one
// number: a row whose key matches a shipped one replaces it where it stands,
// so it keeps the shipped row's place in the order, a row with a new key is
// tried after all the shipped ones, and `default` replaces `default`.
export async function loadPricing({ pricingPath, overridesPath }) {
  // No --pricing argument at all is a hand run against no price table: the
  // reading prices at DEFAULT_READ_MULTIPLIER and says so, which is the same
  // thing it does for a transcript that names no model.
  if (!pricingPath) {
    return null;
  }

  const parse = await tomlParser();

  if (!parse) {
    return null;
  }

  const shipped = read(pricingPath, parse, true);

  if (!shipped) {
    return null;
  }

  const over = read(overridesPath, parse, false);

  return over
    ? {
        default: over.default ?? shipped.default,
        models: { ...shipped.models, ...over.models },
      }
    : shipped;
}

// What one cached input token costs the model the transcript names, from the
// first row whose key matches it, and `default` when none do -- an empty model
// id included, since that matches no row. Null where there is no table to ask.
export const readMultiplier = (pricing, model) =>
  pricing ? (firstMatchingRow(pricing.models, model) ?? pricing.default) : null;

// --- what a cut costs ------------------------------------------------------

// What one token written to the cache costs against one fresh input token, per
// lifetime. Both are the same on every tier, which is why they are a constant
// here while the read rate is a table: only the read has a per-model
// exception. A rewind writes everything it keeps back to the cache at this
// price, once, before any of the saving starts.
const WRITE_MULTIPLIER = { "5m": 1.25, "1h": 2 };

// What the summary a rewind writes costs, in tokens of fresh input: about 4K
// output tokens, at roughly five times the input price. One constant and not a
// per-model figure, because it is the smallest of the three terms in a cut's
// price and the write beside it swamps the difference.
const SUMMARY_TOKENS = 20_000;

// How many turns after a cut at `prompt` it takes to earn back what the cut
// cost, on the lifetime in force and at the rate its model reads cached tokens
// at.
//
// Every term is what the cut costs *over carrying on*. The stretch it keeps is
// written at the write price where carrying on would have read it, so the
// write costs only the difference; what it summarizes away is read once on the
// way past, and the summary is written on top. Against that, every turn after
// the cut saves what the prefix cost to read -- a saving that does not change
// with time, since the context regrows cut or not, so the two divide.
//
// Null where there is nothing above the prompt to stop re-reading: no saving
// to divide by.
export function paybackTurns(prompt, ttl, readRate) {
  const saving = readRate * prompt.prefixTokens;

  if (saving <= 0) {
    return null;
  }

  const cost =
    (WRITE_MULTIPLIER[ttl] - readRate) * prompt.keptTokens + saving + SUMMARY_TOKENS;

  return Math.ceil(cost / saving);
}

// --- reading ---------------------------------------------------------------

// One price file, checked, or null: a file that is not there, one that cannot
// be read or parsed, and one carrying a price the API cannot charge all come
// back the same way, because they cost the caller the same thing -- the rates
// in that file, and nothing else.
function read(path, parse, required) {
  if (!path) {
    return null;
  }

  const { table } = readToml(path, parse, required);

  return table ? checked(table, required) : null;
}

// --- checking --------------------------------------------------------------

// A rate of 0 would price a cut as free and one above 1 would make a cached
// token dearer than a fresh one, which is not a price the API has. Either way
// the payback figure comes out plausible and wrong.
const isRate = (value) => Number.isFinite(value) && value > 0 && value <= 1;

// The table if every price in it is one the API could charge, and null
// otherwise -- the whole file, not the rows that passed: the half of a price
// list that parsed is not a price list anybody wrote.
function checked(table, required) {
  // Only the shipped file has to carry a default. An override that corrects
  // one model says nothing about the rest.
  if (table.default === undefined ? required : !isRate(table.default)) {
    return null;
  }

  if (table.models === undefined) {
    return { ...table, models: {} };
  }

  if (
    typeof table.models !== "object" ||
    table.models === null ||
    Array.isArray(table.models)
  ) {
    return null;
  }

  for (const [pattern, rate] of Object.entries(table.models)) {
    if (!isPattern(pattern) || !isRate(rate)) {
      return null;
    }
  }

  return table;
}
