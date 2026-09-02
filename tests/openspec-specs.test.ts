import { describe, expect, test } from "bun:test";
import {
	OPEN_SPEC_FORMAT,
	digestManifest,
	scenarioIdentity,
	serializeOpenSpec,
} from "../ein-pi/agent/lib/openspec-spec-contract";
import {
	buildOpenSpecDelta,
	parseOpenSpec,
	parseOpenSpecDelta,
	serializeOpenSpecDelta,
} from "../ein-pi/agent/lib/openspec-spec-parser";
import {
	OPEN_SPEC_FORMAT as SHARED_OPEN_SPEC_FORMAT,
	serializeOpenSpec as serializeSharedOpenSpec,
} from "../shared/sdd/openspec-spec-contract.ts";
import {
	parseOpenSpec as parseSharedOpenSpec,
	parseOpenSpecDelta as parseSharedOpenSpecDelta,
} from "../shared/sdd/openspec-spec-parser.ts";
import { evaluateOpenSpecState, parseSyncReport, planOpenSpecSync, serializeSyncReport } from "../ein-pi/agent/lib/openspec-spec-sync";
import {
	evaluateOpenSpecState as evaluateSharedOpenSpecState,
	planOpenSpecSync as planSharedOpenSpecSync,
	serializeSyncReport as serializeSharedSyncReport,
} from "../shared/sdd/openspec-spec-sync.ts";
import { synchronizeOpenSpecFilesystem } from "../ein-pi/agent/lib/openspec-spec-sync-fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

describe("openspec-spec/v1 contract", () => {
	test("el lenguaje compartido conserva exactamente el contrato de Pi", () => {
		const document = { domain: "sdd-lifecycle", scenarios: [{ id: "alpha", title: "Alpha", requirement: "The system MUST retain alpha", given: "an input", when: "it runs", then: "it remains alpha" }] };
		const source = serializeOpenSpec(document);
		expect(SHARED_OPEN_SPEC_FORMAT).toBe(OPEN_SPEC_FORMAT);
		expect(serializeSharedOpenSpec(document)).toBe(source);
		expect(parseSharedOpenSpec(source)).toEqual(parseOpenSpec(source));
	});
	test("las rutas Pi delegan en el mismo dueño compartido", () => {
		expect(serializeOpenSpec).toBe(serializeSharedOpenSpec);
		expect(parseOpenSpec).toBe(parseSharedOpenSpec);
		expect(parseOpenSpecDelta).toBe(parseSharedOpenSpecDelta);
	});
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
	test("el parser compartido conserva los mismos errores de delta", () => {
		const malformed = "# OpenSpec Delta\nformat: openspec-delta/v1\ndomain: Bad Domain\n";
		expect(parseSharedOpenSpecDelta(malformed)).toEqual(parseOpenSpecDelta(malformed));
	});
});

describe("openspec-delta/v1 serializer (P0-A)", () => {
	// Los deltas se escribían a mano y fallaban el parser estricto una y otra vez
	// (churn de scope). El serializador es el inverso determinista de
	// parseOpenSpecDelta: los subagentes emiten {domain, operations[]} y esto
	// escribe el markdown que el parser acepta.
	const doc = {
		domain: "scout-routing",
		operations: [
			{ kind: "REMOVED", scenarioId: "old-route", reason: "superseded by bounded packet" },
			{ kind: "ADDED", scenario: { id: "zeta-route", title: "Zeta", requirement: "The system MUST route zeta", given: "a zeta packet", when: "it is routed", then: "it is bounded" } },
			{ kind: "ADDED", scenario: { id: "alpha-route", title: "Alpha", requirement: "The system MUST route alpha", given: "an alpha packet", when: "it is routed", then: "it is bounded" } },
			{ kind: "MODIFIED", scenario: { id: "mid-route", title: "Mid", requirement: "The system SHOULD adjust mid", given: "a mid packet", when: "it is routed", then: "it is adjusted" } },
		],
	} as const;

	test("produce markdown que el parser estricto acepta", () => {
		expect(parseOpenSpecDelta(serializeOpenSpecDelta(doc)).ok).toBe(true);
	});

	test("emite secciones en orden ADDED, MODIFIED, REMOVED con IDs ordenados, LF y newline final", () => {
		const md = serializeOpenSpecDelta(doc);
		expect(md.indexOf("## ADDED")).toBeLessThan(md.indexOf("## MODIFIED"));
		expect(md.indexOf("## MODIFIED")).toBeLessThan(md.indexOf("## REMOVED"));
		expect(md.indexOf("### Scenario: alpha-route")).toBeLessThan(md.indexOf("### Scenario: zeta-route"));
		expect(md.endsWith("\n")).toBe(true);
		expect(md).not.toContain("\r");
	});

	test("round-trip: parse(serialize(x)) recupera dominio y operaciones", () => {
		const parsed = parseOpenSpecDelta(serializeOpenSpecDelta(doc));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.value.domain).toBe("scout-routing");
		expect(parsed.value.operations.map((o) => o.kind)).toEqual(["ADDED", "ADDED", "MODIFIED", "REMOVED"]);
	});

	test("es determinista sea cual sea el orden de entrada (digest estable)", () => {
		const shuffled = { domain: doc.domain, operations: [doc.operations[1], doc.operations[3], doc.operations[0], doc.operations[2]] };
		expect(serializeOpenSpecDelta(shuffled)).toBe(serializeOpenSpecDelta(doc));
	});

	test("buildOpenSpecDelta valida re-parseando: nunca emite un delta que el sync rechazaría", () => {
		const built = buildOpenSpecDelta(doc);
		expect(built.ok).toBe(true);
		if (!built.ok) return;
		expect(parseOpenSpecDelta(built.value.contents).ok).toBe(true);
	});

	test("buildOpenSpecDelta rechaza requirement mal formado (sin The system MUST/SHOULD/MAY)", () => {
		const bad = { domain: "scout-routing", operations: [{ kind: "ADDED", scenario: { id: "x-route", title: "X", requirement: "should route x", given: "a packet", when: "routed", then: "bounded" } }] } as const;
		expect(buildOpenSpecDelta(bad).ok).toBe(false);
	});

	test("buildOpenSpecDelta rechaza delta sin operaciones", () => {
		expect(buildOpenSpecDelta({ domain: "scout-routing", operations: [] }).ok).toBe(false);
	});
});

