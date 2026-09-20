// Every configuration the hooks have to refuse: one row per fault the checker
// is responsible for, each phrased the way an author would write the mistake.
// Nothing is merged under the file, so a section or a key the file leaves out
// is one of them.
//
// Its own module because the list grows with every table the plugin reads,
// while the cases that run it do not. Importing this registers no test of its
// own.
import {
	DEFAULTS,
	GUARD,
	GUARD_MESSAGES,
	MESSAGES,
	USABLE,
} from "./harness.mts";

/** The mistake, and the file that carries it. */
export type Invalid = readonly [string, readonly string[]];

export const INVALID: readonly Invalid[] = [
	["no [default] at all", [MESSAGES, GUARD, GUARD_MESSAGES]],
	[
		"a [default] with no urgent",
		["[default]\nnotice = 1\n", MESSAGES, GUARD, GUARD_MESSAGES],
	],
	[
		"a [default] notice that is not a number",
		[
			'[default]\nnotice = "lots"\nurgent = 2\n',
			MESSAGES,
			GUARD,
			GUARD_MESSAGES,
		],
	],
	["no [messages] at all", [DEFAULTS, GUARD, GUARD_MESSAGES]],
	[
		"a [messages] with a blank notice",
		[
			DEFAULTS,
			'[messages]\nnotice = ""\nurgent = "u"\n',
			GUARD,
			GUARD_MESSAGES,
		],
	],
	["no [resume-guard] at all", [DEFAULTS, MESSAGES]],
	[
		"a [resume-guard] with no cold",
		[DEFAULTS, MESSAGES, "[resume-guard]\nlarge = 1\n", GUARD_MESSAGES],
	],
	[
		"a [resume-guard.messages] with a blank denied",
		[
			DEFAULTS,
			MESSAGES,
			GUARD,
			'[resume-guard.messages]\ndenied = ""\nused = "u"\n',
		],
	],
	[
		"a models row that is not a table",
		[DEFAULTS, "[models]\nopus = 5\n", MESSAGES, GUARD, GUARD_MESSAGES],
	],
	[
		"a models key that is not a regular expression",
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
		[
			DEFAULTS,
			"[models.'.']\nenabled = \"yes\"\n",
			MESSAGES,
			GUARD,
			GUARD_MESSAGES,
		],
	],
	// A guard row carries both limits or neither: a row that names one is a row
	// whose author meant to write the other, in whichever of the two tables it
	// was written in.
	[
		"a [resume-guard.agents] row with no cold",
		[
			DEFAULTS,
			MESSAGES,
			GUARD,
			"[resume-guard.agents.'fixer']\nlarge = 1\n",
			GUARD_MESSAGES,
		],
	],
	[
		"a [resume-guard.models] row with no cold",
		[
			DEFAULTS,
			MESSAGES,
			GUARD,
			"[resume-guard.models.'fable']\nlarge = 1\n",
			GUARD_MESSAGES,
		],
	],
	[
		"a guard row key that is not a regular expression",
		[
			DEFAULTS,
			MESSAGES,
			GUARD,
			"[resume-guard.agents.'(']\nlarge = 1\ncold = 2\n",
			GUARD_MESSAGES,
		],
	],
	[
		"a [resume-guard.agents] that is not a table",
		[
			DEFAULTS,
			MESSAGES,
			"[resume-guard]\nlarge = 1\ncold = 2\nagents = 5\n",
			GUARD_MESSAGES,
		],
	],
	[
		"a [resume-guard.models] that is not a table",
		[
			DEFAULTS,
			MESSAGES,
			"[resume-guard]\nlarge = 1\ncold = 2\nmodels = 5\n",
			GUARD_MESSAGES,
		],
	],
	// The watcher's own table is the one a file need not carry at all, so what
	// is refused here is a value written rather than a value left out.
	["a [watcher] tail_turns of zero", [USABLE, "[watcher]\ntail_turns = 0\n"]],
	[
		"a [watcher] command written as a shell line",
		[USABLE, '[watcher]\ncommand = "claude -p"\n'],
	],
	// An empty word is an argument wherever it falls after the first, since
	// the default command switches the judge's tools off with one. In the
	// first it is a command with no program, which nothing can spawn.
	[
		"a [watcher] command whose first word is empty",
		[USABLE, '[watcher]\ncommand = ["", "-p"]\n'],
	],
	// The wake's table may be left out too, so what is refused here is a value
	// written rather than a value left out.
	["a [wake] enabled that is not a boolean", [USABLE, "[wake]\nenabled = 1\n"]],
	["a [wake] row that is not a table", [USABLE, "[wake]\n'1h' = 2\n"]],
	["a [wake] row with times of zero", [USABLE, "[wake.'1h']\ntimes = 0\n"]],
	// The rows are read whether or not the section is switched on, so a row
	// nobody will consult still has its mistakes reported.
	[
		"a [wake] switched off with a row whose times is zero",
		[USABLE, "[wake]\nenabled = false\n", "[wake.'1h']\ntimes = 0\n"],
	],
	[
		"a [wake] row whose before is not a duration",
		[USABLE, "[wake.'5m']\nbefore = 45\n"],
	],
	[
		"a [wake] row whose before is as long as its lifetime",
		[USABLE, "[wake.'5m']\nbefore = \"5m\"\n"],
	],
	[
		"a [wake.messages] with a blank wake",
		[USABLE, '[wake.messages]\nwake = ""\n'],
	],
];
