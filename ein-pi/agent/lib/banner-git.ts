import type { Lang } from "./lang";

export type HeadState =
	| { kind: "loading" }
	| { kind: "branch"; name: string }
	| { kind: "detached"; shortOid?: string }
	| { kind: "unavailable"; reason: "not-repo" | "git-error" };

export type WorktreeState =
	| { kind: "loading" }
	| { kind: "clean"; entries: 0 }
	| { kind: "changes"; entries: number; staged: number; unstaged: number; untracked: number }
	| { kind: "unavailable"; reason: "git-error" | "invalid-porcelain" };

export type TrackingRelation =
	| { kind: "equal"; ahead: 0; behind: 0 }
	| { kind: "ahead"; ahead: number; behind: 0 }
	| { kind: "behind"; ahead: 0; behind: number }
	| { kind: "diverged"; ahead: number; behind: number };

export type RemoteCheck =
	| { kind: "unchecked" }
	| { kind: "loading" }
	| { kind: "matches-tracking-ref"; checkedAt: number }
	| { kind: "server-changed-counts-unavailable"; checkedAt: number }
	| { kind: "offline"; checkedAt: number; evidence: "dns" | "network-unreachable" }
	| { kind: "error"; checkedAt: number; reason: "timeout" | "auth" | "process" };

export type UpstreamState =
	| { kind: "loading" }
	| { kind: "detached" }
	| { kind: "no-upstream" }
	| { kind: "tracked"; trackingRef: string; relation: TrackingRelation; basis: "local-tracking-ref"; remote: RemoteCheck }
	| { kind: "uncomputable"; reason: "missing-local-object" | "invalid-counts" | "ancestry-error" }
	| { kind: "unavailable"; reason: "not-repo" | "git-error" };

export interface GitBannerSnapshot {
	head: HeadState;
	worktree: WorktreeState;
	upstream: UpstreamState;
	generation: number;
}

export interface GitBannerRow {
	label: "HEAD" | "LOCAL" | "UPSTREAM";
	value: string;
}

const STATUS = new Set([" ", "M", "T", "A", "D", "R", "C", "U"]);

export function parsePorcelainV1Z(output: string): WorktreeState {
	if (output === "") return { kind: "clean", entries: 0 };
	if (!output.endsWith("\0")) return { kind: "unavailable", reason: "invalid-porcelain" };

	const records = output.slice(0, -1).split("\0");
	let entries = 0;
	let staged = 0;
	let unstaged = 0;
	let untracked = 0;

	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (record.length < 4 || record[2] !== " " || record.slice(3) === "") {
			return { kind: "unavailable", reason: "invalid-porcelain" };
		}
		const x = record[0];
		const y = record[1];
		if (x === "?" && y === "?") {
			entries += 1;
			untracked += 1;
			continue;
		}
		if (x === "!" && y === "!") continue;
		if (!STATUS.has(x) || !STATUS.has(y) || (x === " " && y === " ")) {
			return { kind: "unavailable", reason: "invalid-porcelain" };
		}

		if (x !== " ") staged += 1;
		if (y !== " ") unstaged += 1;
		entries += 1;
		if (x === "R" || x === "C" || y === "R" || y === "C") {
			const sourcePath = records[index + 1];
			if (!sourcePath) return { kind: "unavailable", reason: "invalid-porcelain" };
			index += 1;
		}
	}

	return entries === 0
		? { kind: "clean", entries: 0 }
		: { kind: "changes", entries, staged, unstaged, untracked };
}

export function parseLeftRightCount(output: string): TrackingRelation | null {
	const match = /^(\d+)[\t ]+(\d+)\s*$/.exec(output);
	if (!match) return null;
	const ahead = Number(match[1]);
	const behind = Number(match[2]);
	if (!Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) return null;
	if (ahead === 0 && behind === 0) return { kind: "equal", ahead: 0, behind: 0 };
	if (behind === 0) return { kind: "ahead", ahead, behind: 0 };
	if (ahead === 0) return { kind: "behind", ahead: 0, behind };
	return { kind: "diverged", ahead, behind };
}

const copy = (lang: Lang, es: string, en: string): string => (lang === "en" ? en : es);

function renderHead(head: HeadState, lang: Lang, width: number): string {
	if (head.kind === "loading") return copy(lang, "cargando", "loading");
	if (head.kind === "unavailable") return copy(lang, "no disponible", "unavailable");
	if (head.kind === "detached") {
		if (width >= 80 && head.shortOid) return copy(lang, `HEAD separado ${head.shortOid}`, `detached HEAD ${head.shortOid}`);
		return copy(lang, "HEAD separado", "detached HEAD");
	}
	const name = width < 52 && head.name.length > 20 ? `${head.name.slice(0, 19)}…` : head.name;
	return copy(lang, `rama ${name}`, `branch ${name}`);
}

