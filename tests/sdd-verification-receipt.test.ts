import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeAgreement } from "../shared/sdd/intent-agreement.ts";
import { createIntentMaterialKey } from "../shared/sdd/sdd-intent-preflight.ts";
import { createVerificationService } from "../shared/sdd/sdd-verification-receipt.ts";

let root: string;
let changePath: string;
let paths: string[];
let tick: number;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "ein-verification-receipt-"));
	changePath = join(root, "openspec/changes/probe");
	mkdirSync(changePath, { recursive: true });
	writeFileSync(join(root, "src.ts"), "export const value = 1;\n");
	writeFileSync(join(root, "unignored-report.md"), "fixture report\n");
	writeFileSync(join(changePath, "tasks.md"), "status: ready\n- [x] done\n");
	paths = ["src.ts", "unignored-report.md", "openspec/changes/probe/tasks.md", "openspec/changes/probe/verify-report.md", "openspec/changes/probe/verification-receipt.json"];
	tick = 0;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function service() {
	return createVerificationService({
		enumerateGit: () => ({ ok: true, root, entries: paths.map((path) => ({ path, kind: "file" as const })) }),
		now: () => new Date(1_700_000_000_000 + tick++ * 1000).toISOString(),
		newToken: () => `token-${tick++}`,
	});
}
const PASS = "# Verify\r\nstatus: pass\r\nbehavior_coverage: verified\r\nrequired_check: {\"command\":\"bun test\",\"exitCode\":0}\r\n";

function writeIntent(status: "pending" | "confirmed", objective = "Verify the agreed change"): string {
	const material = {
		objective,
		boundaries: { in: ["Runtime"], out: ["Installer"] },
		completionCriteria: ["Verification is bound to the agreement"],
	};
	const materialKey = createIntentMaterialKey(material);
	writeAgreement(changePath, {
		version: 1,
		work: "probe",
		change: "probe",
		status,
		material,
		materialKey,
		questions: ["Proceed?"],
		...(status === "confirmed" ? { response: { id: "answer-1", text: "Yes", source: "interactive" as const } } : {}),
		revision: `revision-${objective}`,
	});
	return materialKey;
}

