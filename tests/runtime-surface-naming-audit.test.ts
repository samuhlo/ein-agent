import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	auditRuntimeSurfaceNames,
	classifyRetiredReference,
	isExcludedAuditPath,
} from "./helpers/runtime-surface-naming-audit";

describe("runtime surface naming audit — fixture-only classifier", () => {
	test("classifies only stable homes and explicit legacy evidence", () => {
		expect(
			classifyRetiredReference("ein-pi/migrate.ts", 'join(home, ".pi-ein", "agent")'),
		).toMatchObject({ classification: "data-home" });
		expect(
			classifyRetiredReference(
				"installer/src/core/legacy-runtime-artifacts.ts",
				'const LEGACY_PI_LAUNCHER = "pi-ein.fish";',
			),
		).toMatchObject({ classification: "legacy-migration" });
		expect(
			classifyRetiredReference("README.md", "Run pi-ein to start"),
		).toMatchObject({ classification: "unclassified" });
	});

	test("uses exact infrastructure and archive exclusions", () => {
		expect(isExcludedAuditPath("openspec/changes/archive/old/spec.md")).toBe(true);
		expect(isExcludedAuditPath("docs/archive/current.md")).toBe(false);
		expect(isExcludedAuditPath("tests/current.test.ts")).toBe(false);
		expect(isExcludedAuditPath("openspec/changes/fix-overlay-repaint-recovery/tasks.md")).toBe(false);
	});

	test("does not follow symlinked candidates", () => {
		const root = resolve("/tmp/ein-runtime-surface-audit-fixture");
		mkdirSync(join(root, "docs"), { recursive: true });
		writeFileSync(join(root, "docs", "current.md"), "Run cc-ein now\n");
		try {
			symlinkSync(join(root, "docs", "current.md"), join(root, "linked.md"));
		} catch {
			// Idempotent fixture: a prior run may have created the link.
		}

		const hits = auditRuntimeSurfaceNames(root);
		expect(hits).toHaveLength(1);
		expect(hits[0]).toMatchObject({
			path: "docs/current.md",
			classification: "unclassified",
		});
	});
});

describe("runtime surface naming audit — live repository sentinel", () => {
	test("has no unclassified retired product spelling", () => {
		const hits = auditRuntimeSurfaceNames(resolve(import.meta.dir, ".."));
		const stale = hits.filter((hit) => hit.classification === "unclassified");
		expect(stale, stale.map((hit) => `${hit.path}:${hit.line} ${hit.context}`).join("\n")).toEqual([]);
	});
});