function renderWorktree(worktree: WorktreeState, lang: Lang, width: number): string {
	if (worktree.kind === "loading") return copy(lang, "cargando", "loading");
	if (worktree.kind === "unavailable") return copy(lang, "no disponible", "unavailable");
	if (worktree.kind === "clean") return width < 52 ? copy(lang, "limpio", "clean") : copy(lang, "local limpio", "local clean");
	if (width < 52) return copy(lang, `${worktree.entries} entradas locales`, `${worktree.entries} local entries`);
	const parts = [
		worktree.staged > 0 && copy(lang, `preparados ${worktree.staged}`, `staged ${worktree.staged}`),
		worktree.unstaged > 0 && copy(lang, `sin preparar ${worktree.unstaged}`, `unstaged ${worktree.unstaged}`),
		worktree.untracked > 0 && copy(lang, `sin seguimiento ${worktree.untracked}`, `untracked ${worktree.untracked}`),
	].filter((part): part is string => Boolean(part));
	return parts.join(" · ") || copy(lang, "local limpio", "local clean");
}

function renderRelation(relation: TrackingRelation, lang: Lang, width: number): string {
	const ref = copy(lang, "ref local", "local ref");
	if (relation.kind === "equal") return width >= 80 ? copy(lang, "igual · ref local, puede estar obsoleta", "equal · local ref may be stale") : copy(lang, "ref local posiblemente obsoleta", "local ref may be stale");
	if (relation.kind === "ahead") return copy(lang, `${ref}: delante ${relation.ahead} commits`, `${ref}: ahead ${relation.ahead} commits`);
	if (relation.kind === "behind") return copy(lang, `${ref}: detrás ${relation.behind} commits`, `${ref}: behind ${relation.behind} commits`);
	return width < 52
		? copy(lang, `${ref}: delante ${relation.ahead} commits ↵ detrás ${relation.behind} commits`, `${ref}: ahead ${relation.ahead} commits ↵ behind ${relation.behind} commits`)
		: copy(lang, `${ref} divergida: delante ${relation.ahead} · detrás ${relation.behind} commits`, `${ref}: ahead ${relation.ahead} · behind ${relation.behind} commits`);
}

function renderUpstream(upstream: UpstreamState, lang: Lang, width: number): string {
	if (upstream.kind === "loading") return width < 52 ? copy(lang, "cargando", "loading") : copy(lang, "upstream cargando", "upstream loading");
	if (upstream.kind === "detached") return width < 52 ? copy(lang, "HEAD separado", "detached HEAD") : copy(lang, "no aplica: HEAD separado", "not applicable: detached HEAD");
	if (upstream.kind === "no-upstream") return width >= 80 ? copy(lang, "sin upstream (rama local)", "no upstream (local branch)") : copy(lang, "sin upstream", "no upstream");
	if (upstream.kind === "uncomputable") return width < 52 ? copy(lang, "no calculable", "uncomputable") : copy(lang, "relación no calculable", "relation uncomputable");
	if (upstream.kind === "unavailable") return width < 52 ? copy(lang, "no disponible", "unavailable") : copy(lang, "upstream no disponible", "upstream unavailable");
	if (upstream.remote.kind === "server-changed-counts-unavailable") {
		return width < 52 ? copy(lang, "servidor cambió · sin conteos", "server changed · no counts") : copy(lang, "servidor cambió · conteos no disponibles", "server changed · counts unavailable");
	}
	if (upstream.remote.kind === "error") return width < 52 ? copy(lang, "no disponible", "unavailable") : copy(lang, "upstream no disponible", "upstream unavailable");
	const relation = renderRelation(upstream.relation, lang, width);
	if (upstream.remote.kind === "offline") return copy(lang, `sin conexión · ${relation}`, `offline · ${relation}`);
	if (upstream.relation.kind === "equal" && upstream.remote.kind === "matches-tracking-ref") {
		return width >= 80 ? copy(lang, "igual · ref local comprobada", "equal · local ref checked") : copy(lang, "ref local: igual", "local ref: equal");
	}
	return relation;
}

export function renderGitBannerRows(snapshot: GitBannerSnapshot, lang: Lang, width: number): GitBannerRow[] {
	if (width < 40) return [];
	return [
		{ label: "HEAD", value: renderHead(snapshot.head, lang, width) },
		{ label: "LOCAL", value: renderWorktree(snapshot.worktree, lang, width) },
		{ label: "UPSTREAM", value: renderUpstream(snapshot.upstream, lang, width) },
	];
}

