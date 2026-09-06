// Every configuration the hooks have to refuse: one row per fault the checker
// is responsible for, each phrased the way an author would write the mistake,
// and what the report has to name for that author to find it, which is the
// section and the key too wherever one key is wrong. Nothing is merged under
// the file, so a section or a key the file leaves out is one of them.
//
// Its own module because the list grows with every table the plugin reads,
// while the cases that run it do not. Importing this registers no test of its
// own.
import { DEFAULTS, GUARD, GUARD_MESSAGES, MESSAGES } from "./harness.mts";

/** The mistake, what the report has to name, and the file that carries it. */
export type Invalid = readonly [string, string, readonly string[]];

export const INVALID: readonly Invalid[] = [
	["no [default] at all", "[default]", [MESSAGES, GUARD, GUARD_MESSAGES]],
	[
		"a [default] with no urgent",
		"[default] urgent",
		["[default]\nnotice = 1\n", MESSAGES, GUARD, GUARD_MESSAGES],
	],
	[
		"a [default] notice that is not a number",
		"[default] notice",
		[
			'[default]\nnotice = "lots"\nurgent = 2\n',
			MESSAGES,
			GUARD,
			GUARD_MESSAGES,
		],
	],
	["no [messages] at all", "[messages]", [DEFAULTS, GUARD, GUARD_MESSAGES]],
	[
		"a [messages] with a blank notice",
		"[messages] notice",
		[
			DEFAULTS,
			'[messages]\nnotice = ""\nurgent = "u"\n',
			GUARD,
			GUARD_MESSAGES,
		],
	],
	["no [resume-guard] at all", "[resume-guard]", [DEFAULTS, MESSAGES]],
	[
		"a [resume-guard] with no cold",
		"[resume-guard] cold",
		[DEFAULTS, MESSAGES, "[resume-guard]\nlarge = 1\n", GUARD_MESSAGES],
	],
	[
		"a [resume-guard.messages] with a blank denied",
		"[resume-guard.messages] denied",
		[
			DEFAULTS,
			MESSAGES,
			GUARD,
			'[resume-guard.messages]\ndenied = ""\nused = "u"\n',
		],
	],
	[
		"a models row that is not a table",
		"[models.'opus']",
		[DEFAULTS, "[models]\nopus = 5\n", MESSAGES, GUARD, GUARD_MESSAGES],
	],
	[
		"a models key that is not a regular expression",
		"[models.'(']",
		[
			DEFAULTS,
			"[models.'(']\nnotice = 1\nurgent = 2\n",
			MESSAGES,
			GUARD,
			GUARD_MESSAGES,
		],
	],
	[
		"a models row enabled that is not a boolean",
		"[models.'.'] enabled",
		[
			DEFAULTS,
			"[models.'.']\nenabled = \"yes\"\n",
			MESSAGES,
			GUARD,
			GUARD_MESSAGES,
		],
	],
	// The watcher's own table is the one a file need not carry at all, so what
	// is refused here is a value written rather than a value left out.
	[
		"a [watcher] tail_turns of zero",
		"[watcher] tail_turns",
		[DEFAULTS, MESSAGES, GUARD, GUARD_MESSAGES, "[watcher]\ntail_turns = 0\n"],
	],
	[
		"a [watcher] command written as a shell line",
		"[watcher] command",
		[
			DEFAULTS,
			MESSAGES,
			GUARD,
			GUARD_MESSAGES,
			'[watcher]\ncommand = "claude -p"\n',
		],
	],
];
