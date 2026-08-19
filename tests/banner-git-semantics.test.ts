import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	parseLeftRightCount,
	parsePorcelainV1Z,
	renderGitBannerRows,
	GitBannerController,
	probeGitBanner,
	type GitBannerSnapshot,
	type ProcessCommand,
	type ProcessResult,
	type ProcessRunner,
} from "../ein-pi/agent/lib/banner-git";

const snapshot = (overrides: Partial<GitBannerSnapshot> = {}): GitBannerSnapshot => ({
	head: { kind: "branch", name: "main" },
	worktree: { kind: "clean", entries: 0 },
	upstream: {
		kind: "tracked",
		trackingRef: "origin/main",
		relation: { kind: "equal", ahead: 0, behind: 0 },
		basis: "local-tracking-ref",
		remote: { kind: "unchecked" },
	},
	generation: 1,
	...overrides,
});

describe("parsePorcelainV1Z", () => {
	test.each([
		["empty", "", { kind: "clean", entries: 0 }],
		["staged", "M  file.ts\0", { kind: "changes", entries: 1, staged: 1, unstaged: 0, untracked: 0 }],
		["unstaged", " M file.ts\0", { kind: "changes", entries: 1, staged: 0, unstaged: 1, untracked: 0 }],
		["untracked", "?? file.ts\0", { kind: "changes", entries: 1, staged: 0, unstaged: 0, untracked: 1 }],
		["mixed", "MM file.ts\0?? new.ts\0", { kind: "changes", entries: 2, staged: 1, unstaged: 1, untracked: 1 }],
		["rename", "R  new.ts\0old.ts\0", { kind: "changes", entries: 1, staged: 1, unstaged: 0, untracked: 0 }],
		["copy", "C  new.ts\0old.ts\0", { kind: "changes", entries: 1, staged: 1, unstaged: 0, untracked: 0 }],
		["renamed then modified", "RM new.ts\0old.ts\0", { kind: "changes", entries: 1, staged: 1, unstaged: 1, untracked: 0 }],
	] as const)("classifies %s logical record", (_name, input, expected) => {
		expect(parsePorcelainV1Z(input)).toEqual(expected);
	});

	test.each(["M  incomplete", "Z  file.ts\0", "R  new.ts\0", "M  \0", "   file.ts\0"])(
		"rejects malformed input %#",
		(input) => {
			expect(parsePorcelainV1Z(input)).toEqual({ kind: "unavailable", reason: "invalid-porcelain" });
		},
	);

	test("keeps MM + ?? as two logical entries despite three category hits", () => {
		const worktree = parsePorcelainV1Z("MM changed.ts\0?? new.ts\0");
		expect(worktree).toEqual({ kind: "changes", entries: 2, staged: 1, unstaged: 1, untracked: 1 });
	});
});

describe("parseLeftRightCount", () => {
	test.each([
		["0 0", { kind: "equal", ahead: 0, behind: 0 }],
		["2 0", { kind: "ahead", ahead: 2, behind: 0 }],
		["0 3", { kind: "behind", ahead: 0, behind: 3 }],
		["2 3", { kind: "diverged", ahead: 2, behind: 3 }],
	] as const)("maps %s", (input, expected) => {
		expect(parseLeftRightCount(input)).toEqual(expected);
	});

	test.each(["", "2", "2 -1", "2 3 extra"])("rejects invalid counts %#", (input) => {
		expect(parseLeftRightCount(input)).toBeNull();
	});
});