export interface ProcessCommand {
	file: "git";
	args: string[];
	cwd: string;
	timeout: number;
}

export interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	cause?: "timeout";
}

export interface ProcessRunner {
	run(command: ProcessCommand): Promise<ProcessResult>;
}

export interface ProbeOptions {
	generation?: number;
	now?: () => number;
	publish?: (snapshot: GitBannerSnapshot) => void;
}

export interface GitBannerControllerOptions {
	defer?: (work: () => void) => void;
	now?: () => number;
	onRefresh?: () => void;
}

const LOCAL_TIMEOUT_MS = 750;
const REMOTE_TIMEOUT_MS = 4_000;
const allowedGitActions = new Set(["rev-parse", "symbolic-ref", "status", "config", "rev-list", "ls-remote"]);

const loadingSnapshot = (generation: number): GitBannerSnapshot => ({
	head: { kind: "loading" },
	worktree: { kind: "loading" },
	upstream: { kind: "loading" },
	generation,
});

function succeeded(result: ProcessResult): boolean {
	return result.exitCode === 0;
}

function output(result: ProcessResult): string {
	return result.stdout.trim();
}

async function runGit(runner: ProcessRunner, cwd: string, args: string[], timeout: number): Promise<ProcessResult> {
	if (!allowedGitActions.has(args[0] ?? "")) throw new Error("Unsupported Git banner command");
	try {
		return await runner.run({ file: "git", args, cwd, timeout });
	} catch (error) {
		return { stdout: "", stderr: error instanceof Error ? error.message : String(error), exitCode: 1 };
	}
}

function remoteFailure(result: ProcessResult, checkedAt: number): RemoteCheck {
	const evidence = `${result.stderr}\n${result.stdout}`.toLowerCase();
	if (/could not resolve host(?:name)?|temporary failure in name resolution/.test(evidence)) {
		return { kind: "offline", checkedAt, evidence: "dns" };
	}
	if (/network is unreachable/.test(evidence)) return { kind: "offline", checkedAt, evidence: "network-unreachable" };
	if (result.cause === "timeout" || /timed? out/.test(evidence)) return { kind: "error", checkedAt, reason: "timeout" };
	if (/auth|permission denied|access denied/.test(evidence)) return { kind: "error", checkedAt, reason: "auth" };
	return { kind: "error", checkedAt, reason: "process" };
}

function remoteOid(outputText: string): string | null {
	const match = /^([0-9a-f]{40,64})\s/m.exec(outputText);
	return match?.[1]?.toLowerCase() ?? null;
}

