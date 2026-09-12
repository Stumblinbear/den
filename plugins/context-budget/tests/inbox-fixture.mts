// A listening inbox for the cases to post into, reached the way a hook
// reaches a real one: the two environment variables and nothing else. It
// binds where the platform binds one, a named pipe on Windows and a socket
// file elsewhere, and keeps every line it is sent.
import { randomUUID } from "node:crypto";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { fixtureDir } from "../../../tests/harness.mts";
import { SOCKET_VARIABLE, TOKEN_VARIABLE } from "../lib/inbox.mts";

/** A listening inbox and the lines it has been sent, as a case drives it. */
export interface Inbox {
	/** The two variables, as a hook's environment carries them. */
	readonly env: Readonly<Record<string, string>>;
	/** The token a connection's first line has to carry. */
	readonly token: string;
	/** The path it listens on, which `from` and the wrapper name. */
	readonly socket: string;
	/** Every line received so far, oldest first, across every connection. */
	lines(): readonly string[];
	/**
	 * The lines once at least `count` have arrived, for a case that has just
	 * posted: a post resolves on its flush, and this side reads the lines a
	 * moment later. Rejects once `RECEIVED_BOUND_MS` passes without them.
	 */
	received(count: number): Promise<readonly string[]>;
	/** The lines of each connection, in the order the connections opened. */
	connections(): readonly (readonly string[])[];
	/** Stops listening. A case that opened one closes it. */
	close(): Promise<void>;
}

/** A path nothing else listens on, in the shape this platform binds. */
function socketPath(): string {
	const name = `den-inbox-${randomUUID().slice(0, 8)}`;

	return process.platform === "win32"
		? `\\\\.\\pipe\\${name}`
		: join(fixtureDir("inbox"), `${name}.sock`);
}

/** When this side closes its end of a connection: the session a case wants. */
export interface InboxOptions {
	/**
	 * How long in milliseconds after the sender's half-close this side waits
	 * before closing its own, which is a session that takes that long to
	 * acknowledge. Zero, the default, closes as soon as the sender has.
	 */
	readonly closesAfter?: number;
	/**
	 * How many lines this side reads before closing its own end without
	 * waiting for the sender's half-close, which is a session that answers
	 * the moment it holds a whole message. Unset, the default, waits for the
	 * sender.
	 */
	readonly closesAfterLines?: number;
}

/** A listening inbox, ready once the promise resolves. */
export function inbox(options: InboxOptions = {}): Promise<Inbox> {
	const socket = socketPath();
	const token = randomUUID().replaceAll("-", "");
	const received: string[][] = [];
	const waiting: Waiter[] = [];

	const arrived = (): void => {
		const all = received.flat();

		for (const waiter of [...waiting]) {
			if (all.length >= waiter.count) {
				waiting.splice(waiting.indexOf(waiter), 1);
				waiter.resolve(all);
			}
		}
	};

	const server = createServer({ allowHalfOpen: true }, (connection) => {
		const lines: string[] = [];

		received.push(lines);
		collect(connection, lines, options, arrived);
	});

	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(socket, () => {
			resolve({
				env: { [SOCKET_VARIABLE]: socket, [TOKEN_VARIABLE]: token },
				token,
				socket,
				lines: () => received.flat(),
				received: (count) => awaited(count, waiting, received, arrived),
				connections: () => received.map((lines) => [...lines]),
				close: () => closed(server),
			});
		});
	});
}

/** One pending `received` call: how many lines it waits for, and its resolve. */
interface Waiter {
	readonly count: number;
	readonly resolve: (lines: readonly string[]) => void;
}

/** How long `received` waits before it rejects. */
const RECEIVED_BOUND_MS = 2_000;

/** The lines once `count` have arrived, and a rejection at the bound. */
function awaited(
	count: number,
	waiting: Waiter[],
	received: readonly (readonly string[])[],
	arrived: () => void,
): Promise<readonly string[]> {
	const promise = new Promise<readonly string[]>((settle, fail) => {
		const timer = setTimeout(() => {
			fail(
				new Error(
					`${count} lines never arrived; ${received.flat().length} did`,
				),
			);
		}, RECEIVED_BOUND_MS);

		waiting.push({
			count,
			resolve: (lines) => {
				clearTimeout(timer);
				settle(lines);
			},
		});
	});

	// The lines may already be in, for a case that posted before it waited.
	arrived();

	return promise;
}

/**
 * Keeps one connection's complete lines as they arrive, and closes this side
 * when the options say it closes.
 */
function collect(
	connection: Socket,
	lines: string[],
	{ closesAfter = 0, closesAfterLines }: InboxOptions,
	arrived: () => void,
): void {
	let pending = "";

	connection.setEncoding("utf8");
	connection.on("data", (chunk: string) => {
		pending += chunk;

		const parts = pending.split("\n");

		pending = parts.pop() ?? "";
		lines.push(...parts);
		arrived();

		if (closesAfterLines !== undefined && lines.length >= closesAfterLines) {
			connection.end();
		}
	});
	connection.on("end", () => {
		if (pending !== "") {
			lines.push(pending);
			arrived();
		}

		if (closesAfterLines !== undefined) {
			// The data handler ends this side once the lines are in.
			return;
		}

		if (closesAfter === 0) {
			connection.end();
		} else {
			setTimeout(() => connection.end(), closesAfter);
		}
	});
	connection.on("error", () => {
		// The sender went away mid-line; what arrived is what the case sees.
	});
}

const closed = (server: Server): Promise<void> =>
	new Promise((resolve) => {
		server.close(() => resolve());
	});
