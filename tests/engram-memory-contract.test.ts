import { describe, expect, test } from "bun:test";

import {
	createEngramTransport,
	type ProcessCapability,
	type ProcessChild,
	type ProcessExit,
	type ProcessStartOptions,
} from "../ein-pi/agent/lib/engram-cli.ts";
import {
	ENGRAM_TIMEOUT_MS,
	RETRIEVAL_BUDGET,
	SAVE_BUDGET,
} from "../ein-pi/agent/lib/memory-contract.ts";

const SEARCH = { query: "accepted design", projectId: "ein-git-abc" };
const SAVE = {
	title: "Decision",
	content: "Use the bounded adapter.",
	type: "decision",
	projectId: "ein-git-abc",
	topic: "sdd/engram-deterministic-contract/design",
};

async function* stream(chunks: Array<Uint8Array | string> = []): AsyncIterable<Uint8Array | string> {
	for (const chunk of chunks) yield chunk;
}

function child(
	{ stdout = [], stderr = [], exit = { code: 0 } }: {
		stdout?: Array<Uint8Array | string>;
		stderr?: Array<Uint8Array | string>;
		exit?: ProcessExit | Promise<ProcessExit>;
	} = {},
	onCancel = () => undefined,
): ProcessChild {
	return {
		stdout: stream(stdout),
		stderr: stream(stderr),
		exited: Promise.resolve(exit),
		cancel: onCancel,
	};
}

function fake(children: ProcessChild[]): { process: ProcessCapability; calls: ProcessStartOptions[] } {
	const calls: ProcessStartOptions[] = [];
	return {
		calls,
		process: {
			start(options) {
				calls.push(options);
				const next = children.shift();
				if (!next) throw new Error("unexpected process start");
				return next;
			},
		},
	};
}