describe("createVerificationService", () => {
	test("an optional unconfirmed agreement does not block passing verification", () => {
		writeIntent("pending");
		const api = service();
		const begun = api.beginVerification({ cwd: root, changePath });
		if (!begun.ok) return;
		expect(api.finishVerification({ cwd: root, changePath, token: begun.value.token, content: PASS }).ok).toBe(true);
		expect(api.readVerificationFreshness({ cwd: root, changePath }).state).toBe("current");
	});

	test("a report symlink cannot overwrite another project file", () => {
		const api = service();
		const begun = api.beginVerification({ cwd: root, changePath });
		if (!begun.ok) throw new Error(begun.reason);
		const target = join(root, "src.ts");
		const original = readFileSync(target, "utf8");
		symlinkSync(target, join(changePath, "verify-report.md"));
		expect(api.finishVerification({ cwd: root, changePath, token: begun.value.token, content: PASS }).ok).toBe(false);
		expect(readFileSync(target, "utf8")).toBe(original);
	});
	test("begin/finish publica un recibo actual sin autorreferencia", () => {
		const api = service();
		const begun = api.beginVerification({ cwd: root, changePath });
		expect(begun.ok).toBe(true);
		if (!begun.ok) return;
		const finished = api.finishVerification({ cwd: root, changePath, token: begun.value.token, content: PASS });
		expect(finished.ok).toBe(true);
		expect(readFileSync(join(changePath, "verify-report.md"), "utf8")).not.toContain("\r");
		expect(api.readVerificationFreshness({ cwd: root, changePath }).state).toBe("current");
		const repeated = api.finishVerification({ cwd: root, changePath, token: begun.value.token, content: PASS });
		expect(repeated).toEqual(finished);
	});

	test("edición, borrado y recibo antiguo quedan stale; sin cambios sigue current", () => {
		const api = service();
		const begun = api.beginVerification({ cwd: root, changePath });
		if (!begun.ok) throw new Error(begun.reason);
		expect(api.finishVerification({ cwd: root, changePath, token: begun.value.token, content: PASS }).ok).toBe(true);
		expect(api.readVerificationFreshness({ cwd: root, changePath }).state).toBe("current");
		writeFileSync(join(root, "src.ts"), "export const value = 2;\n");
		expect(api.readVerificationFreshness({ cwd: root, changePath }).state).toBe("stale");
		writeFileSync(join(root, "src.ts"), "export const value = 1;\n");
		rmSync(join(root, "unignored-report.md"));
		paths = paths.filter((path) => path !== "unignored-report.md");
		expect(api.readVerificationFreshness({ cwd: root, changePath }).state).toBe("stale");
	});

	test("cambio durante verify, token obsoleto y outcome unknown no publican éxito", () => {
		const api = service();
		const first = api.beginVerification({ cwd: root, changePath });
		const second = api.beginVerification({ cwd: root, changePath });
		if (!first.ok || !second.ok) throw new Error("begin failed");
		expect(api.finishVerification({ cwd: root, changePath, token: first.value.token, content: PASS })).toMatchObject({ ok: false, code: "token-stale" });
		writeFileSync(join(root, "src.ts"), "changed during checks\n");
		expect(api.finishVerification({ cwd: root, changePath, token: second.value.token, content: PASS })).toMatchObject({ ok: false, code: "verification-stale" });
		expect(api.readVerificationFreshness({ cwd: root, changePath }).state).toBe("unbound");
		const third = api.beginVerification({ cwd: root, changePath });
		if (!third.ok) throw new Error(third.reason);
		expect(api.finishVerification({ cwd: root, changePath, token: third.value.token, content: "no verdict\n" })).toMatchObject({ ok: false, code: "outcome-unknown" });
		expect(api.readVerificationFreshness({ cwd: root, changePath }).state).toBe("unbound");
	});

	test("alterar report exige finalizar de nuevo y un recibo malformado nunca es current", () => {
		const api = service();
		const begun = api.beginVerification({ cwd: root, changePath });
		if (!begun.ok) throw new Error(begun.reason);
		api.finishVerification({ cwd: root, changePath, token: begun.value.token, content: PASS });
		writeFileSync(join(changePath, "verify-report.md"), `${PASS}\nchanged outside writer\n`);
		expect(api.readVerificationFreshness({ cwd: root, changePath }).state).toBe("stale");
		writeFileSync(join(changePath, "verification-receipt.json"), "{broken");
		expect(api.readVerificationFreshness({ cwd: root, changePath }).state).toBe("invalid");
	});

	test("un fallo entre report y recibo nunca produce current", () => {
		const api = service();
		const begun = api.beginVerification({ cwd: root, changePath });
		if (!begun.ok) throw new Error(begun.reason);
		mkdirSync(join(changePath, "verification-receipt.json"));
		const finished = api.finishVerification({ cwd: root, changePath, token: begun.value.token, content: PASS });
		expect(finished).toMatchObject({ ok: false, code: "write-failed" });
		expect(readFileSync(join(changePath, "verify-report.md"), "utf8")).toContain("status: pass");
		expect(api.readVerificationFreshness({ cwd: root, changePath }).state).toBe("invalid");
	});

	test("normaliza intent_key con el acuerdo vigente sin aceptar una clave vieja", () => {
		const key = writeIntent("confirmed");
		const api = service();
		const begun = api.beginVerification({ cwd: root, changePath });
		if (!begun.ok) throw new Error(begun.reason);
		const finished = api.finishVerification({ cwd: root, changePath, token: begun.value.token, content: `intent_key: old\n${PASS}` });
		expect(finished.ok).toBe(true);
		const report = readFileSync(join(changePath, "verify-report.md"), "utf8");
		expect(report.match(/^intent_key:/gm)).toHaveLength(1);
		expect(report).toContain(`intent_key: ${key}`);
	});

	test("solo liga acuerdos confirmados y detecta si cambian durante verify", () => {
		writeIntent("pending");
		const api = service();
		const pending = api.beginVerification({ cwd: root, changePath });
		expect(pending.ok).toBe(true);

		writeFileSync(join(changePath, "intent.md"), "invalid intent\n");
		const invalid = api.beginVerification({ cwd: root, changePath });
		expect(invalid.ok).toBe(true);

		const original = writeIntent("confirmed", "Original agreement");
		const begun = api.beginVerification({ cwd: root, changePath });
		if (!begun.ok) throw new Error(begun.reason);
		expect(begun.value.intentKey).toBe(original);
		writeIntent("confirmed", "Changed agreement");
		expect(api.finishVerification({ cwd: root, changePath, token: begun.value.token, content: PASS }))
			.toMatchObject({ ok: false, code: "intent-stale" });
	});
});
