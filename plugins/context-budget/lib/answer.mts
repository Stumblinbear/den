// The answer the judge is held to: the two shapes it may take, the words
// that ask for one of them, and the schema the CLI validates what comes back
// against. They are three statements of one contract, so they are written in
// one place and edited together. The call that asks for an answer, and the
// read of what comes back, are `judge.mts`.

/** How long the judge asks to be left alone where the arc has not ended. */
export type Wait = "next turn" | "a few turns" | "later";

const WAITS: readonly Wait[] = ["next turn", "a few turns", "later"];

/** The wait a judge's answer names, and null for anything that is none. */
export const waitIn = (value: unknown): Wait | null =>
	WAITS.find((known) => known === value) ?? null;

/**
 * The words that ask for one of the two shapes, and the last thing the prompt
 * says. What the fields mean is here; what may be written in them is the
 * schema below.
 */
export const ANSWER = `Answer in one of these two shapes. Where you are offered a structured output, answer through it; where you are not, write the shape as one JSON object and nothing else.

{"good": false, "wait": "next turn" | "a few turns" | "later"}
{"good": true, "reason": "..."}

The first is the answer for an arc that has not ended, and \`wait\` is how long before this is worth another look: \`next turn\` where the arc is closing now, \`a few turns\` where the session is mid-step, \`later\` where it has just begun.

The second is the answer for an arc that has ended. \`reason\` is one sentence in the session's own terms, naming the arc that ended. The agent reads it back to the person running the session, so keep it to a line and write it in that session's words. Whether to compact or rewind, and where, is the session's to price; you do not say.`;

/**
 * The same two shapes as a JSON Schema, which the default command hands the CLI
 * as `--json-schema`. The model is then sampled against it and the CLI returns
 * the object it validated, so the answer arrives as an object rather than as
 * text somebody has to find a brace in. The prose above says what the fields
 * mean and which shape answers what; this says only what may be written.
 *
 * The root is one object because the CLI wires the schema in as a tool's input
 * schema, which has to be `"type": "object"` there and refuses a union beside
 * it. A property may carry one, so the answer itself sits under `answer` as a
 * choice between the two shapes, and each shape asks for the whole of what it
 * is read for.
 *
 * Nothing here forbids a field nobody asked for. `narrowed` reads the fields it
 * knows and ignores the rest, and an `additionalProperties: false` that turned
 * one spare field into a validation failure would spend the whole consultation
 * to gain nothing.
 */
export const ANSWER_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		answer: {
			anyOf: [
				{
					type: "object",
					properties: {
						good: { const: true },
						reason: { type: "string" },
					},
					required: ["good", "reason"],
				},
				{
					type: "object",
					properties: {
						good: { const: false },
						wait: { type: "string", enum: WAITS },
					},
					required: ["good", "wait"],
				},
			],
		},
	},
	required: ["answer"],
});
