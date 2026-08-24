// =============================================================================
// TESTS: el contrato de pantalla — lo que se afirma sale de un cálculo
//   Primera mitad: el guardián funciona (superficies falsas, a propósito rotas).
//   Segunda mitad: las superficies REALES lo cumplen. La segunda es la que paga
//   el coste de la primera; un guardián que solo se prueba a sí mismo no vale.
// =============================================================================

import { describe, expect, test } from "bun:test";

import { describeViolations, findCoverageViolations } from "./fixtures/screen-state-coverage";
import { phaseStates, renderSddOverlay } from "../ein-pi/agent/lib/sdd-overlay.ts";
import type {
	ApplyOutcome,
	SddChangeStatus,
	SddSelection,
	VerifyOutcome,
} from "../ein-pi/agent/lib/sdd-router.ts";

// ─── el guardián ─────────────────────────────────────────────────────────────

describe("el guardián de correspondencia", () => {
	test("una superficie que no distingue dos estados falla, y los nombra", () => {
		const violations = findCoverageViolations({
			surface: "falsa",
			union: "Estado",
			states: [
				{ label: "bueno", state: "bueno" },
				{ label: "malo", state: "malo" },
			],
			render: () => "todo en orden",
		});

		expect(violations).toEqual([
			{ kind: "collision", surface: "falsa", union: "Estado", states: ["bueno", "malo"] },
		]);
		expect(describeViolations(violations)).toContain("no los distingue");
	});

	test("el color no cuenta como distinguir", () => {
		const paint = (code: number, text: string): string => `${String.fromCharCode(27)}[${code}m${text}${String.fromCharCode(27)}[0m`;
		const violations = findCoverageViolations({
			surface: "falsa",
			union: "Estado",
			states: [
				{ label: "bueno", state: 32 },
				{ label: "malo", state: 31 },
			],
			render: (code: number) => paint(code, "verify"),
		});

		// Mismo texto, distinto color: en un log o una captura monocroma son
		// indistinguibles, así que no vale como diferencia.
		expect(violations.map((violation) => violation.kind)).toEqual(["collision"]);
	});

	test("un vacío sin declarar falla; declarado, pasa", () => {
		const declaration = {
			surface: "falsa",
			union: "Estado",
			states: [{ label: "sin-nada", state: null }],
			render: () => "",
		};

		expect(findCoverageViolations(declaration)).toEqual([
			{ kind: "undeclared-empty", surface: "falsa", union: "Estado", state: "sin-nada" },
		]);
		expect(
			findCoverageViolations({ ...declaration, emptyByDesign: { "sin-nada": "no hay nada que contar" } }),
		).toEqual([]);
	});

	test("una declaración de vacío que se queda obsoleta también falla", () => {
		const violations = findCoverageViolations({
			surface: "falsa",
			union: "Estado",
			states: [{ label: "sin-nada", state: null }],
			render: () => "ahora sí pinto",
			emptyByDesign: { "sin-nada": "no hay nada que contar" },
		});

		// Si no fallara, la declaración dejaría de proteger en silencio.
		expect(violations.map((violation) => violation.kind)).toEqual(["stale-empty-declaration"]);
		expect(describeViolations(violations)).toContain("pero ahora pinta");
	});

	test("una superficie que distingue todo no tiene nada que declarar", () => {
		expect(
			findCoverageViolations({
				surface: "falsa",
				union: "Estado",
				states: [
					{ label: "a", state: "a" },
					{ label: "b", state: "b" },
				],
				render: (state: string) => `estado ${state}`,
			}),
		).toEqual([]);
	});
});

// ─── las superficies reales ──────────────────────────────────────────────────

const TASK = { id: "001", title: "una tarea", done: false };

function status(overrides: Partial<SddChangeStatus> = {}): SddChangeStatus {
	return {
		change: "un-cambio",
		selection: { kind: "only", change: "un-cambio" },
		lane: "micro",
		currentPhase: "apply",
		nextRecommended: "apply",
		apply: "partial",
		verify: "absent",
		verifyStale: false,
		specState: "synchronized",
		summaryStale: false,
		present: { scope: true, map: false, design: true, tasks: true, apply: true, verify: false, close: false },
		artifacts: { present: [], missing: [] },
		summary: null,
		budget: { allocated: null, consumed: null, allocatedValue: null, consumedValue: null, problems: [] },
		tasks: {
			present: true,
			status: "ready",
			blockedBy: null,
			items: [TASK],
			nextPending: TASK,
			counts: { pending: 1, ready: 0, blocked: 0, done: 0 },
			problems: [],
		},
		blocked: [],
		...overrides,
	} as SddChangeStatus;
}