describe("renderGitBannerRows", () => {
	test.each([
		["es", 80, "preparados 1 · sin preparar 1 · sin seguimiento 1", "ref local divergida: delante 2 · detrás 3 commits"],
		["en", 80, "staged 1 · unstaged 1 · untracked 1", "local ref: ahead 2 · behind 3 commits"],
		["es", 60, "preparados 1 · sin preparar 1 · sin seguimiento 1", "ref local divergida: delante 2 · detrás 3 commits"],
		["en", 60, "staged 1 · unstaged 1 · untracked 1", "local ref: ahead 2 · behind 3 commits"],
		["es", 40, "2 entradas locales", "ref local: delante 2 commits ↵ detrás 3 commits"],
		["en", 40, "2 local entries", "local ref: ahead 2 commits ↵ behind 3 commits"],
	] as const)("renders explicit rows at %s/%d", (lang, width, local, upstream) => {
		const rows = renderGitBannerRows(
			snapshot({
				worktree: { kind: "changes", entries: 2, staged: 1, unstaged: 1, untracked: 1 },
				upstream: {
					kind: "tracked",
					trackingRef: "origin/main",
					relation: { kind: "diverged", ahead: 2, behind: 3 },
					basis: "local-tracking-ref",
					remote: { kind: "unchecked" },
				},
			}),
			lang,
			width,
		);
		expect(rows).toEqual([
			{ label: "HEAD", value: lang === "es" ? "rama main" : "branch main" },
			{ label: "LOCAL", value: local },
			{ label: "UPSTREAM", value: upstream },
		]);
		expect(rows.map((row) => row.value).join(" ")).not.toMatch(/[○]|\bpull\b/i);
	});

	test("hides stale local counts when the server changed", () => {
		const rows = renderGitBannerRows(
			snapshot({
				upstream: {
					kind: "tracked",
					trackingRef: "origin/main",
					relation: { kind: "diverged", ahead: 2, behind: 3 },
					basis: "local-tracking-ref",
					remote: { kind: "server-changed-counts-unavailable", checkedAt: 0 },
				},
			}),
			"en",
			80,
		);
		expect(rows).toContainEqual({ label: "UPSTREAM", value: "server changed · counts unavailable" });
		expect(rows.map((row) => row.value).join(" ")).not.toMatch(/ahead|behind|diverged/i);
	});

	test("keeps no-upstream and detached explicit", () => {
		expect(renderGitBannerRows(snapshot({ upstream: { kind: "no-upstream" } }), "en", 80)).toContainEqual({
			label: "UPSTREAM",
			value: "no upstream (local branch)",
		});
		expect(
			renderGitBannerRows(
				snapshot({ head: { kind: "detached", shortOid: "a1b2c3d" }, upstream: { kind: "detached" } }),
				"en",
				60,
			),
		).toEqual([
			{ label: "HEAD", value: "detached HEAD" },
			{ label: "LOCAL", value: "local clean" },
			{ label: "UPSTREAM", value: "not applicable: detached HEAD" },
		]);
	});

	test.each([
		["es", 80],
		["en", 80],
		["es", 60],
		["en", 60],
		["es", 40],
		["en", 40],
	] as const)("covers the final local and upstream matrix at %s/%d", (lang, width) => {
		const es = lang === "es";
		const narrow = width < 52;
		const valueFor = (upstream: GitBannerSnapshot["upstream"]): string =>
			renderGitBannerRows(snapshot({ upstream }), lang, width).find((row) => row.label === "UPSTREAM")!.value;
		const oneLocalEntry = es ? "1 entradas locales" : "1 local entries";
		const localCases = [
			[{ kind: "clean", entries: 0 } as const, narrow ? (es ? "limpio" : "clean") : (es ? "local limpio" : "local clean")],
			[{ kind: "changes", entries: 1, staged: 1, unstaged: 0, untracked: 0 } as const, narrow ? oneLocalEntry : (es ? "preparados 1" : "staged 1")],
			[{ kind: "changes", entries: 1, staged: 0, unstaged: 1, untracked: 0 } as const, narrow ? oneLocalEntry : (es ? "sin preparar 1" : "unstaged 1")],
			[{ kind: "changes", entries: 1, staged: 0, unstaged: 0, untracked: 1 } as const, narrow ? oneLocalEntry : (es ? "sin seguimiento 1" : "untracked 1")],
			[{ kind: "changes", entries: 2, staged: 1, unstaged: 1, untracked: 1 } as const, narrow ? (es ? "2 entradas locales" : "2 local entries") : (es ? "preparados 1 · sin preparar 1 · sin seguimiento 1" : "staged 1 · unstaged 1 · untracked 1")],
			[{ kind: "changes", entries: 1, staged: 1, unstaged: 0, untracked: 0 } as const, narrow ? oneLocalEntry : (es ? "preparados 1" : "staged 1")],
		] as const;
		for (const [worktree, expected] of localCases) {
			expect(renderGitBannerRows(snapshot({ worktree }), lang, width).find((row) => row.label === "LOCAL")?.value).toBe(expected);
		}

		const ref = es ? "ref local" : "local ref";
		const upstreamCases: Array<[GitBannerSnapshot["upstream"], string]> = [
			[{ kind: "tracked", trackingRef: "origin/main", relation: { kind: "equal", ahead: 0, behind: 0 }, basis: "local-tracking-ref", remote: { kind: "matches-tracking-ref", checkedAt: 1 } }, width >= 80 ? (es ? "igual · ref local comprobada" : "equal · local ref checked") : (es ? "ref local: igual" : "local ref: equal")],
			[{ kind: "tracked", trackingRef: "origin/main", relation: { kind: "equal", ahead: 0, behind: 0 }, basis: "local-tracking-ref", remote: { kind: "unchecked" } }, width >= 80 ? (es ? "igual · ref local, puede estar obsoleta" : "equal · local ref may be stale") : (es ? "ref local posiblemente obsoleta" : "local ref may be stale")],
			[{ kind: "tracked", trackingRef: "origin/main", relation: { kind: "ahead", ahead: 2, behind: 0 }, basis: "local-tracking-ref", remote: { kind: "unchecked" } }, `${ref}: ${es ? "delante" : "ahead"} 2 commits`],
			[{ kind: "tracked", trackingRef: "origin/main", relation: { kind: "behind", ahead: 0, behind: 3 }, basis: "local-tracking-ref", remote: { kind: "unchecked" } }, `${ref}: ${es ? "detrás" : "behind"} 3 commits`],
			[{ kind: "tracked", trackingRef: "origin/main", relation: { kind: "diverged", ahead: 2, behind: 3 }, basis: "local-tracking-ref", remote: { kind: "unchecked" } }, narrow ? `${ref}: ${es ? "delante" : "ahead"} 2 commits ↵ ${es ? "detrás" : "behind"} 3 commits` : es ? "ref local divergida: delante 2 · detrás 3 commits" : "local ref: ahead 2 · behind 3 commits"],
			[{ kind: "no-upstream" }, width >= 80 ? (es ? "sin upstream (rama local)" : "no upstream (local branch)") : (es ? "sin upstream" : "no upstream")],
			[{ kind: "detached" }, narrow ? (es ? "HEAD separado" : "detached HEAD") : (es ? "no aplica: HEAD separado" : "not applicable: detached HEAD")],
			[{ kind: "loading" }, narrow ? (es ? "cargando" : "loading") : (es ? "upstream cargando" : "upstream loading")],
			[{ kind: "uncomputable", reason: "ancestry-error" }, narrow ? (es ? "no calculable" : "uncomputable") : (es ? "relación no calculable" : "relation uncomputable")],
			[{ kind: "tracked", trackingRef: "origin/main", relation: { kind: "ahead", ahead: 2, behind: 0 }, basis: "local-tracking-ref", remote: { kind: "offline", checkedAt: 1, evidence: "dns" } }, `${es ? "sin conexión" : "offline"} · ${ref}: ${es ? "delante" : "ahead"} 2 commits`],
			[{ kind: "tracked", trackingRef: "origin/main", relation: { kind: "ahead", ahead: 2, behind: 0 }, basis: "local-tracking-ref", remote: { kind: "error", checkedAt: 1, reason: "timeout" } }, narrow ? (es ? "no disponible" : "unavailable") : (es ? "upstream no disponible" : "upstream unavailable")],
			[{ kind: "tracked", trackingRef: "origin/main", relation: { kind: "diverged", ahead: 2, behind: 3 }, basis: "local-tracking-ref", remote: { kind: "server-changed-counts-unavailable", checkedAt: 1 } }, narrow ? (es ? "servidor cambió · sin conteos" : "server changed · no counts") : (es ? "servidor cambió · conteos no disponibles" : "server changed · counts unavailable")],
		];
		for (const [upstream, expected] of upstreamCases) expect(valueFor(upstream)).toBe(expected);
	});
});

