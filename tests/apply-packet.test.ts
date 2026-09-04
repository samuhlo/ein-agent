// =============================================================================
// TESTS: schema y validador del Apply Packet (`apply-packet/v1`)
//   Un packet es el encargo cerrado que ejecuta un modelo barato. Si el
//   validador deja pasar un encargo incompleto, ambiguo, caducado o con la
//   frontera mal declarada, el ejecutor decide — y eso es justo lo que 2A
//   existe para impedir.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
	APPLY_PACKET_FORMAT,
	type ApplyPacketDraft,
	type ApplyPacketValidation,
	normalizeFilesLabel,
	PRODUCTION_FILES_LABELS,
	TEST_FILES_LABELS,
	validateApplyPacket,
} from "../ein-pi/agent/lib/apply-packet";
import {
	PRODUCTION_FILES_LABELS as SHARED_PRODUCTION_FILES_LABELS,
	TEST_FILES_LABELS as SHARED_TEST_FILES_LABELS,
} from "../shared/sdd/sdd-tasks-frontier.ts";

const SOURCES = {
	"design.md": "d1g3st-design",
	"tasks.md": "d1g3st-tasks",
} as const;

function draft(overrides: Partial<ApplyPacketDraft> = {}): ApplyPacketDraft {
	return {
		format: APPLY_PACKET_FORMAT,
		change: "freeze-apply-corpus-and-packet-schema",
		group: "// 001. Schema y validador del Apply Packet",
		outcome: "El validador rechaza un packet que un ejecutor no podria ejecutar sin decidir.",
		allowedFiles: ["ein-pi/agent/lib/apply-packet.ts", "tests/apply-packet.test.ts"],
		allowedFilesGrammar: ["Production files (apply touches):"],
		edits: [{ path: "ein-pi/agent/lib/apply-packet.ts", intent: "Crear el tipo y el validador." }],
		invariants: ["El validador nunca lanza."],
		focusedCheck: "bun test tests/apply-packet.test.ts",
		stopConditions: ["Parar si un rechazo no nombra el campo ofensor."],
		expectedEvidence: "Salida de bun test con 0 fallos.",
		sources: { ...SOURCES },
		...overrides,
	};
}

function codes(result: ApplyPacketValidation): string[] {
	return result.ok ? [] : result.issues.map((issue) => issue.code);
}

function fieldOf(result: ApplyPacketValidation, code: string): string | undefined {
	return result.ok ? undefined : result.issues.find((issue) => issue.code === code)?.field;
}

describe("packet ejecutable", () => {
	test("un packet completo y fresco es ejecutable", () => {
		const result = validateApplyPacket(draft(), SOURCES);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.level).toBe("executable");
		expect(result.packet.format).toBe(APPLY_PACKET_FORMAT);
		expect(result.packet.allowedFiles).toEqual([
			"ein-pi/agent/lib/apply-packet.ts",
			"tests/apply-packet.test.ts",
		]);
	});
});

