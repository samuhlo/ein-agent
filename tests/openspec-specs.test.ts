import { describe, expect, test } from "bun:test";
import {
	OPEN_SPEC_FORMAT,
	digestManifest,
	scenarioIdentity,
	serializeOpenSpec,
} from "../ein-pi/agent/lib/openspec-spec-contract";
import {
	parseOpenSpec,
	parseOpenSpecDelta,
} from "../ein-pi/agent/lib/openspec-spec-parser";
import { evaluateOpenSpecState, planOpenSpecSync, serializeSyncReport } from "../ein-pi/agent/lib/openspec-spec-sync";
import { synchronizeOpenSpecFilesystem } from "../ein-pi/agent/lib/openspec-spec-sync-fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

describe("openspec-spec/v1 contract", () => {
	test("serializes scenarios by stable ID with LF and one final newline", () => {
		const serialized = serializeOpenSpec({ domain: "sdd-lifecycle", scenarios: [{ id: "zeta", title: "Zeta", requirement: "The system MUST retain zeta", given: "a zeta input", when: "it is serialized", then: "it remains zeta" }, { id: "alpha", title: "Alpha", requirement: "The system MUST retain alpha", given: "an alpha input", when: "it is serialized", then: "it remains alpha" }] });
		expect(serialized).toContain("## Scenario: alpha");
		expect(serialized).not.toContain("\r");
	});
	test("uses domain and scenario ID as the stable identity", () => expect(scenarioIdentity("sdd-lifecycle", "close-readiness")).toBe("sdd-lifecycle/close-readiness"));
	test("digests manifests independently of input enumeration order", () => expect(digestManifest([{ path: "b", bytes: new TextEncoder().encode("b") }, { path: "a", bytes: new TextEncoder().encode("a") }])).toBe(digestManifest([{ path: "a", bytes: new TextEncoder().encode("a") }, { path: "b", bytes: new TextEncoder().encode("b") }])));
	test("keeps path and byte boundaries distinct in manifest digests", () => expect(digestManifest([{ path: "ab", bytes: new TextEncoder().encode("c") }])).not.toBe(digestManifest([{ path: "a", bytes: new TextEncoder().encode("bc") }])));
});

describe("strict OpenSpec parsers", () => {
	const scenario = ["### Scenario: close-readiness", "title: Close readiness", "requirement: The system MUST validate current evidence", "Given: a change is ready to close", "When: close readiness is assessed", "Then: stale evidence blocks closure"].join("\n");
	test("parses a canonical spec with CRLF input", () => expect(parseOpenSpec(["# OpenSpec Specification", `format: ${OPEN_SPEC_FORMAT}`, "domain: sdd-lifecycle", "", scenario.replace("###", "##")].join("\r\n")).ok).toBe(true));
	test("parses allowed delta operations", () => expect(parseOpenSpecDelta(["# OpenSpec Delta", "format: openspec-delta/v1", "domain: sdd-lifecycle", "", "## ADDED", scenario].join("\n")).ok).toBe(true));
	test("rejects malformed input", () => expect(parseOpenSpec("# OpenSpec Specification\nformat: openspec-spec/v2\ndomain: sdd-lifecycle\n").ok).toBe(false));
});