const allowedActions = new Set(["rev-parse", "symbolic-ref", "status", "config", "rev-list", "ls-remote"]);

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

class FakeProcessRunner implements ProcessRunner {
	readonly calls: ProcessCommand[] = [];
	private readonly responses = new Map<string, Array<ProcessResult | Promise<ProcessResult>>>();

	respond(args: string[], ...responses: Array<ProcessResult | Promise<ProcessResult>>): void {
		this.responses.set(JSON.stringify(["git", args]), responses);
	}

	async run(command: ProcessCommand): Promise<ProcessResult> {
		expect(command.file).toBe("git");
		expect(allowedActions.has(command.args[0] ?? "")).toBe(true);
		this.calls.push(command);
		const queue = this.responses.get(JSON.stringify([command.file, command.args]));
		if (!queue?.length) throw new Error(`Unexpected Git command: ${command.args.join(" ")}`);
		return queue.shift()!;
	}
}

const ok = (stdout: string): ProcessResult => ({ stdout, stderr: "", exitCode: 0 });
const fail = (stderr: string, cause?: ProcessResult["cause"]): ProcessResult => ({ stdout: "", stderr, exitCode: 1, cause });

function seedTrackedRunner(remoteResult: ProcessResult | Promise<ProcessResult> = ok("a".repeat(40) + "\trefs/heads/main\n")): FakeProcessRunner {
	const runner = new FakeProcessRunner();
	runner.respond(["rev-parse", "--is-inside-work-tree"], ok("true\n"));
	runner.respond(["symbolic-ref", "--quiet", "--short", "HEAD"], ok("main\n"));
	runner.respond(["status", "--porcelain=v1", "-z", "--untracked-files=all"], ok(" M file.ts\0"));
	runner.respond(["config", "--get", "branch.main.remote"], ok("origin\n"));
	runner.respond(["config", "--get", "branch.main.merge"], ok("refs/heads/main\n"));
	runner.respond(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], ok("origin/main\n"));
	runner.respond(["rev-parse", "--verify", "@{upstream}^{commit}"], ok("a".repeat(40) + "\n"));
	runner.respond(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], ok("2 0\n"));
	runner.respond(["ls-remote", "--exit-code", "origin", "refs/heads/main"], remoteResult);
	return runner;
}