describe("nivel incomplete — falta contenido obligatorio", () => {
	test("sin invariantes → missing-invariant, nombrando el campo", () => {
		const result = validateApplyPacket(draft({ invariants: [] }), SOURCES);
		expect(result.ok).toBe(false);
		expect(codes(result)).toContain("missing-invariant");
		expect(fieldOf(result, "missing-invariant")).toBe("invariants");
		if (!result.ok) expect(result.level).toBe("incomplete");
	});

	test("sin condiciones de parada → missing-stop (0 de 51 tasks.md las tienen hoy)", () => {
		const result = validateApplyPacket(draft({ stopConditions: [] }), SOURCES);
		expect(codes(result)).toContain("missing-stop");
		expect(fieldOf(result, "missing-stop")).toBe("stopConditions");
	});

	test("cada campo obligatorio vacio se reporta por separado", () => {
		const result = validateApplyPacket(
			draft({ outcome: "  ", allowedFiles: [], focusedCheck: "", expectedEvidence: "" }),
			SOURCES,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		const empties = result.issues.filter((issue) => issue.code === "missing-field").map((issue) => issue.field);
		expect(empties.sort()).toEqual(["allowedFiles", "expectedEvidence", "focusedCheck", "outcome"]);
	});
});

describe("nivel rejected — el packet afirma algo falso o sale de su frontera", () => {
	test("un marcador de decision pendiente en cualquier campo → unresolved-decision", () => {
		const result = validateApplyPacket(draft({ outcome: "Decidir entre TBD y la otra opcion." }), SOURCES);
		expect(codes(result)).toContain("unresolved-decision");
		expect(fieldOf(result, "unresolved-decision")).toBe("outcome");
		if (!result.ok) expect(result.level).toBe("rejected");
	});

	test("un placeholder sin expandir en el comando → unresolved-decision", () => {
		const result = validateApplyPacket(draft({ focusedCheck: "bun test tests/<change>.test.ts" }), SOURCES);
		expect(fieldOf(result, "unresolved-decision")).toBe("focusedCheck");
	});

	test("digest distinto del actual → stale-source, nombrando el artefacto", () => {
		const result = validateApplyPacket(draft(), { ...SOURCES, "tasks.md": "otro-digest" });
		expect(codes(result)).toContain("stale-source");
		expect(fieldOf(result, "stale-source")).toBe("sources.tasks.md");
	});

	test("FAIL CLOSED: sin digest actual del artefacto no se puede afirmar frescura", () => {
		const result = validateApplyPacket(draft(), { "design.md": SOURCES["design.md"] });
		expect(codes(result)).toContain("stale-source");
		expect(fieldOf(result, "stale-source")).toBe("sources.tasks.md");
	});

	test("una edicion fuera de allowedFiles → out-of-scope", () => {
		const result = validateApplyPacket(
			draft({ edits: [{ path: "ein-pi/agent/lib/sdd-router.ts", intent: "Tocar el router." }] }),
			SOURCES,
		);
		expect(codes(result)).toContain("out-of-scope");
		expect(fieldOf(result, "out-of-scope")).toBe("edits[0].path");
	});

	test("el comando enfocado nombra un fichero fuera de la frontera → out-of-scope", () => {
		const result = validateApplyPacket(draft({ focusedCheck: "bun test tests/sdd-router.test.ts" }), SOURCES);
		expect(codes(result)).toContain("out-of-scope");
		expect(fieldOf(result, "out-of-scope")).toBe("focusedCheck");
	});

	test("gramatica de etiqueta desconocida → unknown-grammar", () => {
		const result = validateApplyPacket(draft({ allowedFilesGrammar: ["unknown"] }), SOURCES);
		expect(codes(result)).toContain("unknown-grammar");
		expect(fieldOf(result, "unknown-grammar")).toBe("allowedFilesGrammar");
	});

	test("formato distinto de apply-packet/v1 → rejected, no ejecutable", () => {
		const result = validateApplyPacket(draft({ format: "apply-packet/v0" as never }), SOURCES);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.level).toBe("rejected");
	});
});

describe("BLINDAJE: el validador nunca lanza", () => {
	test("input basura devuelve un resultado, no una excepcion", () => {
		for (const rubbish of [undefined, null, 42, "packet", [], { format: 1 }]) {
			const result = validateApplyPacket(rubbish as never, SOURCES);
			expect(result.ok).toBe(false);
		}
	});

	test("digests actuales ausentes o basura no rompen la validacion", () => {
		expect(validateApplyPacket(draft(), undefined as never).ok).toBe(false);
		expect(validateApplyPacket(draft(), "no-es-un-mapa" as never).ok).toBe(false);
	});
});

describe("un fallo rejected pesa mas que uno incomplete", () => {
	test("packet con falta de contenido Y afirmacion falsa → nivel rejected", () => {
		const result = validateApplyPacket(draft({ invariants: [], edits: [{ path: "otro/fichero.ts", intent: "x" }] }), SOURCES);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.level).toBe("rejected");
		expect(codes(result).sort()).toEqual(["missing-invariant", "out-of-scope"]);
	});
});

// ─── TRIANGULACIÓN ───────────────────────────────────────────────────────────

describe("TRIANGULATE: normalizacion de la etiqueta de ficheros permitidos", () => {
	test("las grafias medidas en el archivo normalizan al mismo campo", () => {
		const raw = [
			"Production files:",
			"**Production files:**",
			"- production paths:",
			"production-files:",
			"production_files:",
			"  production files:  ",
			"- Production allowlist:",
			"- production/doc paths:",
			"Production files (apply touches):",
		];
		for (const label of raw) {
			expect(normalizeFilesLabel(label)).not.toBeNull();
		}
	});

	test("una estimacion de tamano NO es una frontera de escritura", () => {
		expect(normalizeFilesLabel("production_forecast:")).toBeNull();
	});

	test("etiquetas inventadas o no textuales caen a null", () => {
		for (const label of ["ficheros de produccion:", "prod files:", "", null, 42, undefined]) {
			expect(normalizeFilesLabel(label)).toBeNull();
		}
	});
});

