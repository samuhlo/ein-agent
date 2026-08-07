import { describe, expect, test } from "bun:test";
import {
	closeSync,
	existsSync,
	mkdtempSync,
	openSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_DIR } from "../ein-pi/agent/extensions/ein-paths";
import {
	createRuntimeTestOwner,
	getRuntimeTestOwner,
	type RuntimeTestOwner,
} from "./fixtures/runtime-test-fixture";

const owner = getRuntimeTestOwner();

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function dispose(ownerToDispose: RuntimeTestOwner): Promise<void> {
	await ownerToDispose.dispose();
}

function waitForAbort(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		const onAbort = () => {
			signal.removeEventListener("abort", onAbort);
			reject(new Error("operation cancelled"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
	});
}

async function withTimeout<T>(
	operation: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number,
): Promise<T> {
	const controller = new AbortController();
	const operationPromise = operation(controller.signal);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let timedOut = false;
	try {
		return await Promise.race([
			operationPromise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					timedOut = true;
					controller.abort();
					reject(new Error("operation timed out"));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		if (timedOut) await operationPromise.catch(() => undefined);
	}
}

describe("runtime test fixture owner", () => {
	test("creates unique homes and keeps cached paths coherent", async () => {
		const first = createRuntimeTestOwner();
		const second = createRuntimeTestOwner();
		try {
			expect(first.agentHome).not.toBe(second.agentHome);
			expect(owner.agentHome).toBe(AGENT_DIR);
			expect(owner.sessionsDir).toBe(join(AGENT_DIR, "sessions"));
			expect(owner.agentHome).toBe(owner.runtimeHome);
			const firstRoot = first.root;
			await dispose(first);
			const successor = createRuntimeTestOwner();
			try {
				expect(successor.root).not.toBe(firstRoot);
			} finally {
				await dispose(successor);
			}
		} finally {
			await dispose(first);
			await dispose(second);
		}
	});

	test("restores absent and empty environment values exactly", async () => {
		const key = "EIN_FIXTURE_ABSENT_OR_EMPTY";
		const original = process.env[key];
		const emptyOwner = createRuntimeTestOwner();
		try {
			delete process.env[key];
			emptyOwner.setEnv(key, "");
			expect(process.env[key]).toBe("");
			await dispose(emptyOwner);
			expect(process.env[key]).toBeUndefined();

			process.env[key] = "";
			const absentOwner = createRuntimeTestOwner();
			try {
				absentOwner.setEnv(key, "restored");
				await dispose(absentOwner);
				expect(process.env[key]).toBe("");
			} finally {
				await dispose(absentOwner);
			}
		} finally {
			if (original === undefined) delete process.env[key];
			else process.env[key] = original;
		}
	});

	test("snapshots an environment value at its first mutation boundary", async () => {
		const key = "EIN_FIXTURE_MUTATION_BOUNDARY";
		const original = process.env[key];
		delete process.env[key];
		const created = createRuntimeTestOwner();
		try {
			process.env[key] = "between-construction-and-mutation";
			created.setEnv(key, "owned");
			await dispose(created);
			expect(process.env[key]).toBe("between-construction-and-mutation");
		} finally {
			await dispose(created);
			if (original === undefined) delete process.env[key];
			else process.env[key] = original;
		}
	});

	test("disposes owned resources, paths, cwd, and global values", async () => {
		const originalCwd = process.cwd();
		const cwd = mkdtempSync(join(tmpdir(), "ein-fixture-cwd-"));
		const created = createRuntimeTestOwner();
		const key = Symbol("fixture-global");
		const target = globalThis as Record<symbol, unknown>;
		const originalGlobal = target[key];
		let resourceClosed = false;
		let childKilled = false;
		try {
			created.setGlobal(target, key, "temporary");
			created.changeCwd(cwd);
			created.registerResource({ close: () => { resourceClosed = true; } });
			created.registerChild({ kill: () => { childKilled = true; }, exited: Promise.resolve(0) });
			writeFileSync(join(created.agentHome, "owned.txt"), "owned");
			await dispose(created);
			expect(resourceClosed).toBe(true);
			expect(childKilled).toBe(true);
			expect(process.cwd()).toBe(originalCwd);
			expect(target[key]).toBe(originalGlobal);
			expect(existsSync(created.root)).toBe(false);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
			if (originalGlobal === undefined) delete target[key];
			else target[key] = originalGlobal;
		}
	});

	test("does not claim cwd restoration when the original cwd was removed", async () => {
		const fallbackCwd = process.cwd();
		const originalCwd = mkdtempSync(join(tmpdir(), "ein-fixture-removed-cwd-original-"));
		const activeCwd = mkdtempSync(join(tmpdir(), "ein-fixture-removed-cwd-active-"));
		process.chdir(originalCwd);
		const created = createRuntimeTestOwner();
		try {
			created.changeCwd(activeCwd);
			rmSync(originalCwd, { recursive: true, force: true });
			await dispose(created);
			expect(process.cwd()).toBe(realpathSync(activeCwd));
		} finally {
			process.chdir(fallbackCwd);
			rmSync(originalCwd, { recursive: true, force: true });
			rmSync(activeCwd, { recursive: true, force: true });
		}
	});

	test("leases serialize only session writers and clean a successor namespace", async () => {
		const active: string[] = [];
		let maximum = 0;
		const run = (label: string) => owner.withSessionLease(async (lease) => {
			active.push(label);
			maximum = Math.max(maximum, active.length);
			const project = lease.ensureProjectDir(`project-${label}`);
			writeFileSync(join(project, `${label}.jsonl`), `${label}\n`);
			await Bun.sleep(10);
			active.splice(active.indexOf(label), 1);
		});
		await Promise.all([run("alpha"), run("beta")]);
		expect(maximum).toBe(1);
		expect(active).toEqual([]);
		await owner.withSessionLease(async (lease) => {
			expect(existsSync(lease.projectDir("project-alpha"))).toBe(false);
			expect(existsSync(lease.projectDir("project-beta"))).toBe(false);
		});
	});

	test("unwinds an assertion failure and removes its namespace", async () => {
		await expect(
			owner.withSessionLease(async (lease) => {
				lease.ensureProjectDir("assertion-failure");
				throw new Error("fixture assertion failure");
			}),
		).rejects.toThrow("fixture assertion failure");
		await owner.withSessionLease(async (lease) => {
			expect(existsSync(lease.projectDir("assertion-failure"))).toBe(false);
		});
	});

	test("unwinds fixture setup failure after namespace setup", async () => {
		await expect(
			owner.withSessionLease(async (lease) => {
				const project = lease.ensureProjectDir("setup-failure");
				writeFileSync(join(project, "partial.jsonl"), "partial\n");
				throw new Error("fixture setup failed");
			}),
		).rejects.toThrow("fixture setup failed");
		await owner.withSessionLease(async (lease) => {
			expect(existsSync(lease.projectDir("setup-failure"))).toBe(false);
		});
	});

	test("reaps a real spawned child and closes a registered resource", async () => {
		const created = createRuntimeTestOwner();
		let childExitCode: number | undefined;
		let resourceClosed = false;
		try {
			await expect(
				created.withSessionLease(async (lease) => {
					lease.ensureProjectDir("spawn-failure");
					const child = Bun.spawn(
						[process.execPath, "-e", "process.exit(17)"],
						{ stdout: "ignore", stderr: "ignore" },
					);
					const exited = child.exited.then((code) => {
						childExitCode = code;
						return code;
					});
					created.registerChild({ kill: () => child.kill(), exited });
					const fd = openSync(join(created.root, "registered-resource"), "w");
					created.registerResource({
						close: () => {
							closeSync(fd);
							resourceClosed = true;
						},
					});
					const exitCode = await exited;
					if (exitCode !== 0) throw new Error(`child exited with ${exitCode}`);
				}),
			).rejects.toThrow("child exited with 17");
		} finally {
			await dispose(created);
		}
		expect(childExitCode).toBe(17);
		expect(resourceClosed).toBe(true);
		expect(existsSync(created.root)).toBe(false);
	});

	test("unwinds a real cancellation and timeout with no pending timer", async () => {
		const cancelled = createRuntimeTestOwner();
		const cancellation = new AbortController();
		const cancellationReady = deferred();
		try {
			const operation = cancelled.withSessionLease(async (lease) => {
				lease.ensureProjectDir("cancelled");
				cancellationReady.resolve();
				await waitForAbort(cancellation.signal);
			});
			await cancellationReady.promise;
			cancellation.abort();
			await expect(operation).rejects.toThrow("operation cancelled");
		} finally {
			await dispose(cancelled);
		}

		const timedOut = createRuntimeTestOwner();
		const timeoutReady = deferred();
		try {
			await expect(
				withTimeout(
					(signal) =>
						timedOut.withSessionLease(async (lease) => {
							lease.ensureProjectDir("timed-out");
							timeoutReady.resolve();
							await waitForAbort(signal);
						}),
					5,
				),
			).rejects.toThrow("operation timed out");
			await timeoutReady.promise;
		} finally {
			await dispose(timedOut);
		}
	});

	test("rejects lease and mutation use after disposal", async () => {
		const disposed = createRuntimeTestOwner();
		await dispose(disposed);
		expect(() => disposed.setEnv("EIN_FIXTURE_DISPOSED", "x")).toThrow();
		await expect(disposed.withSessionLease(async () => undefined)).rejects.toThrow();
	});

	test("unrelated fixture work remains eligible while a session lease waits", async () => {
		const gate = deferred();
		let unrelated = false;
		const session = owner.withSessionLease(async () => gate.promise);
		await Promise.resolve();
		unrelated = true;
		gate.resolve();
		await session;
		expect(unrelated).toBe(true);
	});
});
