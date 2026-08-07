import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OWNER_KEY = Symbol.for("ein.runtime-test-owner");
const ACTIVE_SIGNAL_NAMES = ["SIGINT", "SIGTERM"] as const;

type Snapshot<T> = { present: boolean; value: T };
type GlobalTarget = Record<PropertyKey, unknown>;

type RegisteredChild = {
	kill?: () => void;
	exited?: Promise<unknown>;
};

type RegisteredResource = {
	close?: () => void | Promise<void>;
	dispose?: () => void | Promise<void>;
	destroy?: () => void | Promise<void>;
};

export type SessionLease = {
	namespace: string;
	sessionsDir: string;
	projectDir: (project: string) => string;
	ensureProjectDir: (project: string) => string;
};

export type RuntimeTestOwnerOptions = {
	activate?: boolean;
};

class AwaitedMutex {
	private tail = Promise.resolve();

	async acquire(): Promise<() => void> {
		let release!: () => void;
		const previous = this.tail;
		this.tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		return release;
	}
}

function ownerSegment(value: string): string {
	const normalized = value.replace(/[^a-zA-Z0-9._-]/g, "-");
	return normalized || "project";
}

export class RuntimeTestOwner {
	readonly root: string;
	readonly runtimeHome: string;
	readonly agentHome: string;
	readonly configHome: string;
	readonly sessionsDir: string;

	private readonly envSnapshots = new Map<string, Snapshot<string | undefined>>();
	private cwdSnapshot?: string;
	private readonly globalSnapshots = new Map<GlobalTarget, Map<PropertyKey, Snapshot<unknown>>>();
	private readonly children = new Set<RegisteredChild>();
	private readonly resources = new Set<RegisteredResource>();
	private readonly leaseMutex = new AwaitedMutex();
	private readonly activeLeases = new Set<string>();
	private pendingLeases = 0;
	private idleWaiters: Array<() => void> = [];
	private sequence = 0;
	private activated = false;
	private disposing = false;
	private disposed = false;
	private disposePromise?: Promise<void>;
	private readonly signalHandlers = new Map<string, () => void>();
	private readonly exitHandler: () => void;

	constructor(options: RuntimeTestOwnerOptions = {}) {
		this.root = mkdtempSync(join(tmpdir(), "ein-runtime-test-owner-"));
		this.agentHome = join(this.root, "agent");
		this.runtimeHome = this.agentHome;
		this.configHome = join(this.root, "ein");
		this.sessionsDir = join(this.agentHome, "sessions");
		mkdirSync(this.sessionsDir, { recursive: true });
		mkdirSync(this.configHome, { recursive: true });
		this.exitHandler = () => this.syncDispose();
		if (options.activate) this.activate();
	}

	activate(): this {
		this.assertLive();
		if (this.activated) return this;
		this.setEnv("EIN_PI_AGENT_HOME", this.agentHome);
		this.setEnv("EIN_PI_CONFIG_HOME", this.configHome);
		this.activated = true;
		for (const signal of ACTIVE_SIGNAL_NAMES) {
			const handler = () => {
				void this.dispose().finally(() => {
					try {
						process.kill(process.pid, signal);
					} catch {
						// The process may already be terminating.
					}
				});
			};
			this.signalHandlers.set(signal, handler);
			process.on(signal, handler);
		}
		process.once("exit", this.exitHandler);
		return this;
	}

	setEnv(key: string, value: string): void {
		this.assertLive();
		this.rememberEnv(key);
		process.env[key] = value;
	}

	deleteEnv(key: string): void {
		this.assertLive();
		this.rememberEnv(key);
		delete process.env[key];
	}

	changeCwd(cwd: string): void {
		this.assertLive();
		if (this.cwdSnapshot === undefined) this.cwdSnapshot = process.cwd();
		process.chdir(cwd);
	}

	setGlobal(target: GlobalTarget, key: PropertyKey, value: unknown): void {
		this.assertLive();
		this.rememberGlobal(target, key);
		target[key] = value;
	}

	registerChild(child: RegisteredChild): () => void {
		this.assertLive();
		this.children.add(child);
		return () => this.children.delete(child);
	}

	registerResource(resource: RegisteredResource): () => void {
		this.assertLive();
		this.resources.add(resource);
		return () => this.resources.delete(resource);
	}

	async withSessionLease<T>(callback: (lease: SessionLease) => T | Promise<T>): Promise<T> {
		this.assertLive();
		this.pendingLeases += 1;
		const release = await this.leaseMutex.acquire();
		this.pendingLeases -= 1;
		if (this.disposing || this.disposed) {
			release();
			this.notifyIdle();
			throw new Error("runtime test owner is disposed");
		}
		const namespace = `${this.root.split("/").at(-1)}-${this.sequence++}-${randomUUID()}`;
		this.activeLeases.add(namespace);
		const projectDir = (project: string): string =>
			join(this.sessionsDir, `${namespace}-${ownerSegment(project)}`);
		const lease: SessionLease = {
			namespace,
			sessionsDir: this.sessionsDir,
			projectDir,
			ensureProjectDir: (project) => {
				const path = projectDir(project);
				mkdirSync(path, { recursive: true });
				return path;
			},
		};
		try {
			return await callback(lease);
		} finally {
			for (const project of this.findOwnedProjectDirs(namespace)) {
				rmSync(project, { recursive: true, force: true });
			}
			this.activeLeases.delete(namespace);
			release();
			this.notifyIdle();
		}
	}