describe("deterministic OpenSpec synchronization", () => {
	const encoder = new TextEncoder();
	const alpha = { id: "alpha", title: "Alpha", requirement: "The system MUST retain alpha", given: "an input", when: "it runs", then: "it succeeds" };
	const beta = { ...alpha, id: "beta", title: "Beta" };
	const base = serializeOpenSpec({ domain: "sdd-lifecycle", scenarios: [alpha] });
	const delta = ["# OpenSpec Delta", "format: openspec-delta/v1", "domain: sdd-lifecycle", "", "## ADDED", "### Scenario: beta", "title: Beta", "requirement: The system MUST retain alpha", "Given: an input", "When: it runs", "Then: it succeeds"].join("\n");

	test("plans against the original snapshot and produces stable conflict evidence", () => {
		const plan = planOpenSpecSync("change", [{ path: "specs/sdd-lifecycle/spec.md", bytes: encoder.encode(delta) }], [{ domain: "sdd-lifecycle", bytes: encoder.encode(base) }]);
		expect(plan.state).toBe("synchronized");
		expect(plan.domains[0]?.result?.scenarios).toEqual([alpha, beta]);
		const conflict = planOpenSpecSync("change", [{ path: "specs/sdd-lifecycle/spec.md", bytes: encoder.encode(delta) }], [{ domain: "sdd-lifecycle", bytes: encoder.encode(serializeOpenSpec({ domain: "sdd-lifecycle", scenarios: [alpha, beta] })) }]);
		expect(conflict.state).toBe("conflict");
		expect(conflict.resultSha256).toBe(conflict.baseSha256);
		expect(serializeSyncReport(conflict)).toContain("code=added-existing");
	});

	test("leaves canonical bytes intact when the plan conflicts", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "openspec-conflict-"));
		try {
			await mkdir(join(cwd, "openspec", "changes", "change", "specs", "sdd-lifecycle"), { recursive: true });
			await mkdir(join(cwd, "openspec", "specs", "sdd-lifecycle"), { recursive: true });
			await writeFile(join(cwd, "openspec", "changes", "change", "specs", "sdd-lifecycle", "spec.md"), delta);
			const existing = serializeOpenSpec({ domain: "sdd-lifecycle", scenarios: [alpha, beta] });
			await writeFile(join(cwd, "openspec", "specs", "sdd-lifecycle", "spec.md"), existing);
			const result = await synchronizeOpenSpecFilesystem(cwd, "change");
			expect(result.plan.state).toBe("conflict");
			expect(await readFile(join(cwd, "openspec", "specs", "sdd-lifecycle", "spec.md"), "utf8")).toBe(existing);
			expect(await readFile(join(cwd, "openspec", "changes", "change", "sync-report.md"), "utf8")).toContain("state: conflict");
		} finally { await rm(cwd, { recursive: true, force: true }); }
	});

	test("writes canonical results and report last, then no-ops on matching evidence", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "openspec-sync-"));
		try {
			await mkdir(join(cwd, "openspec", "changes", "change", "specs", "sdd-lifecycle"), { recursive: true });
			await mkdir(join(cwd, "openspec", "specs", "sdd-lifecycle"), { recursive: true });
			await writeFile(join(cwd, "openspec", "changes", "change", "specs", "sdd-lifecycle", "spec.md"), delta);
			await writeFile(join(cwd, "openspec", "specs", "sdd-lifecycle", "spec.md"), base);
			const first = await synchronizeOpenSpecFilesystem(cwd, "change");
			const report = await readFile(join(cwd, "openspec", "changes", "change", "sync-report.md"), "utf8");
			const second = await synchronizeOpenSpecFilesystem(cwd, "change");
			expect(first.changed).toBe(true);
			expect(second.changed).toBe(false);
			expect(await readFile(join(cwd, "openspec", "changes", "change", "sync-report.md"), "utf8")).toBe(report);
		} finally { await rm(cwd, { recursive: true, force: true }); }
	});
});