async function drain(jobs: Array<() => void>): Promise<void> {
	for (let index = 0; index < 30; index += 1) {
		jobs.shift()?.();
		await Promise.resolve();
	}
}

describe("probeGitBanner", () => {
	test("publishes the local relation before its deferred server check", async () => {
		const remote = deferred<ProcessResult>();
		const runner = seedTrackedRunner(remote.promise);
		const published: GitBannerSnapshot[] = [];
		const localPublished = deferred<void>();
		const probe = probeGitBanner(runner, "/repo", {
			generation: 7,
			now: () => 123,
			publish: (next) => {
				published.push(next);
				if (next.upstream.kind === "tracked" && next.upstream.remote.kind === "loading") localPublished.resolve();
			},
		});

		await localPublished.promise;
		expect(published.at(-1)?.upstream).toEqual({
			kind: "tracked",
			trackingRef: "origin/main",
			relation: { kind: "ahead", ahead: 2, behind: 0 },
			basis: "local-tracking-ref",
			remote: { kind: "loading" },
		});
		remote.resolve(ok("a".repeat(40) + "\trefs/heads/main\n"));
		await probe;
		expect(published.at(-1)?.upstream).toEqual({
			kind: "tracked",
			trackingRef: "origin/main",
			relation: { kind: "ahead", ahead: 2, behind: 0 },
			basis: "local-tracking-ref",
			remote: { kind: "matches-tracking-ref", checkedAt: 123 },
		});
	});

	test("resolves detached HEAD without reading branch configuration", async () => {
		const runner = new FakeProcessRunner();
		runner.respond(["rev-parse", "--is-inside-work-tree"], ok("true\n"));
		runner.respond(["symbolic-ref", "--quiet", "--short", "HEAD"], fail("detached"));
		runner.respond(["status", "--porcelain=v1", "-z", "--untracked-files=all"], ok(""));
		runner.respond(["rev-parse", "--short", "HEAD"], ok("a1b2c3d\n"));

		const result = await probeGitBanner(runner, "/repo");
		expect(result).toMatchObject({ head: { kind: "detached", shortOid: "a1b2c3d" }, upstream: { kind: "detached" } });
		expect(runner.calls.map((call) => call.args[0])).not.toContain("config");
	});

	test("skips server checks for the local-dot remote", async () => {
		const runner = seedTrackedRunner();
		runner.respond(["config", "--get", "branch.main.remote"], ok(".\n"));
		const result = await probeGitBanner(runner, "/repo");
		expect(result.upstream).toMatchObject({ kind: "tracked", remote: { kind: "unchecked" } });
		expect(runner.calls.map((call) => call.args[0])).not.toContain("ls-remote");
	});

	test.each([
		["timeout is an error", fail("timed out", "timeout"), { kind: "error", checkedAt: 5, reason: "timeout" }],
		["DNS evidence is offline", fail("Could not resolve host: example.test"), { kind: "offline", checkedAt: 5, evidence: "dns" }],
		["server OID mismatch hides local counts", ok("b".repeat(40) + "\trefs/heads/main\n"), { kind: "server-changed-counts-unavailable", checkedAt: 5 }],
	] as const)("%s", async (_name, remoteResult, remote) => {
		const published: GitBannerSnapshot[] = [];
		await probeGitBanner(seedTrackedRunner(remoteResult), "/repo", { generation: 1, now: () => 5, publish: (next) => published.push(next) });
		expect(published.at(-1)?.upstream).toMatchObject({ kind: "tracked", remote });
		if (remote.kind === "server-changed-counts-unavailable") {
			expect(renderGitBannerRows(published.at(-1)!, "en", 80).at(-1)?.value).toBe("server changed · counts unavailable");
		}
	});
});