	async dispose(): Promise<void> {
		if (this.disposePromise) return this.disposePromise;
		if (this.disposed) return;
		this.disposePromise = this.disposeInternal();
		return this.disposePromise;
	}

	private async disposeInternal(): Promise<void> {
		this.disposing = true;
		this.detachHandlers();
		await this.waitForIdle();
		await this.closeChildren();
		await this.closeResources();
		this.restoreGlobals();
		this.restoreEnvironment();
		this.restoreCwd();
		this.removeOwnedRoot();
		this.disposed = true;
	}

	private findOwnedProjectDirs(namespace: string): string[] {
		if (!existsSync(this.sessionsDir)) return [];
		const prefix = `${namespace}-`;
		return readdirNames(this.sessionsDir)
			.filter((name) => name.startsWith(prefix))
			.map((name) => join(this.sessionsDir, name));
	}

	private rememberEnv(key: string): void {
		if (this.envSnapshots.has(key)) return;
		const present = Object.prototype.hasOwnProperty.call(process.env, key);
		this.envSnapshots.set(key, { present, value: process.env[key] });
	}

	private rememberGlobal(target: GlobalTarget, key: PropertyKey): void {
		let snapshots = this.globalSnapshots.get(target);
		if (!snapshots) {
			snapshots = new Map();
			this.globalSnapshots.set(target, snapshots);
		}
		if (!snapshots.has(key)) {
			snapshots.set(key, {
				present: Object.prototype.hasOwnProperty.call(target, key),
				value: target[key],
			});
		}
	}

	private async closeChildren(): Promise<void> {
		for (const child of this.children) {
			try {
				child.kill?.();
			} catch {
				// Child may have exited between registration and cleanup.
			}
			try {
				await child.exited;
			} catch {
				// Reaping failures must not skip the remaining owned cleanup.
			}
		}
		this.children.clear();
	}

	private async closeResources(): Promise<void> {
		for (const resource of this.resources) {
			try {
				const close = resource.close ?? resource.dispose ?? resource.destroy;
				await close?.();
			} catch {
				// One resource cannot block cleanup of the remaining owner state.
			}
		}
		this.resources.clear();
	}

	private restoreGlobals(): void {
		for (const [target, snapshots] of this.globalSnapshots) {
			for (const [key, snapshot] of snapshots) {
				if (snapshot.present) target[key] = snapshot.value;
				else delete target[key];
			}
		}
		this.globalSnapshots.clear();
	}

	private restoreEnvironment(): void {
		for (const [key, snapshot] of this.envSnapshots) {
			if (snapshot.present) process.env[key] = snapshot.value;
			else delete process.env[key];
		}
		this.envSnapshots.clear();
	}

	private restoreCwd(): void {
		if (this.cwdSnapshot === undefined) return;
		try {
			process.chdir(this.cwdSnapshot);
		} catch {
			// The original cwd may have been removed by the fixture under test.
		} finally {
			this.cwdSnapshot = undefined;
		}
	}

	private removeOwnedRoot(): void {
		rmSync(this.root, { recursive: true, force: true });
	}

	private detachHandlers(): void {
		for (const [signal, handler] of this.signalHandlers) process.removeListener(signal, handler);
		this.signalHandlers.clear();
		process.removeListener("exit", this.exitHandler);
	}

	private syncDispose(): void {
		if (this.disposed) return;
		this.disposing = true;
		this.detachHandlers();
		for (const child of this.children) {
			try {
				child.kill?.();
			} catch {
				// Best effort only: exit cleanup cannot await a child.
			}
		}
		for (const resource of this.resources) {
			try {
				(resource.close ?? resource.dispose ?? resource.destroy)?.();
			} catch {
				// Keep removing owner paths after a resource failure.
			}
		}
		this.restoreGlobals();
		this.restoreEnvironment();
		this.restoreCwd();
		this.removeOwnedRoot();
		this.disposed = true;
	}

	private notifyIdle(): void {
		if (this.pendingLeases !== 0 || this.activeLeases.size !== 0) return;
		const waiters = this.idleWaiters.splice(0);
		for (const resolve of waiters) resolve();
	}

	private waitForIdle(): Promise<void> {
		if (this.pendingLeases === 0 && this.activeLeases.size === 0) return Promise.resolve();
		return new Promise((resolve) => this.idleWaiters.push(resolve));
	}

	private assertLive(): void {
		if (this.disposed || this.disposing) throw new Error("runtime test owner is disposed");
	}
}

function readdirNames(path: string): string[] {
	try {
		return readdirSync(path);
	} catch {
		return [];
	}
}

export function createRuntimeTestOwner(options: RuntimeTestOwnerOptions = {}): RuntimeTestOwner {
	return new RuntimeTestOwner(options);
}

export function getRuntimeTestOwner(): RuntimeTestOwner {
	const target = globalThis as GlobalTarget;
	const existing = target[OWNER_KEY];
	if (existing instanceof RuntimeTestOwner) {
		existing.activate();
		return existing;
	}
	const owner = createRuntimeTestOwner({ activate: true });
	target[OWNER_KEY] = owner;
	return owner;
}
