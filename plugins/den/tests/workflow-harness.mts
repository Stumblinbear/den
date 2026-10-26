// Exercises the shipped workflow bodies with a host-shaped agent callback.
// This checks handoffs and control flow, not the model's judgment or
// the external Workflow host's schema enforcement.
import { readFileSync } from "node:fs";

export interface AgentOptions {
	readonly agentType: string;
	readonly model?: string;
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

/** A workflow den ships under `workflows/`, by its file's base name. */
export type WorkflowName =
	| "review-and-fix-workflow"
	| "quality-review-workflow";

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/** The declaration the host reads a workflow's metadata from. */
const META = /^export const meta = /m;

const workflowSource = (name: WorkflowName): string =>
	readFileSync(new URL(`../workflows/${name}.js`, import.meta.url), "utf8");

/**
 * The `meta.description` a shipped workflow declares, evaluated as the
 * literal it is rather than matched by pattern, so a test that expects it
 * does not share the reading it checks in `review-triage-inject`.
 */
export async function workflowDescription(name: WorkflowName): Promise<string> {
	// The meta declaration is the first statement, so returning it there
	// leaves the rest of the body parsed and never run.
	const meta = await new AsyncFunction(
		"args",
		workflowSource(name).replace(META, "return "),
	)();

	return String(meta.description);
}

export function runWorkflow(
	name: WorkflowName,
	args: unknown,
	agent: Agent,
	log: (message: string) => void = () => {},
): Promise<unknown> {
	// The host extracts exported metadata before executing the function body.
	// Retain that declaration locally; the top-level return stays in the body.
	const body = workflowSource(name).replace(META, "const meta = ");
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
		log,
	);
}
