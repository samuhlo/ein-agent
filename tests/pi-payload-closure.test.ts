import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	assertEntrypointsCompile,
	assertRelativeTypeScriptModuleClosure,
	assertSharedOverlayFacades,
} from "../installer/scripts/pi-payload-validation.ts";
import { sharedTypeScriptFiles } from "../installer/scripts/bundle-template.ts";

const ROOT = join(import.meta.dir, "..");
const AGENT_LIB = join(ROOT, "ein-pi", "agent", "lib");
const SHARED_GROUPS = [
	{ root: join(ROOT, "shared", "contracts"), namespace: "contracts" as const },
	{ root: join(ROOT, "shared", "sdd"), namespace: "sdd" as const },
];

describe("Pi installed payload closure", () => {
	test("every shared module has one pure checkout facade", () => {
		const groups = SHARED_GROUPS.map((group) => ({
			...group,
			files: sharedTypeScriptFiles(group.root),
		}));
		expect(groups.flatMap((group) => group.files).length).toBeGreaterThan(0);
		expect(() => assertSharedOverlayFacades(AGENT_LIB, groups)).not.toThrow();
	});

	test("a composition cannot occupy a shared facade name", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-pi-facade-"));
		const shared = join(root, "shared");
		const lib = join(root, "lib");
		mkdirSync(shared);
		mkdirSync(lib);
		try {
			writeFileSync(join(shared, "policy.ts"), "export const policy = true;\n");
			writeFileSync(
				join(lib, "policy.ts"),
				'export * from "../../../shared/sdd/policy.ts";\nexport const runtime = true;\n',
			);
			expect(() => assertSharedOverlayFacades(lib, [{
				root: shared,
				namespace: "sdd",
				files: ["policy.ts"],
			}])).toThrow("único re-export puro");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("nested shared TypeScript is rejected instead of silently omitted", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-shared-nested-"));
		mkdirSync(join(root, "nested"));
		try {
			writeFileSync(join(root, "top.ts"), "export {};\n");
			writeFileSync(join(root, "nested", "hidden.ts"), "export {};\n");
			expect(() => sharedTypeScriptFiles(root)).toThrow("deben vivir en la raíz plana: nested/hidden.ts");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("the graph gate includes missing type-only imports", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-pi-type-import-"));
		try {
			writeFileSync(join(root, "entry.ts"), 'import type { Missing } from "./missing.ts";\nexport type Value = Missing;\n');
			expect(() => assertRelativeTypeScriptModuleClosure(root)).toThrow("entry.ts:1 no resuelve: ./missing.ts");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("the graph gate rejects an existing module outside the payload", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-pi-escape-"));
		const payload = join(root, "payload");
		mkdirSync(payload);
		try {
			writeFileSync(join(root, "outside.ts"), "export const outside = true;\n");
			writeFileSync(join(payload, "entry.ts"), 'export { outside } from "../outside.ts";\n');
			expect(() => assertRelativeTypeScriptModuleClosure(payload)).toThrow("entry.ts:1 escapa del payload: ../outside.ts");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("the entrypoint gate catches a missing named export", async () => {
		const root = mkdtempSync(join(tmpdir(), "ein-pi-export-"));
		try {
			writeFileSync(join(root, "dependency.ts"), "export const present = true;\n");
			writeFileSync(join(root, "entry.ts"), 'import { missing } from "./dependency.ts";\nconsole.log(missing);\n');
			await expect(assertEntrypointsCompile([join(root, "entry.ts")])).rejects.toThrow("entrypoints Pi no compilan");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
