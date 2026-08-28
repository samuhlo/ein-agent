import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runClaudeIntentPreflight } from "../ein-cc/sdd-cli/cli.ts";
import {
	resolveSddIntentPreflight,
	type SddIntentPreflightInput,
} from "../ein-pi/agent/lib/sdd-preflight.ts";
import { readPreflightRecord } from "../ein-pi/agent/lib/sdd-preflight-record.ts";

function sandbox(change: string) {
	const cwd = mkdtempSync(join(tmpdir(), "ein-intent-runtime-parity-"));
	const changeDir = join(cwd, "openspec", "changes", change);
	mkdirSync(changeDir, { recursive: true });
	writeFileSync(
		join(changeDir, "preflight.json"),
		JSON.stringify({ tdd: "strict", decidedBy: "pi", decidedAt: "2026-08-28T00:00:00.000Z" }),
	);
	return { cwd, changeDir, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function input(change: string): Omit<SddIntentPreflightInput, "resolvedBy"> {
	return {
		change,
		evidence: {} as SddIntentPreflightInput["evidence"],
		summary: "Mantener el handoff entre runtimes.",
		material: {
			objective: "Mantener el handoff",
			boundaries: { in: ["preflight"], out: ["coordinator"] },
			completionCriteria: ["El segundo runtime adopta sin preguntar"],
		},
		materialEvidence: "sufficient",
		confirmed: true,
	};
}

function piContext(cwd: string, session: string) {
	return {
		cwd,
		hasUI: false,
		sessionManager: { getSessionId: () => session },
	} as never;
}

describe("paridad de intención Pi ↔ Claude", () => {
	test("Claude adopta la resolución válida escrita por Pi sin cambiar su autoría", async () => {
		const box = sandbox("pi-a-claude");
		try {
			const first = await resolveSddIntentPreflight(
				piContext(box.cwd, "pi-writer"),
				{ ...input("pi-a-claude"), resolvedBy: "pi" },
			);
			expect(first.kind).toBe("resolved");

			const adopted = await runClaudeIntentPreflight(box.cwd, input("pi-a-claude"));
			expect(adopted.kind).toBe("adopted");
			if (adopted.kind === "adopted") expect(adopted.intent.resolvedBy).toBe("pi");
			expect(readPreflightRecord(box.changeDir)?.intent?.resolvedBy).toBe("pi");
		} finally {
			box.cleanup();
		}
	});

	test("Pi adopta la resolución válida escrita por Claude sin cambiar su autoría", async () => {
		const box = sandbox("claude-a-pi");
		try {
			const first = await runClaudeIntentPreflight(box.cwd, input("claude-a-pi"));
			expect(first.kind).toBe("resolved");

			const adopted = await resolveSddIntentPreflight(
				piContext(box.cwd, "pi-reader"),
				{ ...input("claude-a-pi"), resolvedBy: "pi" },
			);
			expect(adopted.kind).toBe("adopted");
			if (adopted.kind === "adopted") expect(adopted.intent.resolvedBy).toBe("claude");
			expect(readPreflightRecord(box.changeDir)?.intent?.resolvedBy).toBe("claude");
		} finally {
			box.cleanup();
		}
	});
});
