// Exercises the shipped workflow bodies with a host-shaped agent callback.
// This checks handoffs and control flow, not the model's design judgment or
// the external Workflow host's schema enforcement.
import { readFileSync } from "node:fs";

export interface AgentOptions {
	readonly agentType: string;
	readonly schema?: {
		readonly required: readonly string[];
		readonly properties: Record<string, unknown>;
	};
}

export type Agent = (prompt: string, options: AgentOptions) => Promise<unknown>;

type Workflow = (
	args: unknown,
	agent: Agent,
	parallel: (tasks: readonly (() => Promise<unknown>)[]) => Promise<unknown[]>,
	phase: (name: string) => void,
	log: (message: string) => void,
) => Promise<unknown>;

export function runWorkflow(
	name: "design-exploration" | "flag-review",
	args: unknown,
	agent: Agent,
): Promise<unknown> {
	const source = readFileSync(
		new URL(`../workflows/${name}.js`, import.meta.url),
		"utf8",
	);
	// The host extracts exported metadata before executing the function body.
	// Retain that declaration locally; the top-level return stays in the body.
	const body = source.replace(/^export const meta = /m, "const meta = ");
	const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
	const workflow = new AsyncFunction(
		"args",
		"agent",
		"parallel",
		"phase",
		"log",
		body,
	) as Workflow;

	return workflow(
		args,
		agent,
		(tasks) => Promise.all(tasks.map((task) => task())),
		() => {},
		() => {},
	);
}

export const proposal = () => ({
	status: "proposed",
	summary: "One owned implementation, with a replaceable host boundary.",
	modules: [],
	state: [],
	seams: [],
	reversal: "Replace one host adapter.",
	costs: "One additional boundary.",
	choices: [],
	assumptions: [],
	questions: [],
});

export const noSuitableProposal = () => ({
	outcome: "no-suitable-proposal",
	recommendation: null,
	ranking: [],
	differences: "Every proposal fails the required compatibility obligation.",
	questions: ["Which compatibility obligation may change, if any?"],
});
