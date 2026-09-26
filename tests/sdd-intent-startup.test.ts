import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessSddIntentStartup } from "../shared/sdd/sdd-intent-startup.ts";
import { writeAgreement, type IntentAgreement } from "../shared/sdd/intent-agreement.ts";
import { createIntentMaterialKey } from "../shared/sdd/sdd-intent-preflight.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "ein-intent-startup-"));
	roots.push(root);
	const change = "create-course";
	const dir = join(root, "openspec", "changes", change);
	const material = {
		objective: "Crear un curso desde el centro",
		boundaries: { in: ["Alta del curso"], out: ["Asignación docente"] },
		completionCriteria: ["El curso aparece en el panel"]
	};
	const agreement = (status: IntentAgreement["status"] = "confirmed"): IntentAgreement => ({
		version: 1, work: change, change, status, material,
		materialKey: createIntentMaterialKey(material),
		questions: status === "confirmed" ? [] : ["¿Qué ocurre al guardar?"],
		...(status === "confirmed" ? { fromRequest: true as const, response: { id: "human-1", text: "Crear un curso desde el centro", source: "interactive" as const } } : {}),
		revision: "revision-1",
	});
	return { root, change, dir, agreement };
}

describe("new SDD intent startup", () => {
	test("does not create SDD state when intent is missing", () => {
		const h = fixture();
		const result = assessSddIntentStartup(h.root, h.change);
		expect(result).toMatchObject({ admitted: false });
		expect(existsSync(join(h.root, "openspec"))).toBe(false);
	});

	test("accepts a confirmed canonical agreement for the first scope", () => {
		const h = fixture(); mkdirSync(h.dir, { recursive: true });
		writeAgreement(h.dir, h.agreement());
		expect(assessSddIntentStartup(h.root, h.change)).toEqual({ admitted: true, source: "agreement" });
		expect(assessSddIntentStartup(h.root, h.change, false)).toEqual({ admitted: true, source: "agreement" });
	});

	test("blocks pending or invalid intent, including on an already scoped change", () => {
		const h = fixture(); mkdirSync(h.dir, { recursive: true });
		writeAgreement(h.dir, h.agreement("pending"));
		expect(assessSddIntentStartup(h.root, h.change).admitted).toBe(false);
		writeFileSync(join(h.dir, "scope.md"), "Existing scope\n");
		expect(assessSddIntentStartup(h.root, h.change).admitted).toBe(false);
		writeFileSync(join(h.dir, "intent.md"), "invalid\n");
		expect(assessSddIntentStartup(h.root, h.change).admitted).toBe(false);
	});

	test("resumes a scoped legacy change without retrospective questions", () => {
		const h = fixture(); mkdirSync(h.dir, { recursive: true });
		writeFileSync(join(h.dir, "scope.md"), "Existing scope\n");
		expect(assessSddIntentStartup(h.root, h.change)).toEqual({ admitted: true, source: "legacy-scope" });
		expect(assessSddIntentStartup(h.root, h.change, false).admitted).toBe(false);
	});
});