export async function probeGitBanner(runner: ProcessRunner, cwd: string, options: ProbeOptions = {}): Promise<GitBannerSnapshot> {
	const generation = options.generation ?? 0;
	const now = options.now ?? Date.now;
	let snapshot = loadingSnapshot(generation);
	const publish = (patch: Partial<GitBannerSnapshot>): void => {
		snapshot = { ...snapshot, ...patch, generation };
		options.publish?.(snapshot);
	};

	const repository = await runGit(runner, cwd, ["rev-parse", "--is-inside-work-tree"], LOCAL_TIMEOUT_MS);
	if (!succeeded(repository) || output(repository) !== "true") {
		publish({
			head: { kind: "unavailable", reason: "not-repo" },
			worktree: { kind: "unavailable", reason: "git-error" },
			upstream: { kind: "unavailable", reason: "not-repo" },
		});
		return snapshot;
	}

	const [headResult, statusResult] = await Promise.all([
		runGit(runner, cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"], LOCAL_TIMEOUT_MS),
		runGit(runner, cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], LOCAL_TIMEOUT_MS),
	]);
	const worktree = succeeded(statusResult) ? parsePorcelainV1Z(statusResult.stdout) : { kind: "unavailable", reason: "git-error" } as const;
	publish({ worktree });

	if (!succeeded(headResult)) {
		const detachedResult = await runGit(runner, cwd, ["rev-parse", "--short", "HEAD"], LOCAL_TIMEOUT_MS);
		if (!succeeded(detachedResult)) {
			publish({ head: { kind: "unavailable", reason: "git-error" }, upstream: { kind: "unavailable", reason: "git-error" } });
			return snapshot;
		}
		publish({ head: { kind: "detached", shortOid: output(detachedResult) || undefined }, upstream: { kind: "detached" } });
		return snapshot;
	}

	const branch = output(headResult);
	if (!branch) {
		publish({ head: { kind: "unavailable", reason: "git-error" }, upstream: { kind: "unavailable", reason: "git-error" } });
		return snapshot;
	}
	publish({ head: { kind: "branch", name: branch } });

	const [remoteResult, mergeResult] = await Promise.all([
		runGit(runner, cwd, ["config", "--get", `branch.${branch}.remote`], LOCAL_TIMEOUT_MS),
		runGit(runner, cwd, ["config", "--get", `branch.${branch}.merge`], LOCAL_TIMEOUT_MS),
	]);
	const remote = output(remoteResult);
	const mergeRef = output(mergeResult);
	if (!succeeded(remoteResult) || !succeeded(mergeResult) || !remote || !mergeRef) {
		publish({ upstream: { kind: "no-upstream" } });
		return snapshot;
	}

	const trackingResult = await runGit(runner, cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], LOCAL_TIMEOUT_MS);
	const trackingRef = output(trackingResult);
	if (!succeeded(trackingResult) || !trackingRef) {
		publish({ upstream: { kind: "uncomputable", reason: "missing-local-object" } });
		return snapshot;
	}
	const oidResult = await runGit(runner, cwd, ["rev-parse", "--verify", "@{upstream}^{commit}"], LOCAL_TIMEOUT_MS);
	const trackingOid = output(oidResult).toLowerCase();
	if (!succeeded(oidResult) || !trackingOid) {
		publish({ upstream: { kind: "uncomputable", reason: "missing-local-object" } });
		return snapshot;
	}
	const countsResult = await runGit(runner, cwd, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], LOCAL_TIMEOUT_MS);
	if (!succeeded(countsResult)) {
		publish({ upstream: { kind: "uncomputable", reason: "ancestry-error" } });
		return snapshot;
	}
	const relation = parseLeftRightCount(countsResult.stdout);
	if (!relation) {
		publish({ upstream: { kind: "uncomputable", reason: "invalid-counts" } });
		return snapshot;
	}

	const tracked = (remoteCheck: RemoteCheck): UpstreamState => ({
		kind: "tracked",
		trackingRef,
		relation,
		basis: "local-tracking-ref",
		remote: remoteCheck,
	});
	if (remote === ".") {
		publish({ upstream: tracked({ kind: "unchecked" }) });
		return snapshot;
	}
	publish({ upstream: tracked({ kind: "loading" }) });

	const serverResult = await runGit(runner, cwd, ["ls-remote", "--exit-code", remote, mergeRef], REMOTE_TIMEOUT_MS);
	const checkedAt = now();
	if (!succeeded(serverResult)) {
		publish({ upstream: tracked(remoteFailure(serverResult, checkedAt)) });
		return snapshot;
	}
	const serverOid = remoteOid(serverResult.stdout);
	if (!serverOid) {
		publish({ upstream: tracked({ kind: "error", checkedAt, reason: "process" }) });
		return snapshot;
	}
	publish({
		upstream: tracked(
			serverOid === trackingOid
				? { kind: "matches-tracking-ref", checkedAt }
				: { kind: "server-changed-counts-unavailable", checkedAt },
		),
	});
	return snapshot;
}

export class GitBannerController {
	private snapshot = loadingSnapshot(0);
	private generation = 0;
	private disposed = false;
	private repaintPending = false;
	private readonly defer: (work: () => void) => void;
	private readonly now: () => number;
	private readonly onRefresh: () => void;

	constructor(private readonly runner: ProcessRunner, options: GitBannerControllerOptions = {}) {
		this.defer = options.defer ?? queueMicrotask;
		this.now = options.now ?? Date.now;
		this.onRefresh = options.onRefresh ?? (() => undefined);
	}

	getSnapshot(): GitBannerSnapshot {
		return this.snapshot;
	}

	refresh(cwd: string): void {
		if (this.disposed) return;
		const generation = ++this.generation;
		this.snapshot = loadingSnapshot(generation);
		this.requestRepaint();
		this.defer(() => {
			void probeGitBanner(this.runner, cwd, {
				generation,
				now: this.now,
				publish: (next) => this.publish(generation, next),
			});
		});
	}

	invalidate(): void {
		this.disposed = true;
		this.generation += 1;
	}

	private publish(generation: number, next: GitBannerSnapshot): void {
		if (this.disposed || generation !== this.generation) return;
		this.snapshot = next;
		this.requestRepaint();
	}

	private requestRepaint(): void {
		if (this.repaintPending || this.disposed) return;
		this.repaintPending = true;
		this.defer(() => {
			this.repaintPending = false;
			if (!this.disposed) this.onRefresh();
		});
	}
}