describe("Engram CLI transport", () => {
	test("uses the pinned argument arrays and never enables a shell", async () => {
		const setup = fake([child({ stdout: ["result"] }), child({ stdout: ["saved"] })]);
		const transport = createEngramTransport(setup.process);

		expect((await transport.search(SEARCH)).status).toBe("retrieved");
		expect((await transport.save(SAVE)).status).toBe("saved");
		expect(setup.calls).toEqual([
			{
				command: "engram",
				args: ["search", "accepted design", "--project", "ein-git-abc", "--scope", "project", "--limit", "5"],
				shell: false,
			},
			{
				command: "engram",
				args: [
					"save", "Decision", "Use the bounded adapter.", "--type", "decision",
					"--project", "ein-git-abc", "--scope", "project", "--topic", "sdd/engram-deterministic-contract/design",
				],
				shell: false,
			},
		]);
	});

	test("normalizes zero-exit retrieval to retrieved or empty without notice fabrication", async () => {
		const setup = fake([
			child({ stdout: ["\u001B[33mUpdate available: 1.17\u001B[0m\nresult"] }),
			child({ stdout: ["\u001B[33mUpdate available: 1.17\u001B[0m"] }),
		]);
		const transport = createEngramTransport(setup.process);

		expect(await transport.search(SEARCH)).toMatchObject({ status: "retrieved", reason: "ok", entries: ["result"] });
		expect(await transport.search(SEARCH)).toMatchObject({ status: "empty", reason: "no_results", entries: [] });
	});

	test("accepts a valid save acknowledgement while ignoring an anchored update notice", async () => {
		const setup = fake([
			child({ stdout: ["\u001B[33mUpdate available: 1.17\u001B[0m\nsaved topic"] }),
			child({ stdout: ["\u001B[33mUpdate available: 1.17\u001B[0m"] }),
		]);
		const transport = createEngramTransport(setup.process);
		expect(await transport.save(SAVE)).toMatchObject({ status: "saved", reason: "acknowledged" });
		expect(await transport.save(SAVE)).toMatchObject({ status: "failed", reason: "malformed_output" });
	});

	test("normalizes missing binaries to unavailable and other spawn errors to failed", async () => {
		const missing: ProcessCapability = {
			start() { throw Object.assign(new Error("missing"), { code: "ENOENT" }); },
		};
		const broken: ProcessCapability = { start() { throw new Error("permission denied"); } };

		expect(await createEngramTransport(missing).search(SEARCH)).toMatchObject({ status: "unavailable", reason: "binary_missing" });
		expect(await createEngramTransport(missing).save(SAVE)).toMatchObject({ status: "unavailable", reason: "binary_missing" });
		expect(await createEngramTransport(broken).search(SEARCH)).toMatchObject({ status: "failed", reason: "spawn_error" });
	});

	test("cancels the child at the exact timeout and reports failure without retry", async () => {
		expect(ENGRAM_TIMEOUT_MS).toBe(1_500);
		let cancellations = 0;
		const never = new Promise<ProcessExit>(() => undefined);
		const setup = fake([child({ exit: never }, () => { cancellations += 1; })]);
		const started = Date.now();
		const result = await createEngramTransport(setup.process).search(SEARCH);

		expect(result).toMatchObject({ status: "failed", reason: "timeout" });
		expect(cancellations).toBe(1);
		expect(Date.now() - started).toBeGreaterThanOrEqual(ENGRAM_TIMEOUT_MS - 100);
		expect(setup.calls).toHaveLength(1);
	});

	test("enforces every retrieval and save output cap by cancelling the child", async () => {
		expect(RETRIEVAL_BUDGET).toEqual({ stdoutBytes: 16 * 1024, stderrBytes: 4 * 1024 });
		expect(SAVE_BUDGET).toEqual({ stdoutBytes: 4 * 1024, stderrBytes: 2 * 1024 });
		let cancellations = 0;
		const oversized = (bytes: number) => new Uint8Array(bytes + 1);
		const setup = fake([
			child({ stdout: [oversized(RETRIEVAL_BUDGET.stdoutBytes)] }, () => { cancellations += 1; }),
			child({ stderr: [oversized(RETRIEVAL_BUDGET.stderrBytes)] }, () => { cancellations += 1; }),
			child({ stdout: [oversized(SAVE_BUDGET.stdoutBytes)] }, () => { cancellations += 1; }),
			child({ stderr: [oversized(SAVE_BUDGET.stderrBytes)] }, () => { cancellations += 1; }),
		]);
		const transport = createEngramTransport(setup.process);

		for (const result of [await transport.search(SEARCH), await transport.search(SEARCH), await transport.save(SAVE), await transport.save(SAVE)]) {
			expect(result).toMatchObject({ status: "failed", reason: "output_cap" });
		}
		expect(cancellations).toBe(4);
	});

	test("fails closed for nonzero, malformed, corrupt, and unacknowledged output", async () => {
		const setup = fake([
			child({ exit: { code: 23 } }),
			child({ exit: { code: 5 } }),
			child({ stdout: ["{broken"] }),
			child({ stdout: ["ok\u0000"] }),
			child({ stdout: ["{\"status\":\"unknown\"}"] }),
		]);
		const transport = createEngramTransport(setup.process);

		expect(await transport.search(SEARCH)).toMatchObject({ status: "failed", reason: "nonzero_exit", exitCode: 23 });
		expect(await transport.save(SAVE)).toMatchObject({ status: "failed", reason: "nonzero_exit", exitCode: 5 });
		expect(await transport.search(SEARCH)).toMatchObject({ status: "failed", reason: "malformed_output" });
		expect(await transport.search(SEARCH)).toMatchObject({ status: "failed", reason: "malformed_output" });
		expect(await transport.save(SAVE)).toMatchObject({ status: "failed", reason: "malformed_output" });
	});

	test("normalizes asynchronous process errors without exposing output as success", async () => {
		const setup = fake([child({ exit: { code: null, error: new Error("spawn failed") }, stdout: ["saved"] })]);
		expect(await createEngramTransport(setup.process).save(SAVE)).toMatchObject({
			status: "failed",
			reason: "spawn_error",
		});
	});
});