describe("deterministic OpenSpec synchronization", () => {
	const encoder = new TextEncoder();
	const alpha = { id: "alpha", title: "Alpha", requirement: "The system MUST retain alpha", given: "an input", when: "it runs", then: "it succeeds" };
	const beta = { ...alpha, id: "beta", title: "Beta" };
	const base = serializeOpenSpec({ domain: "sdd-lifecycle", scenarios: [alpha] });
	const delta = ["# OpenSpec Delta", "format: openspec-delta/v1", "domain: sdd-lifecycle", "", "## ADDED", "### Scenario: beta", "title: Beta", "requirement: The system MUST retain alpha", "Given: an input", "When: it runs", "Then: it succeeds"].join("\n");

	test("Pi y shared exponen el mismo core de sincronización", () => {
		expect(planOpenSpecSync).toBe(planSharedOpenSpecSync);
		expect(serializeSyncReport).toBe(serializeSharedSyncReport);
		expect(evaluateOpenSpecState).toBe(evaluateSharedOpenSpecState);
	});

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

// =============================================================================
// INTEGRIDAD: de dónde viene el cambio y a quién pertenece el recibo
// =============================================================================
// BLINDAJE -> El nombre del cambio llega desde un tool que expone el LLM. Sin
// validarlo se comprobó que:
//   - `../../fuera` escribía sync-report.md FUERA de openspec/changes/;
//   - un nombre cualquiera creaba un cambio fantasma con solo su recibo dentro,
//     es decir un recibo sin trabajo detrás;
//   - un recibo copiado de otro cambio con deltas equivalentes lo daba por
//     sincronizado, que es coincidencia de hashes, no trazabilidad.
// =============================================================================
describe("integridad de la sincronización OpenSpec", () => {
	const scen = ["### Scenario: x", "title: X", "requirement: The system MUST x", "Given: a", "When: b", "Then: c"].join("\n");
	const delta = ["# OpenSpec Delta", "format: openspec-delta/v1", "domain: alpha", "", "## ADDED", scen, ""].join("\n");

	async function conCambio(nombres: readonly string[]): Promise<string> {
		const cwd = await mkdtemp(join(tmpdir(), "openspec-integridad-"));
		for (const n of nombres) {
			await mkdir(join(cwd, "openspec", "changes", n, "specs", "alpha"), { recursive: true });
			await writeFile(join(cwd, "openspec", "changes", n, "specs", "alpha", "spec.md"), delta);
		}
		return cwd;
	}

	test("un nombre con `..` no escapa de openspec/changes/", async () => {
		const cwd = await conCambio([]);
		try {
			await expect(synchronizeOpenSpecFilesystem(cwd, "../../fuera")).rejects.toThrow("nombre de cambio inválido");
			expect(existsSync(join(cwd, "fuera", "sync-report.md"))).toBe(false);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	test("nombres estructuralmente inválidos se rechazan", async () => {
		const cwd = await conCambio([]);
		try {
			for (const malo of ["", "archive", "a/b", "..", "a\\b"]) {
				await expect(synchronizeOpenSpecFilesystem(cwd, malo)).rejects.toThrow("nombre de cambio inválido");
			}
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	test("un cambio inexistente NO se inventa (nada de fantasmas)", async () => {
		const cwd = await conCambio([]);
		try {
			await expect(synchronizeOpenSpecFilesystem(cwd, "fantasma")).rejects.toThrow("no existe");
			// Lo importante: no se crea el directorio ni un recibo sin trabajo detrás.
			expect(existsSync(join(cwd, "openspec", "changes", "fantasma"))).toBe(false);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	test("un recibo de OTRO cambio no sincroniza este", async () => {
		const cwd = await conCambio(["uno", "dos"]);
		try {
			await synchronizeOpenSpecFilesystem(cwd, "uno");
			const recibo = await readFile(join(cwd, "openspec", "changes", "uno", "sync-report.md"), "utf8");
			expect(recibo).toContain("change: uno");
			// Copiado tal cual a 'dos': mismos deltas, mismos hashes, otro dueño.
			await writeFile(join(cwd, "openspec", "changes", "dos", "sync-report.md"), recibo);
			const deltas = [{ path: "specs/alpha/spec.md", bytes: await readFile(join(cwd, "openspec", "changes", "dos", "specs", "alpha", "spec.md")) }];
			const bases = [{ domain: "alpha", bytes: await readFile(join(cwd, "openspec", "specs", "alpha", "spec.md")) }];
			expect(evaluateOpenSpecState({ declaration: "delta", change: "dos", deltas, bases, report: recibo })).toBe("pending");
			// Y el legítimo dueño sigue sincronizado.
			expect(evaluateOpenSpecState({ declaration: "delta", change: "uno", deltas, bases, report: recibo })).toBe("synchronized");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	test("un recibo sin campo `change` es inválido", () => {
		const sinChange = ["# OpenSpec Sync Report", "sync_report_version: 1", "state: synchronized", `delta_sha256: ${"a".repeat(64)}`, `result_sha256: ${"b".repeat(64)}`, ""].join("\n");
		expect(parseSyncReport(sinChange).ok).toBe(false);
	});
});

// =============================================================================
// USABILIDAD DEL FORMATO DE DELTA. Descubierto en el PRIMER uso real del slice
// 02 sobre trabajo de verdad: la sincronización falló con
// `invalid-scenario-id` porque había una línea en blanco entre `## ADDED` y el
// primer escenario. Dos problemas a la vez:
//   1. esa línea es OBLIGATORIA entre entradas y estaba PROHIBIDA tras el
//      encabezado de operación — una asimetría que solo se descubre chocando;
//   2. el error hablaba de identificadores kebab-case señalando una línea
//      vacía, así que mandaba a revisar IDs que estaban perfectos.
// Los deltas se escriben a mano (no hay serializador), así que tolerar la línea
// no toca ningún byte generado ni el determinismo de los digests.
// =============================================================================
describe("delta: líneas en blanco tras el encabezado de operación", () => {
	const scenario = [
		"### Scenario: alpha",
		"title: Alpha",
		"requirement: The system MUST retain alpha",
		"Given: an input",
		"When: it runs",
		"Then: it succeeds",
	].join("\n");
	const head = ["# OpenSpec Delta", "format: openspec-delta/v1", "domain: sdd-lifecycle", ""];

	test("acepta UNA línea en blanco tras `## ADDED` (el caso que falló)", () => {
		const source = [...head, "## ADDED", "", scenario, ""].join("\n");
		expect(parseOpenSpecDelta(source).ok).toBe(true);
	});

	test("sigue aceptando el delta SIN esa línea", () => {
		expect(parseOpenSpecDelta([...head, "## ADDED", scenario, ""].join("\n")).ok).toBe(true);
	});

	test("los dos estilos producen EL MISMO delta", () => {
		const conLinea = parseOpenSpecDelta([...head, "## ADDED", "", scenario, ""].join("\n"));
		const sinLinea = parseOpenSpecDelta([...head, "## ADDED", scenario, ""].join("\n"));
		expect(conLinea.ok && sinLinea.ok).toBe(true);
		if (conLinea.ok && sinLinea.ok) expect(conLinea.value).toEqual(sinLinea.value);
	});

	test("DOS líneas en blanco siguen siendo un error: el formato no se afloja", () => {
		const result = parseOpenSpecDelta([...head, "## ADDED", "", "", scenario, ""].join("\n"));
		expect(result.ok).toBe(false);
	});

	test("el error de una línea vacía dice lo que pasa, no habla de kebab-case", () => {
		const result = parseOpenSpecDelta([...head, "## ADDED", "", "", scenario, ""].join("\n"));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors[0]?.code).toBe("unexpected-blank-line");
			expect(result.errors[0]?.message).toContain("blank line");
			expect(result.errors[0]?.message).not.toContain("kebab-case");
		}
	});

	test("una sección vacía sigue detectándose", () => {
		expect(parseOpenSpecDelta([...head, "## ADDED", "", "## REMOVED", ""].join("\n")).ok).toBe(false);
	});
});
