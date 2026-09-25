import { expect, test } from "bun:test";
import { composePrArtifact } from "../ein-pi/agent/lib/pr-artifact.ts";

const input = {
	base: "dev", head: "feat/alta-cursos", title: "Añade cursos desde el centro",
	intent: "Permite que una academia cree un curso desde su panel.",
	changes: ["El panel abre el asistente para el centro visible.", "El guardado vuelve a la lista."],
	mechanism: "El asistente recibe el identificador del centro visible. Al guardar, revalida la sesión y envía una sola petición; el panel recarga la lista confirmada.",
	verification: ["`bun run test`: 3155 pruebas correctas.", "Chromium: 2/2 escenarios."],
	risks: ["La API de navegador está simulada; la autorización del servidor se prueba aparte."],
};

test("builds Samu's title badge and numbered PR body from facts", () => {
	const result = composePrArtifact(input, "es");
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.title).toBe("[[FEAT]] Añade cursos desde el centro");
	expect(result.body).toContain("> Intención corta: Permite que una academia cree un curso desde su panel.");
	for (const heading of ["// 001. QUÉ CAMBIA", "// 002. CÓMO FUNCIONA POR DENTRO", "// 003. CÓMO PROBARLO", "// 004. RIESGOS"]) expect(result.body).toContain(heading);
	expect(result.body).toContain(input.mechanism);
	expect(result.body).not.toContain("Closes #");
});

test("preserves a custom badge and links an issue only when supplied", () => {
	const result = composePrArtifact({ ...input, badge: "F5", issue: "#104", exception: { production: 1031, productionBytes: 42087 } }, "es");
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.title.startsWith("[[F5]]")).toBeTrue();
	expect(result.body).toContain("Closes #104");
	expect(result.body).toContain("1.031 líneas");
});

test("uses the artifact language and rejects an empty mechanism", () => {
	const english = composePrArtifact(input, "en");
	expect(english.ok).toBe(true);
	if (english.ok) expect(english.body).toContain("// 002. HOW IT WORKS UNDER THE HOOD");
	expect(composePrArtifact({ ...input, mechanism: "" }, "es")).toMatchObject({ ok: false });
	expect(composePrArtifact({ ...input, title: "[[TAG]] Añade cursos" }, "es")).toMatchObject({ ok: true, title: "[[FEAT]] Añade cursos" });
});