const bannerSource = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/ein-banner.ts"), "utf8");

describe("ein-banner Git adapter", () => {
	test("wires the cached bilingual semantic rows without legacy Git probes", () => {
		expect(bannerSource).toContain('import { execFile } from "node:child_process";');
		expect(bannerSource).toContain("new GitBannerController(gitProcessRunner");
		expect(bannerSource).toContain("renderGitBannerRows(gitController.getSnapshot(), gitLang, width)");
		// Las filas de git comparten el lenguaje de la placa: etiqueta gris a la
		// izquierda, valor en concreto, sin `■` amarillo por fila.
		expect(bannerSource).toContain('b.add((index === 0 ? gitRow.label.toUpperCase() : "").padEnd(labelWidth), STRUCTURE);');
		expect(bannerSource).toContain("for (const [index, value] of gitRow.value.split(\" ↵ \").entries())");
		expect(bannerSource).not.toContain("computeGitSync");
		expect(bannerSource).not.toContain("sync?");
		expect(bannerSource).not.toContain("○");
		expect(bannerSource).not.toContain("pull (remoto adelante)");
	});

	test("emits semantic rows through the actual full/minimal branches and skips below 40 columns", () => {
		const renderBody = bannerSource.slice(bannerSource.indexOf("render(width: number)"), bannerSource.indexOf("invalidate()"));
		const fullBranch = renderBody.slice(renderBody.indexOf('if (state.mode === "full")'), renderBody.indexOf('if (state.mode === "minimal")'));
		const minimalBranch = renderBody.slice(renderBody.indexOf('if (state.mode === "minimal")'));

		// En modo completo las filas de git entran DENTRO del panel, en su misma
		// rejilla — ese era el arreglo: antes se pintaban aparte y no alineaban.
		// En modo minimo no hay panel, asi que siguen saliendo sueltas.
		expect(fullBranch).toContain("renderGitBannerRows(gitController.getSnapshot(), gitLang, width)");
		expect(fullBranch).toContain("renderPanel(panelData");
		expect(fullBranch).not.toContain("addGitBannerRows()");
		expect(minimalBranch).toContain("addGitBannerRows()");
		for (const cols of [80, 60, 40]) {
			expect(renderGitBannerRows(snapshot(), "en", cols).map((row) => row.label)).toEqual(["HEAD", "LOCAL", "UPSTREAM"]);
		}
		expect(bannerSource).toContain("const MINIMAL_INTRO_MIN_COLS = 40;");
		expect(bannerSource).toContain('if (state.mode === "skip") return [];');
		expect(renderBody.match(/addGitBannerRows\(\)/g)).toHaveLength(1);
		expect(renderBody).not.toMatch(/gitController\.refresh|gitProcessRunner\.run/);
	});

	test("defers refresh, repaints only while active, and preserves the surrounding banner", () => {
		expect(bannerSource).toContain("gitController.refresh(ctx.cwd);");
		expect(bannerSource).toContain("}, 100);");
		expect(bannerSource).toContain("const tui = headerActive ? activeTui : null;");
		expect(bannerSource).toContain("gitController.invalidate();");
		expect(bannerSource).toContain("const FULL_INTRO_MIN_ROWS = 30;");
		// La ruta del proyecto vive en la cabecera del panel, a la derecha de la
		// pestana ESTADO: es contexto, no un dato mas de la lista.
		expect(bannerSource).toContain("right: shortenHome(ctx.cwd)");
		// Apilado: marca, respiro, estado. Las dos columnas existian para que
		// trece filas de logo y veinte de panel no sumaran cuarenta y una; con la
		// marca en tres filas el problema desaparece, y apilar lee en el orden en
		// que se mira.
		expect(bannerSource).toContain("const rows = [...left, [], ...panel];");
		expect(bannerSource).not.toContain("composeColumns");
		expect(bannerSource).toContain('label: index === 0 ? "RECIENTES" : ""');
	});

	test("renders project automatic Cleaner and Architect state in a centered partial row", () => {
		expect(bannerSource).toContain('readProjectAgentControlStatus(ctx.cwd, "cleaner")');
		expect(bannerSource).toContain('readProjectAgentControlStatus(ctx.cwd, "architect")');
		// Cleaner y Architect son dos fichas de la seccion ACTIVO: encendidas en
		// amarillo, apagadas en hueco. Se muestran siempre — saber que existen y
		// estan off es informacion; una rejilla de catorce celdas iguales no.
		expect(bannerSource).toContain('{ text: "cleaner", on: isOn(cleanerLabel) }');
		expect(bannerSource).toContain('{ text: "architect", on: isOn(architectLabel) }');
		expect(bannerSource).toContain('const isOn = (label: string) =>');
		expect(bannerSource).toContain("const cleanerLabel = agentAutomaticParticipationLabel(");

		// La placa tiene cuatro secciones nombradas y ya no reparte un marcador
		// amarillo por fila: el acento vive en el marco y en las pestanas.
		const plate = bannerSource.slice(bannerSource.indexOf("const panelData ="), bannerSource.indexOf("const TONE ="));
		for (const title of ["SISTEMA", "SESION", "REPO"]) expect(plate).toContain(`title: "${title}"`);
		expect(plate).toContain('label: "ACTIVO"');
		expect(plate).not.toContain('b.add("▏ ", YELLOW)');
	});
});

