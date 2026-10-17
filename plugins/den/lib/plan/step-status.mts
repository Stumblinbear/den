// Step status: `STEP_STATUS_WORDS` holds the words the plan scripts give each
// step status.

/** The words a plan script gives each step status the plan schema allows. */
export const STEP_STATUS_WORDS: Readonly<Record<string, string>> = {
	// plan-page.mts tallies the statuses in this key order.
	committed: "committed",
	inProgress: "in progress",
	pending: "pending",
};
