import { expect, test } from "bun:test";
import { measureParentContext } from "../tooling/measure-parent-context.ts";

test("measures parent tool bytes and repetition without returning payloads", () => {
	const message = (toolName: string, text: string) => JSON.stringify({ type: "message", message: { role: "toolResult", toolName, content: [{ type: "text", text }] } });
	const report = measureParentContext([message("read", "secret".repeat(1_000)), message("read", "secret".repeat(1_000)), JSON.stringify({ type: "compaction", tokensBefore: 120_000, summary: "short" })].join("\n"));
	const row = report.tools[0]!;
	expect(row).toMatchObject({ tool: "read", calls: 2, oversized: 2, repeatedBytes: 6_000 });
	expect(report.compactions).toEqual([{ tokensBefore: 120_000, summaryBytes: 5 }]);
	expect(JSON.stringify(report)).not.toContain("secret");
});