describe("GitBannerController", () => {
	test("defers refresh, serves cached loading snapshots, and coalesces repaint callbacks", async () => {
		const jobs: Array<() => void> = [];
		const runner = seedTrackedRunner();
		let refreshes = 0;
		const controller = new GitBannerController(runner, { defer: (job) => jobs.push(job), now: () => 9, onRefresh: () => refreshes += 1 });

		expect(controller.getSnapshot()).toEqual({ head: { kind: "loading" }, worktree: { kind: "loading" }, upstream: { kind: "loading" }, generation: 0 });
		expect(runner.calls).toHaveLength(0);
		controller.refresh("/repo");
		expect(runner.calls).toHaveLength(0);
		expect(renderGitBannerRows(controller.getSnapshot(), "en", 80)).toHaveLength(3);
		expect(runner.calls).toHaveLength(0);
		await drain(jobs);
		expect(controller.getSnapshot().upstream).toMatchObject({ kind: "tracked", remote: { kind: "matches-tracking-ref", checkedAt: 9 } });
		expect(refreshes).toBe(4);
	});

	test("ignores stale generations and prevents late publication after invalidation", async () => {
		const firstRemote = deferred<ProcessResult>();
		const runner = seedTrackedRunner(firstRemote.promise);
		const jobs: Array<() => void> = [];
		let refreshes = 0;
		const controller = new GitBannerController(runner, { defer: (job) => jobs.push(job), now: () => 4, onRefresh: () => refreshes += 1 });
		controller.refresh("/repo");
		await drain(jobs);
		controller.refresh("/repo");
		await drain(jobs);
		const refreshesBeforeStaleCompletion = refreshes;
		firstRemote.resolve(ok("a".repeat(40) + "\trefs/heads/main\n"));
		await drain(jobs);
		expect(controller.getSnapshot().generation).toBe(2);
		expect(controller.getSnapshot().upstream).toEqual({ kind: "unavailable", reason: "not-repo" });
		expect(refreshes).toBe(refreshesBeforeStaleCompletion);

	});

	test("invalidate suppresses a pending server result and its repaint", async () => {
		const remote = deferred<ProcessResult>();
		const jobs: Array<() => void> = [];
		let refreshes = 0;
		const controller = new GitBannerController(seedTrackedRunner(remote.promise), {
			defer: (job) => jobs.push(job),
			now: () => 4,
			onRefresh: () => refreshes += 1,
		});
		controller.refresh("/repo");
		await drain(jobs);
		const beforeInvalidation = refreshes;
		controller.invalidate();
		remote.resolve(ok("b".repeat(40) + "\trefs/heads/main\n"));
		await drain(jobs);
		expect(controller.getSnapshot().upstream).toMatchObject({ kind: "tracked", remote: { kind: "loading" } });
		expect(refreshes).toBe(beforeInvalidation);
	});
});
