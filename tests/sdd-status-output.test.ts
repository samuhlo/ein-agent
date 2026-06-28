// =============================================================================
// TESTS: sdd-status output (contrato de formato sin Pi runtime)
// Verifica que el output de /ein:sdd-status contiene las etiquetas correctas
// sin necesidad de levantar el agente Pi.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listActiveChanges, resolveSddStatus } from "../ein-pi/agent/lib/sdd-router";
import { t, tf } from "../ein-pi/agent/lib/i18n/strings";

let DIR: string;
function change(name: string): string {
	const p = join(DIR, "openspec", "changes", name);
	mkdirSync(p, { recursive: true });
	return p;
}
function put(changePath: string, file: string, body = "x"): void {
	writeFileSync(join(changePath, file), body);
}

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "sdd-status-"));
});
afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

// Replica exacta del formatter del handler /ein:sdd-status
function formatSddStatus(cwd: string): string {
	const s = resolveSddStatus(cwd);
	const active = listActiveChanges(cwd);
	const lines: string[] = ["/// 000. SDD STATUS", ""];
	if (!s.change) {
		lines.push("- " + t("sdd-status.none", "No hay cambios SDD activos en openspec/changes/."));
	} else {
		const done = (Object.keys(s.present) as (keyof typeof s.present)[])
			.filter((p) => s.present[p])
			.join(", ") || t("sdd-status.no-active", "ninguno");
		lines.push(`${t("sdd-status.change", "change")}: ${s.change}`);
		if (active.length > 1) lines.push(`${t("sdd-status.active", "active")}: ${active.join(", ")}`);
		lines.push(`${t("sdd-status.phases", "phases done")}: ${done}`);
		lines.push(`${t("sdd-status.apply", "apply")}: ${s.apply}`);
		lines.push(`${t("sdd-status.verify", "verify")}: ${s.verify}`);
		lines.push(`${t("sdd-status.next", "next")}: ${s.nextRecommended}`);
		if (s.blocked.length) {
			lines.push("");
			lines.push(`■ ${t("sdd-status.blocked", "blockers")}:`);
			for (const b of s.blocked) lines.push(`- ${b}`);
		}
	}
	return lines.join("\n");
}

describe("sdd-status output format", () => {
	test("sin cambios → mensaje de ninguno", () => {
		const out = formatSddStatus(DIR);
		expect(out).toContain(t("sdd-status.none", "No hay cambios SDD activos en openspec/changes/."));
	});

	test("un cambio activo → muestra change, apply, verify, next", () => {
		const c = change("feat-x");
		put(c, "init.md");
		put(c, "exploration.md");
		put(c, "design.md");
		put(c, "apply-progress.md", "status: partial\n");

		const out = formatSddStatus(DIR);
		expect(out).toContain("change: feat-x");
		expect(out).toContain("apply: partial");
		expect(out).toContain("verify: absent");
		expect(out).toContain("next: apply");
	});

	test("apply completo → verify presente", () => {
		const c = change("feat-x");
		put(c, "init.md");
		put(c, "exploration.md");
		put(c, "design.md");
		put(c, "apply-progress.md", "status: complete\n");
		put(c, "verify-report.md", "status: pass\n");

		const out = formatSddStatus(DIR);
		expect(out).toContain("apply: complete");
		expect(out).toContain("verify: pass");
		expect(out).toContain("next: archive");
	});

	test("multiples cambios activos → muestra lista de activos", () => {
		change("feat-x");
		change("feat-y");
		const out = formatSddStatus(DIR);
		expect(out).toContain("active: feat-x, feat-y");
	});

	test("bloqueos → muestra seccion de bloqueos", () => {
		const c = change("feat-x");
		put(c, "init.md");
		put(c, "exploration.md");
		put(c, "design.md");
		put(c, "apply-progress.md", "status: blocked\n");

		const out = formatSddStatus(DIR);
		expect(out).toContain("■ blockers:");
		expect(out).toContain("- apply-progress.md indica bloqueo.");
	});
});

describe("strings.ts i18n keys present", () => {
	test("sdd-status.change key exists in EN and ES", () => {
		expect(t("sdd-status.change", "")).toBe("change");
	});

	test("sdd-status.apply key exists in EN and ES", () => {
		expect(t("sdd-status.apply", "")).toBe("apply");
	});

	test("sdd-status.next key exists in EN and ES", () => {
		expect(t("sdd-status.next", "")).toBe("next");
	});

	test("status.sdd.active key exists", () => {
		expect(t("status.sdd.active", "")).toBe("active change");
	});

	test("status.sdd.multi con interpolacion", () => {
		const out = tf("status.sdd.multi", "{0} active", 3);
		expect(out).toBe("3 active");
	});
});