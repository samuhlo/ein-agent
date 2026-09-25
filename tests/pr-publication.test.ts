import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { guardChildCommand } from "../ein-pi/agent/extensions/internal/ein-command-guard-child.ts";
import { publishPr } from "../ein-pi/agent/lib/pr-publication.ts";
import { classifyContinuityTool } from "../ein-pi/agent/lib/continuity-operations.ts";
import prCreateChild from "../ein-pi/agent/extensions/internal/ein-pr-create-child.ts";

const input = {
	base: "dev", head: "feat/alta-cursos", title: "Añade cursos desde el centro",
	intent: "La academia puede crear cursos desde su panel.",
	changes: ["Abre el asistente para el centro visible."],
	mechanism: "El cliente conserva el centro autorizado y envía un POST único; el panel recarga la lista tras el acuse.",
	verification: ["Suite final: 3155 pruebas correctas.", "Chromium: 2/2."],
	risks: ["La API del navegador estaba simulada."],
};

test("publishes a tagged PR only for the reviewed and pushed commit, then reads it back", () => {
	const headOid = "a".repeat(40);
	let created: { title: string; body: string } | undefined;
	let labelApplied = false;
	const ports = {
		check: () => ({ ok: true as const, headOid, exception: { production: 1031, productionBytes: 42087 } }),
		remoteHead: () => headOid,
		gh: (_cwd: string, args: string[]) => {
			if (args[0] === "label") return { status: 0, stdout: JSON.stringify([{ name: "type:feature" }]), stderr: "" };
			if (args[1] === "edit") { labelApplied = args.at(-1) === "type:feature"; return { status: 0, stdout: "", stderr: "" }; }
			if (args[1] === "create") {
				created = { title: args[args.indexOf("--title") + 1]!, body: readFileSync(args[args.indexOf("--body-file") + 1]!, "utf8") };
				return { status: 0, stdout: "https://github.com/samuhlo/demo/pull/104\n", stderr: "" };
			}
			return { status: 0, stdout: JSON.stringify({ url: "https://github.com/samuhlo/demo/pull/104", title: created!.title, body: created!.body.trimEnd(), baseRefName: "dev", headRefName: "feat/alta-cursos", state: "OPEN", labels: labelApplied ? [{ name: "type:feature" }] : [] }), stderr: "" };
		},
	};
	const result = publishPr("/unused", input, "es", ports as never);
	expect(result).toMatchObject({ ok: true, title: "[[FEAT]] Añade cursos desde el centro", label: "type:feature" });
	expect(created!.body).toContain("// 002. CÓMO FUNCIONA POR DENTRO");
	expect(created!.body).toContain("1.031 líneas");
	expect(created!.body).not.toContain("Closes #");
});

test("cannot create a PR when the remote branch or review approval is missing", () => {
	let ghCalls = 0;
	const ports = { check: () => ({ ok: true, headOid: "a".repeat(40) }), remoteHead: () => "b".repeat(40), gh: () => { ghCalls++; return { status: 0, stdout: "", stderr: "" }; } };
	expect(publishPr("/unused", input, "es", ports as never)).toMatchObject({ ok: false, reason: "remote branch does not match the reviewed commit" });
	expect(ghCalls).toBe(0);
	ports.check = () => ({ ok: false, reason: "review exception unavailable" }) as never;
	expect(publishPr("/unused", input, "es", ports as never).ok).toBe(false);
	expect(ghCalls).toBe(0);
});

test("raw gh pr create is redirected to the formatter, including through shell wrappers", async () => {
	for (const command of ["GH_PROMPT_DISABLED=1 gh pr create --title x", "bash -lc 'gh pr create --base dev --head feat/x'"]) {
		const result = await guardChildCommand({ toolName: "bash", input: { command } } as never, { cwd: "/unused" } as never);
		expect(result).toMatchObject({ block: true });
		expect(result!.reason).toContain("ein_pr_create");
	}
});

test("the git child registers the structured PR tool", async () => {
	let tool: any;
	prCreateChild({ registerTool(value: unknown) { tool = value; } } as never);
	expect(tool.name).toBe("ein_pr_create");
	expect(classifyContinuityTool("ein_pr_create", input)).toBe("external-or-unknown");
	const result = await tool.execute("id", { ...input, base: "../bad" }, undefined, undefined, { cwd: "/unused" });
	expect(result.isError).toBe(true);
	expect(result.content[0].text).toContain("invalid PR refs");
});
