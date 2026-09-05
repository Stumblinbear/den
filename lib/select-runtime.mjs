// Which interpreter runs an entry. Its own module because `launch.mjs`
// launches as soon as it is loaded, and this choice is worth testing without
// spawning anything. JavaScript, in syntax every Node release parses, so the
// "your Node is too old" message can be composed by the Node that is too old.
//
// Node gained `--experimental-strip-types` in 22.6. Below that there is no way
// to run an entry at all, and the launcher's one stderr line is the whole user
// experience, so it names the floor and what it found.
const NODE_FLOOR_MAJOR = 22;
const NODE_FLOOR_MINOR = 6;
const NODE_FLOOR = `${NODE_FLOOR_MAJOR}.${NODE_FLOOR_MINOR}`;

/**
 * @typedef {{ kind: "bun" } | { kind: "node" } | { kind: "error", message: string }} Runtime
 */

/**
 * Which interpreter runs the entry, given what `.runtime` asked for, whether a
 * bun probe answered, and the Node this launcher is running on.
 *
 * @param {string} requested - the trimmed contents of `.runtime`, "" for none
 * @param {boolean} bunFound
 * @param {string} nodeVersion
 * @param {string} runtimeFile - named in the message when the contents are bad
 * @returns {Runtime}
 */
export function selectRuntime(requested, bunFound, nodeVersion, runtimeFile) {
	const choice = requested === "" ? "auto" : requested;

	if (choice !== "bun" && choice !== "node" && choice !== "auto") {
		return {
			kind: "error",
			message: `${runtimeFile} says "${choice}"; it must say bun or node, or not exist at all.`,
		};
	}

	if (choice === "bun" && !bunFound) {
		return {
			kind: "error",
			message: `${runtimeFile} says bun, but no bun was found on PATH.`,
		};
	}

	if (choice !== "node" && bunFound) {
		return { kind: "bun" };
	}

	if (!meetsNodeFloor(nodeVersion)) {
		return {
			kind: "error",
			message: `needs Node ${NODE_FLOOR} or newer, but this is Node ${nodeVersion}. Upgrade Node, or install bun.`,
		};
	}

	return { kind: "node" };
}

/**
 * @param {string} version
 * @returns {boolean}
 */
function meetsNodeFloor(version) {
	const parts = String(version).split(".");
	const major = Number(parts[0]);
	const minor = Number(parts[1]);

	if (!(Number.isInteger(major) && Number.isInteger(minor))) {
		return false;
	}

	return (
		major > NODE_FLOOR_MAJOR ||
		(major === NODE_FLOOR_MAJOR && minor >= NODE_FLOOR_MINOR)
	);
}
