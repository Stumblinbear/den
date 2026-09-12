// Messages into a Claude Code session's own inbox.
//
// A session binds an inbox and names it, with a token, in the environment of
// every hook and command it runs. What is posted there reaches the session as
// a message from another session: a turn of its own when the session is idle,
// read between tool calls when it is busy. The inbox, the two variables, the
// token line and the rule that delivers a hook's own message are documented
// at https://code.claude.com/docs/en/cross-session-messaging. The frame is
// not: it is the one Claude Code 2.1.269 sends and accepted from a hook of
// its own, so a Claude Code release can change it under this file.
//
// * `inboxAddress` is the address a hook was handed, where it has one
// * `post` puts one message into it
// * `SENDER` is the name a posted message arrives under
//
// The wire is newline-delimited JSON: the token first, then one frame per
// message. Claude Code closes a connection that has sent no complete line
// within thirty seconds, and on Windows one whose first line is not the
// token.
import { randomUUID } from "node:crypto";
import { connect, type Socket } from "node:net";

/** The environment variable naming the session's inbox. */
export const SOCKET_VARIABLE = "CLAUDE_CODE_MESSAGING_SOCKET";

/** The environment variable carrying the session's token. */
export const TOKEN_VARIABLE = "CLAUDE_CODE_MESSAGING_TOKEN";

/**
 * The name a posted message arrives under, which the session shows the user
 * in its preview line: `Message from @context-budget: ...`.
 */
export const SENDER = "context-budget";

/** The protocol version a user frame carries in `msgV`. */
const FRAME_VERSION = 1;

/**
 * How long after the write the sender waits before half-closing, the wait
 * Claude Code's own sender takes.
 */
const HALF_CLOSE_MS = 150;

/**
 * How long a connection may sit silent before the post is given up. A post is
 * a local connect and two short lines, so a second of silence is already a
 * session that is not reading; five leaves room for a loaded machine.
 */
const SILENCE_BOUND_MS = 5_000;

/** A session's inbox: where it listens, and the token it accepts. */
export interface Address {
	/** The socket path, or named pipe, the session listens on. */
	readonly socket: string;
	/** The token the first line of a connection carries. */
	readonly token: string;
}

/**
 * The address the environment names, or null where either variable is absent
 * or empty.
 */
export function inboxAddress(
	env: Readonly<Record<string, string | undefined>>,
): Address | null {
	const socket = env[SOCKET_VARIABLE];
	const token = env[TOKEN_VARIABLE];

	if (!socket || !token) {
		return null;
	}

	return { socket, token };
}

/**
 * Posts one message to the inbox.
 *
 * @remarks
 * True is the flush: the auth line and the message frame reached the session,
 * whatever the session then does with them. False is a connection or a write
 * that failed, or a connection that sat silent past `SILENCE_BOUND_MS`. The
 * promise never rejects.
 *
 * True is the flush and not the session's close because a Windows named pipe
 * has no half-close: Node reports the connection closed on its own a moment
 * after the sender's end, whatever the session did, so a close there says
 * nothing about delivery, while on a Unix socket it would wait for the
 * session. The flush is what both transports report.
 *
 * The sender half-closes and lets the socket go a moment after the promise
 * resolves, so the call outlives its own result.
 */
export function post(address: Address, text: string): Promise<boolean> {
	const payload = [authLine(address), userFrame(address, text)]
		.map((frame) => `${JSON.stringify(frame)}\n`)
		.join("");

	return new Promise((resolve) => {
		const connection = connect({ path: address.socket });
		let settled = false;

		const settle = (outcome: boolean): void => {
			if (!settled) {
				settled = true;
				resolve(outcome);
			}
		};
		const fail = (): void => {
			settle(false);
			connection.destroy();
		};

		connection.setTimeout(SILENCE_BOUND_MS, fail);
		connection.on("error", fail);
		connection.on("close", () => settle(false));
		connection.on("connect", () => {
			connection.write(payload, (error?: Error | null) => {
				if (error !== null && error !== undefined) {
					fail();

					return;
				}

				settle(true);
				setTimeout(() => halfClose(connection), HALF_CLOSE_MS);
			});
		});
	});
}

/**
 * Ends the sender's side and lets the socket go once that end completes, so a
 * process with nothing else to do is not held open by it.
 */
function halfClose(connection: Socket): void {
	if (connection.destroyed) {
		return;
	}

	connection.end(() => connection.destroy());
}

const authLine = (address: Address): Record<string, unknown> => ({
	type: "auth",
	token: address.token,
});

/**
 * The frame that carries the message, with `from` the reply address the
 * receiving Claude is handed: the session's own inbox, the one address this
 * process has. Claude Code refuses a message a session addresses to itself,
 * so a reply never lands, and the message text says none is needed.
 */
const userFrame = (
	address: Address,
	text: string,
): Record<string, unknown> => ({
	msgV: FRAME_VERSION,
	msg_id: randomUUID(),
	type: "user",
	message: { role: "user", content: wrapped(address, text) },
	priority: "next",
	from: replyAddress(address),
});

const replyAddress = (address: Address): string => `uds:${address.socket}`;

/**
 * The text inside the wrapper a relayed message arrives in, carrying the
 * reply address and the sender's name as attributes.
 */
const wrapped = (address: Address, text: string): string =>
	[
		`<cross-session-message from="${attribute(replyAddress(address))}" from-name="${attribute(SENDER)}">`,
		text,
		"</cross-session-message>",
	].join("\n");

/** An attribute value with the characters that would end it taken out. */
const attribute = (value: string): string => value.replace(/["<>\n\r]/g, "");
