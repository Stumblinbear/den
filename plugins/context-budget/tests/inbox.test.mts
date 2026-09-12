// What reaches the wire when a message is posted into a session's inbox, and
// what a post reports when nothing is listening. Each case calls `post`
// against an inbox listening in this process.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	inboxAddress,
	post,
	SENDER,
	SOCKET_VARIABLE,
	TOKEN_VARIABLE,
} from "../lib/inbox.mts";
import { inbox } from "./inbox-fixture.mts";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const parsed = (line: string): Record<string, unknown> =>
	JSON.parse(line) as Record<string, unknown>;

test("the address is the two variables, and none where either is missing", () => {
	const socket = "/tmp/cc-socks/1.sock";
	const token = "5f6de95fbb2f39d380a8dbdd114073e2";

	assert.deepEqual(
		inboxAddress({ [SOCKET_VARIABLE]: socket, [TOKEN_VARIABLE]: token }),
		{ socket, token },
	);
	assert.equal(inboxAddress({ [SOCKET_VARIABLE]: socket }), null);
	assert.equal(inboxAddress({ [TOKEN_VARIABLE]: token }), null);
	assert.equal(
		inboxAddress({ [SOCKET_VARIABLE]: "", [TOKEN_VARIABLE]: token }),
		null,
	);
	assert.equal(inboxAddress({}), null);
});

test("a post is the token line and then the message, as the session reads them", async () => {
	const listening = await inbox();

	try {
		const address = inboxAddress(listening.env);

		assert.ok(address);
		assert.equal(await post(address, "Cache wake 1 of 2"), true);

		const lines = await listening.received(2);

		assert.equal(lines.length, 2, "one auth line and one message line");
		assert.deepEqual(parsed(lines[0] ?? ""), {
			type: "auth",
			token: listening.token,
		});

		const frame = parsed(lines[1] ?? "");
		const from = `uds:${listening.socket}`;

		assert.match(String(frame["msg_id"]), UUID);
		assert.deepEqual(
			{ ...frame, msg_id: "<uuid>" },
			{
				msgV: 1,
				msg_id: "<uuid>",
				type: "user",
				message: {
					role: "user",
					content: `<cross-session-message from="${from}" from-name="${SENDER}">\nCache wake 1 of 2\n</cross-session-message>`,
				},
				priority: "next",
				from,
			},
		);
	} finally {
		await listening.close();
	}
});

test("a body of several lines arrives whole, and each post is its own message", async () => {
	const listening = await inbox();

	try {
		const address = inboxAddress(listening.env);
		const body = "Cache wake 2 of 2: one task still running\nSay how it goes.";

		assert.ok(address);
		assert.equal(await post(address, body), true);
		assert.equal(await post(address, body), true);
		await listening.received(4);

		const connections = listening.connections();

		assert.equal(connections.length, 2, "one connection per post");

		const frames = connections.map((lines) => parsed(lines[1] ?? ""));
		const content = (frame: Record<string, unknown>) =>
			String((frame["message"] as Record<string, unknown>)["content"]);

		for (const frame of frames) {
			assert.ok(
				content(frame).includes(`\n${body}\n`),
				"the body arrived whole, on its own lines",
			);
		}

		assert.notEqual(
			frames[0]?.["msg_id"],
			frames[1]?.["msg_id"],
			"the same text twice is two messages",
		);
	} finally {
		await listening.close();
	}
});

test("true is the flush, not the session's close", async () => {
	const listening = await inbox({ closesAfter: 1_000 });

	try {
		const address = inboxAddress(listening.env);

		assert.ok(address);

		const started = Date.now();

		assert.equal(await post(address, "Cache wake 1 of 2"), true);

		const elapsed = Date.now() - started;

		assert.ok(
			elapsed < 900,
			`resolved true only after ${elapsed} ms, which is the session's close`,
		);
		assert.equal(
			(await listening.received(2)).length,
			2,
			"both lines reached the session",
		);
	} finally {
		await listening.close();
	}
});

test("a session that closes before the sender's half-close still took the post", async () => {
	const listening = await inbox({ closesAfterLines: 2 });

	try {
		const address = inboxAddress(listening.env);

		assert.ok(address);
		assert.equal(await post(address, "Cache wake 1 of 2"), true);
		assert.equal(
			(await listening.received(2)).length,
			2,
			"both lines were received",
		);
	} finally {
		await listening.close();
	}
});

test("nothing listening is false, not a throw", async () => {
	const listening = await inbox();
	const address = inboxAddress(listening.env);

	assert.ok(address);

	// A hook that outlived its session finds the bound path closed.
	await listening.close();

	assert.equal(await post(address, "Cache wake 1 of 2"), false);
});