describe("TRIANGULATE: la prosa legitima no se confunde con ambiguedad", () => {
	test("un outcome que usa la palabra decidir sigue siendo ejecutable", () => {
		const result = validateApplyPacket(
			draft({ outcome: "El ejecutor aplica el slice sin decidir nada por su cuenta." }),
			SOURCES,
		);
		expect(result.ok).toBe(true);
	});

	test("un marcador entre corchetes SI es una decision pendiente", () => {
		const result = validateApplyPacket(draft({ outcome: "Aplicar el slice [decidir cual]." }), SOURCES);
		expect(fieldOf(result, "unresolved-decision")).toBe("outcome");
	});

	// GUARD -> Un genérico de TypeScript pegado a su identificador no es un hueco sin rellenar.
	test("un generico de TypeScript pegado a su identificador sigue siendo ejecutable", () => {
		const result = validateApplyPacket(
			draft({ outcome: "Añade un registro de clave Record<string, unknown> al validador." }),
			SOURCES,
		);
		expect(result.ok).toBe(true);
	});

	test("un genérico anidado sigue siendo ejecutable", () => {
		const result = validateApplyPacket(
			draft({ outcome: "Cachea el resultado en un Map<string, Set<string>>." }),
			SOURCES,
		);
		expect(result.ok).toBe(true);
	});

	test("el operador de fusión ?? no es una decision pendiente", () => {
		const result = validateApplyPacket(
			draft({ outcome: "Usa el id cuando existe (??) y cae al valor por defecto." }),
			SOURCES,
		);
		expect(result.ok).toBe(true);
	});

	test("una cota escrita con comparadores separados por espacios sigue siendo ejecutable", () => {
		const result = validateApplyPacket(
			draft({ expectedEvidence: "El conteo queda entre < 1 || report.uncertainties.length >." }),
			SOURCES,
		);
		expect(result.ok).toBe(true);
	});

	test("una tirada de tres o mas signos de interrogacion SI es una decision pendiente", () => {
		const result = validateApplyPacket(draft({ outcome: "No sabemos que hacer aqui ???" }), SOURCES);
		expect(codes(result)).toContain("unresolved-decision");
		expect(fieldOf(result, "unresolved-decision")).toBe("outcome");
		if (!result.ok) expect(result.level).toBe("rejected");
	});
});

describe("TRIANGULATE: bordes de frontera y frescura", () => {
	test("una edicion sin ruta es un escape, no un permiso", () => {
		const result = validateApplyPacket(draft({ edits: [{ path: "", intent: "algo" }] }), SOURCES);
		expect(codes(result)).toContain("out-of-scope");
	});

	test("sin edits declarados el packet sigue siendo ejecutable (intencion acotada)", () => {
		expect(validateApplyPacket(draft({ edits: [] }), SOURCES).ok).toBe(true);
	});

	test("un digest de mas en el arbol vivo no invalida el packet", () => {
		const result = validateApplyPacket(draft(), { ...SOURCES, "scope.md": "otro" });
		expect(result.ok).toBe(true);
	});

	test("sources vacio → missing-field, no un packet fresco por defecto", () => {
		const result = validateApplyPacket(draft({ sources: {} }), SOURCES);
		expect(result.ok).toBe(false);
		expect(codes(result)).toContain("missing-field");
	});

	test("un comando sin ficheros (typecheck) no inventa escapes", () => {
		expect(validateApplyPacket(draft({ focusedCheck: "bun run typecheck" }), SOURCES).ok).toBe(true);
	});
});

// PARIDAD DE VOCABULARIO -> `shared/sdd/sdd-tasks-frontier.ts` duplica el
// conjunto cerrado de etiquetas de frontera porque `shared/` no puede importar
// de `ein-pi/`. Si el conjunto cerrado crece aquí sin actualizar el espejo,
// este test se pone rojo: la deriva se detecta, no se sufre en silencio.
describe("paridad de vocabulario: shared/sdd-tasks-frontier.ts espeja apply-packet.ts", () => {
	test("PRODUCTION_FILES_LABELS es el mismo conjunto en los dos árboles", () => {
		expect(new Set(SHARED_PRODUCTION_FILES_LABELS)).toEqual(new Set(PRODUCTION_FILES_LABELS));
	});

	test("TEST_FILES_LABELS es el mismo conjunto en los dos árboles", () => {
		expect(new Set(SHARED_TEST_FILES_LABELS)).toEqual(new Set(TEST_FILES_LABELS));
	});
});