// =============================================================================
// BLINDAJE -> `synchronized` era INALCANZABLE. `evaluateOpenSpecState` re-derivaba
// el plan sobre los specs YA sincronizados, así que volvía a aplicar el delta y
// producía un conflicto artificial (`ADDED` sobre el escenario que el propio sync
// acababa de insertar). El motor escribía "synchronized" y el router leía
// "pending" para siempre: el ciclo completo nunca cerraba sin `--force`.
// Este test recorre la ruta REAL de punta a punta, que es la que nadie probaba:
// los tests del motor lo ejercitaban aislado y jamás reevaluaban el estado.
// =============================================================================
describe("ciclo completo: sincronizar y luego evaluar", () => {
	const scenario = ["### Scenario: nuevo", "title: Nuevo", "requirement: The system MUST hacer algo", "Given: una entrada", "When: corre", "Then: funciona"].join("\n");
	const delta = ["# OpenSpec Delta", "format: openspec-delta/v1", "domain: sdd-lifecycle", "", "## ADDED", scenario, ""].join("\n");

	async function fixture(): Promise<string> {
		const cwd = await mkdtemp(join(tmpdir(), "openspec-cycle-"));
		await mkdir(join(cwd, "openspec", "changes", "c", "specs", "sdd-lifecycle"), { recursive: true });
		await writeFile(join(cwd, "openspec", "changes", "c", "specs", "sdd-lifecycle", "spec.md"), delta);
		return cwd;
	}

	function state(cwd: string, deltas: { path: string; bytes: Uint8Array }[], bases: { domain: string; bytes: Uint8Array }[], report: string | null) {
		return evaluateOpenSpecState({ declaration: "delta", change: "c", deltas, bases, report });
	}

	test("tras sincronizar, el estado es synchronized (no pending)", async () => {
		const cwd = await fixture();
		try {
			const { plan } = await synchronizeOpenSpecFilesystem(cwd, "c");
			expect(plan.state).toBe("synchronized");
			const deltas = [{ path: "specs/sdd-lifecycle/spec.md", bytes: await readFile(join(cwd, "openspec", "changes", "c", "specs", "sdd-lifecycle", "spec.md")) }];
			const bases = [{ domain: "sdd-lifecycle", bytes: await readFile(join(cwd, "openspec", "specs", "sdd-lifecycle", "spec.md")) }];
			const report = await readFile(join(cwd, "openspec", "changes", "c", "sync-report.md"), "utf8");
			expect(state(cwd, deltas, bases, report)).toBe("synchronized");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	test("si el spec canónico cambia después, vuelve a pending", async () => {
		const cwd = await fixture();
		try {
			await synchronizeOpenSpecFilesystem(cwd, "c");
			const deltas = [{ path: "specs/sdd-lifecycle/spec.md", bytes: await readFile(join(cwd, "openspec", "changes", "c", "specs", "sdd-lifecycle", "spec.md")) }];
			const report = await readFile(join(cwd, "openspec", "changes", "c", "sync-report.md"), "utf8");
			// Alguien edita el spec canónico a mano: el recibo ya no lo describe.
			const tampered = new TextEncoder().encode("# OpenSpec Specification\nformat: openspec-spec/v1\ndomain: sdd-lifecycle\n\n## Scenario: otro\ntitle: Otro\nrequirement: The system MUST otro\nGiven: x\nWhen: y\nThen: z\n");
			expect(state(cwd, deltas, [{ domain: "sdd-lifecycle", bytes: tampered }], report)).toBe("pending");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});

// =============================================================================
// ROLLBACK MULTIDOMINIO
// =============================================================================
// BLINDAJE -> La sincronización sustituye un spec por dominio. Si la SEGUNDA
// sustitución revienta con la primera ya escrita, el repo queda medio
// sincronizado: specs nuevas para un dominio, viejas para otro, y un
// sync-report que no describe ninguno de los dos estados. El rollback existía y
// se había ejercitado a mano, pero sin test quedaba libre de regresionar.
//
// El fallo se inyecta en el mismo punto de llamada en vez de provocar un error
// de disco real: forzarlo de verdad exige permisos o disco lleno —frágil entre
// SO, y como root ni siquiera falla—, mientras que la costura ejercita el
// contrato real ("si una sustitución revienta, las anteriores se restauran")
// de forma determinista. La restauración que corre es la de producción.
// =============================================================================
describe("rollback de sincronización multidominio", () => {
	const scenarioFor = (id: string) => [`### Scenario: ${id}`, `title: ${id}`, `requirement: The system MUST ${id}`, "Given: una entrada", "When: corre", "Then: funciona"].join("\n");
	const deltaFor = (domain: string, id: string) => ["# OpenSpec Delta", "format: openspec-delta/v1", `domain: ${domain}`, "", "## ADDED", scenarioFor(id), ""].join("\n");
	const baseFor = (domain: string, id: string) => ["# OpenSpec Specification", "format: openspec-spec/v1", `domain: ${domain}`, "", scenarioFor(id).replace("###", "##"), ""].join("\n");

	// Dos dominios con base previa. Se procesan alfabéticamente: alpha, luego beta.
	async function twoDomains(): Promise<{ cwd: string; alphaBase: string; betaBase: string }> {
		const cwd = await mkdtemp(join(tmpdir(), "openspec-rollback-"));
		const alphaBase = baseFor("alpha", "viejo-alpha");
		const betaBase = baseFor("beta", "viejo-beta");
		for (const [domain, delta, base] of [["alpha", deltaFor("alpha", "nuevo-alpha"), alphaBase], ["beta", deltaFor("beta", "nuevo-beta"), betaBase]] as const) {
			await mkdir(join(cwd, "openspec", "changes", "c", "specs", domain), { recursive: true });
			await writeFile(join(cwd, "openspec", "changes", "c", "specs", domain, "spec.md"), delta);
			await mkdir(join(cwd, "openspec", "specs", domain), { recursive: true });
			await writeFile(join(cwd, "openspec", "specs", domain, "spec.md"), base);
		}
		return { cwd, alphaBase, betaBase };
	}

	const readSpec = (cwd: string, domain: string) => readFile(join(cwd, "openspec", "specs", domain, "spec.md"), "utf8");

	test("un fallo en la SEGUNDA sustitución restaura la primera", async () => {
		const { cwd, alphaBase, betaBase } = await twoDomains();
		try {
			const seen: string[] = [];
			const boom = synchronizeOpenSpecFilesystem(cwd, "c", {
				replace: async (path, bytes) => {
					seen.push(path);
					if (path.includes(`${sep}beta${sep}`)) throw new Error("disco lleno simulado");
					await writeFile(path, bytes);
				},
			});
			await expect(boom).rejects.toThrow("disco lleno simulado");

			// alpha se había reescrito; debe volver EXACTAMENTE a sus bytes previos.
			expect(await readSpec(cwd, "alpha")).toBe(alphaBase);
			// beta nunca llegó a cambiar.
			expect(await readSpec(cwd, "beta")).toBe(betaBase);
			// Y el informe no se publica: describiría un estado que no ocurrió.
			expect(existsSync(join(cwd, "openspec", "changes", "c", "sync-report.md"))).toBe(false);
			// Prueba de que el orden es el asumido y alpha SÍ se tocó antes de fallar.
			expect(seen.some((p) => p.includes(`${sep}alpha${sep}`))).toBe(true);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	test("un dominio creado durante el run se BORRA al revertir", async () => {
		// Sin base previa, el snapshot es `null`: revertir significa eliminar el
		// fichero, no restaurar bytes. Si esto regresiona, un run fallido deja un
		// spec canónico fantasma que nadie sincronizó.
		const cwd = await mkdtemp(join(tmpdir(), "openspec-rollback-new-"));
		try {
			for (const [domain, id] of [["alpha", "nuevo-alpha"], ["beta", "nuevo-beta"]] as const) {
				await mkdir(join(cwd, "openspec", "changes", "c", "specs", domain), { recursive: true });
				await writeFile(join(cwd, "openspec", "changes", "c", "specs", domain, "spec.md"), deltaFor(domain, id));
			}
			await expect(
				synchronizeOpenSpecFilesystem(cwd, "c", {
					replace: async (path, bytes) => {
						if (path.includes(`${sep}beta${sep}`)) throw new Error("fallo en beta");
						await mkdir(dirname(path), { recursive: true });
						await writeFile(path, bytes);
					},
				}),
			).rejects.toThrow("fallo en beta");
			expect(existsSync(join(cwd, "openspec", "specs", "alpha", "spec.md"))).toBe(false);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	test("si la restauración TAMBIÉN falla, el error lo dice", async () => {
		// El peor caso: el repo queda inconsistente. Lo intolerable no es que
		// pase, es que pase en silencio mientras el error habla de otra cosa.
		const { cwd } = await twoDomains();
		try {
			const failed = synchronizeOpenSpecFilesystem(cwd, "c", {
				replace: async (path, bytes) => {
					if (path.includes(`${sep}beta${sep}`)) throw new Error("fallo original");
					await writeFile(path, bytes);
				},
				restore: async () => { throw new Error("la restauración tampoco pudo"); },
			});
			await expect(failed).rejects.toThrow("fallo original");
			await expect(failed).rejects.toThrow("no se pudo restaurar");
			await expect(failed).rejects.toThrow("sincronizado a medias");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