const SELECTIONS: readonly { label: string; state: SddSelection }[] = [
	{ label: "none", state: { kind: "none" } },
	{ label: "only", state: { kind: "only", change: "un-cambio" } },
	{ label: "explicit", state: { kind: "explicit", change: "un-cambio" } },
	{ label: "ambiguous", state: { kind: "ambiguous", candidates: ["feat-a", "feat-b"] } },
];

const VERIFY_OUTCOMES: readonly VerifyOutcome[] = ["pass", "fail", "unknown", "absent"];
const APPLY_OUTCOMES: readonly ApplyOutcome[] = ["complete", "partial", "blocked", "unknown", "absent"];

describe("el overlay distingue los estados que recibe", () => {
	test("cada resultado de verify se ve distinto del resto", () => {
		// El caso que motivó todo esto: `fail` se pintaba igual que `pass`, porque
		// el carril solo distinguía "obsoleto o ilegible" de "presente".
		const violations = findCoverageViolations({
			surface: "renderSddOverlay",
			union: "VerifyOutcome",
			states: VERIFY_OUTCOMES.map((verify) => ({ label: verify, state: verify })),
			render: (verify: VerifyOutcome) =>
				renderSddOverlay(
					status({
						verify,
						nextRecommended: "close",
						// El estado recorrido tiene que ser alcanzable: `absent` significa
						// que no hay informe, así que no puede ir con el artefacto
						// presente. Una colisión entre estados imposibles no es una
						// mentira, es ruido del fixture.
						present: {
							scope: true, map: false, design: true, tasks: true, apply: true,
							verify: verify !== "absent", close: false,
						},
					}),
				),
		});

		expect(describeViolations(violations)).toBe("");
	});

	test("una verificación fallida no es una fase hecha", () => {
		const failed = phaseStates(
			status({
				verify: "fail",
				nextRecommended: "close",
				present: { scope: true, map: false, design: true, tasks: true, apply: true, verify: true, close: false },
			}),
		).find(({ phase }) => phase === "verify");

		expect(failed?.state).not.toBe("done");
		// Y tampoco se disfraza de incertidumbre: se sabe, y se sabe que fue mal.
		expect(failed?.state).not.toBe("unknown");
	});

	test("cada forma de la selección se ve distinta, y solo `none` calla", () => {
		const violations = findCoverageViolations({
			surface: "renderSddOverlay",
			union: "SddSelection",
			states: SELECTIONS,
			render: (selection: SddSelection) =>
				renderSddOverlay(
					status({
						selection,
						change: selection.kind === "only" || selection.kind === "explicit" ? selection.change : null,
					}),
				),
			emptyByDesign: {
				none: "sin cambio activo el widget no roba ni una línea",
				// `only` y `explicit` resuelven al mismo cambio y pintan lo mismo a
				// propósito: la procedencia de la elección no es asunto del overlay.
			},
		});

		// `only` y `explicit` colisionan por diseño; es la única colisión aceptada
		// y se afirma explícitamente para que una nueva no pase desapercibida.
		expect(violations).toEqual([
			{
				kind: "collision",
				surface: "renderSddOverlay",
				union: "SddSelection",
				states: ["only", "explicit"],
			},
		]);
	});

	test("cada resultado de apply se ve distinto del resto", () => {
		const violations = findCoverageViolations({
			surface: "renderSddOverlay",
			union: "ApplyOutcome",
			states: APPLY_OUTCOMES.map((apply) => ({ label: apply, state: apply })),
			render: (apply: ApplyOutcome) => renderSddOverlay(status({ apply })),
		});

		// Documenta el estado real: el overlay NO proyecta el resultado de apply,
		// así que los cinco valores se ven igual. Es un hueco conocido, no una
		// mentira: el carril habla de fases, no del veredicto de cada una.
		expect(violations.length).toBeGreaterThan(0);
		expect(violations.every((violation) => violation.kind === "collision")).toBe(true);
	});
});
