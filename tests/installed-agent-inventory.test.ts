import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployTemplate } from "../installer/src/core/deploy.ts";
import { detectPlatform } from "../installer/src/core/platform.ts";
import { resolvePiInstallContext } from "../installer/src/core/paths.ts";
import { runDoctor, type DoctorReport } from "../installer/src/core/verify.ts";
import { inspectCommonDoctor, summarizeDoctorChecks } from "../ein-pi/agent/lib/doctor-core.ts";
import type { LinearIntegration } from "../ein-pi/agent/lib/linear-integration.ts";
import { doctorSmokeReport } from "../ein-pi/agent/extensions/ein-doctor.ts";
import {
	assertUniqueSharedOverlayFiles,
	sharedTypeScriptFiles,
} from "../installer/scripts/bundle-template.ts";

const ROOT = join(import.meta.dir, "..");
const SOURCE_AGENTS = join(ROOT, "runtime", "agents");
const BUNDLE_SCRIPT = join(ROOT, "installer", "scripts", "bundle-template.ts");
const SHARED_SOURCE_ROOTS = [
	join(ROOT, "shared", "contracts"),
	join(ROOT, "shared", "sdd"),
] as const;

function sourceAgents(): string[] {
	return readdirSync(SOURCE_AGENTS).filter((file) => file.endsWith(".md")).sort();
}

function sharedSources(): { name: string; path: string }[] {
	return SHARED_SOURCE_ROOTS.flatMap((root) =>
		readdirSync(root, { withFileTypes: true })
			.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
			.map((entry) => ({ name: entry.name, path: join(root, entry.name) })),
	).sort((left, right) => left.name.localeCompare(right.name, "en"));
}

function bundledTemplate(): { root: string; archive: string; payload: string } {
	const root = mkdtempSync(join(tmpdir(), "ein-template-inventory-")); const archive = join(root, "template.tar.gz"); const payload = join(root, "payload"); mkdirSync(payload);
	const app = join(root, "ein-app"); writeFileSync(app, "APP"); chmodSync(app, 0o755);
	const result = Bun.spawnSync(["bun", "run", BUNDLE_SCRIPT], { cwd: ROOT, env: { ...process.env, EIN_TEMPLATE_OUT: archive, EIN_APP_BINARY: app, EIN_APP_TARGET: "test-target" } });
	expect(result.exitCode).toBe(0);
	const extract = Bun.spawnSync(["tar", "-xzf", archive, "-C", payload]);
	expect(extract.exitCode).toBe(0);
	return { root, archive, payload };
}

function doctorCheck(report: DoctorReport, name: string) {
	return report.groups.flatMap((group) => group.checks).find((check) => check.name === name);
}

function runtimeDoctorLevel(report: string, name: string): "OK" | "WARN" | "FAIL" | undefined {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = report.match(new RegExp(`^- (OK|WARN|FAIL) - ${escaped}:`, "m"));
	return match?.[1] as "OK" | "WARN" | "FAIL" | undefined;
}

const LINEAR_DOCTOR_CHECKS = [
	"linear integration module",
	"linear dynamic prompt",
	"linear prompt directive",
	"linear integration evidence",
] as const;
const SHARED_DOCTOR_GROUPS = new Set(["CORE", "PAQUETES PI", "MCP", "SKILLS", "GUARDRAILS", "COHERENCIA"]);
const INSTALLER_ONLY_DOCTOR_CHECKS = new Set(["extensions-manifest.json", "engram command", "terminal app"]);

describe("inventario instalado de agentes", () => {
	test("el scan fuente genera agents, assets/agents y manifest idénticos", () => {
		const staging = bundledTemplate();
		try {
			const source = sourceAgents();
			const staged = readdirSync(join(staging.payload, "agents")).filter((file) => file.endsWith(".md")).sort();
			const assets = readdirSync(join(staging.payload, "assets", "agents")).filter((file) => file.endsWith(".md")).sort();
			const manifest = JSON.parse(readFileSync(join(staging.payload, "template-manifest.json"), "utf8")) as { agents: string[]; terminalApp: { path: string; target: string; mode: string } };
			const settings = JSON.parse(readFileSync(join(staging.payload, "settings.json"), "utf8")) as Record<string, unknown>;
			const policy = readFileSync(join(staging.payload, "AGENTS.md"), "utf8");
			expect(source).toContain("ein-scout.md");
			expect(staged).toEqual(source);
			expect(assets).toEqual(source);
			expect(manifest.agents).toEqual(source);
			expect(manifest.terminalApp).toEqual(expect.objectContaining({ path: "bin/ein", target: "test-target", mode: "0755" }));
			expect(settings).not.toHaveProperty("defaultProvider");
			expect(settings).not.toHaveProperty("defaultModel");
			expect(settings).not.toHaveProperty("enabledModels");
			expect(readFileSync(join(staging.payload, "bin", "ein"), "utf8")).toBe("APP");
			expect(existsSync(join(staging.payload, "lib", "linear-integration.ts"))).toBe(true);
			expect(existsSync(join(staging.payload, "lib", "doctor-core.ts"))).toBe(true);
			const sharedIntent = readFileSync(join(staging.payload, "lib", "sdd-intent-resolution.ts"), "utf8");
			expect(sharedIntent).toContain("createSddIntentPreflightCoordinator");
			expect(sharedIntent).not.toContain("Compatibility entrypoint");
			expect(existsSync(join(staging.payload, "lib", "mode.ts"))).toBe(false);
			expect(policy).toContain("Current filesystem, Git, ProjectState/stateRef, and OpenSpec evidence outrank memory");
			expect(policy).toContain(".engram-ein");
			expect(policy).toContain("ONE notebook shared by both runtimes");
		} finally {
			rmSync(staging.root, { recursive: true, force: true });
		}
	});

	test("el overlay instalado contiene cada módulo compartido byte a byte", () => {
		const staging = bundledTemplate();
		try {
			const sources = sharedSources();
			expect(sources.length).toBeGreaterThan(0);
			for (const source of sources) {
				expect(readFileSync(join(staging.payload, "lib", source.name))).toEqual(readFileSync(source.path));
			}
		} finally {
			rmSync(staging.root, { recursive: true, force: true });
		}
	});

	test("el inventario compartido rechaza fuentes no regulares y nombres que se pisarían", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-shared-inventory-"));
		try {
			writeFileSync(join(root, "valid.ts"), "export {};\n");
			mkdirSync(join(root, "invalid.ts"));
			expect(() => sharedTypeScriptFiles(root)).toThrow("deben ser ficheros regulares: invalid.ts");
			expect(() => assertUniqueSharedOverlayFiles([
				{ root: "contracts", files: ["same.ts"] },
				{ root: "sdd", files: ["same.ts"] },
			])).toThrow("Colisión en el overlay compartido");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("un usuario nuevo puede instalar antes de elegir sus modelos", () => {
		const staging = bundledTemplate();
		try {
			const inspection = inspectCommonDoctor({
				agentDir: staging.payload,
				linearCwd: staging.root,
				localSkillsDir: join(staging.payload, "skills", "local"),
				downloadedSkillsDir: join(staging.payload, "skills", "downloaded"),
			});
			const enabledModels = inspection.checks.core.find(({ name }) => name === "enabledModels");
			const core = summarizeDoctorChecks([{ title: "CORE", checks: inspection.checks.core }]);

			expect(enabledModels?.level).toBe("WARN");
			expect(enabledModels?.detail).toContain("primera sesión");
			expect(core).toMatchObject({ fail: 0, warn: 1, result: "OK_WITH_WARNINGS" });
		} finally {
			rmSync(staging.root, { recursive: true, force: true });
		}
	});

	for (const linear of ["off", "on"] as const satisfies readonly LinearIntegration[]) {
		test(`deploy persiste Linear ${linear} desde el archive staged`, async () => {
			const staging = bundledTemplate();
			const home = join(staging.root, "home");
			const context = resolvePiInstallContext(home);
			try {
				await deployTemplate(
					{ ...detectPlatform(), home },
					{ linear, archivePath: staging.archive },
					context,
				);
				expect(readFileSync(join(context.agentDir, "ein-mode.json"), "utf8")).toBe(
					`${JSON.stringify({ linear }, null, 2)}\n`,
				);
				// The fixture binary exists only in the injected archive, not the source tree.
				expect(readFileSync(join(context.agentDir, "bin", "ein"), "utf8")).toBe("APP");
			} finally {
				rmSync(staging.root, { recursive: true, force: true });
			}
		});
	}

	test("los doctors reales mantienen paridad común para Linear válido y roturas staged", async () => {
		const staging = bundledTemplate();
		const scenarios: readonly {
			name: string;
			linear: LinearIntegration;
			mutate?: (agentDir: string) => void;
			failed?: (typeof LINEAR_DOCTOR_CHECKS)[number];
		}[] = [
			{ name: "valid off", linear: "off" },
			{ name: "valid on", linear: "on" },
			{ name: "missing module", linear: "off", failed: "linear integration module", mutate: (agentDir) => rmSync(join(agentDir, "lib", "linear-integration.ts")) },
			{ name: "missing dynamic read", linear: "off", failed: "linear dynamic prompt", mutate: (agentDir) => {
				const path = join(agentDir, "extensions", "internal", "ein-agent-prompt-hook.ts");
				writeFileSync(path, readFileSync(path, "utf8").replace("readLinearIntegration(ctx.cwd)", '"off"'));
			} },
			{ name: "missing directive", linear: "off", failed: "linear prompt directive", mutate: (agentDir) => {
				const path = join(agentDir, "lib", "persona.ts");
				writeFileSync(path, readFileSync(path, "utf8").replace("${linearDirective(linear)}", ""));
			} },
			{ name: "unknown evidence", linear: "off", failed: "linear integration evidence", mutate: (agentDir) => writeFileSync(join(agentDir, "ein-mode.json"), '{"linear":"unknown"}\n') },
			{ name: "malformed evidence", linear: "off", failed: "linear integration evidence", mutate: (agentDir) => writeFileSync(join(agentDir, "ein-mode.json"), "{broken\n") },
			{ name: "unreadable evidence", linear: "off", failed: "linear integration evidence", mutate: (agentDir) => chmodSync(join(agentDir, "ein-mode.json"), 0o000) },
		];

		try {
			for (const [index, scenario] of scenarios.entries()) {
				const home = join(staging.root, `doctor-home-${index}`);
				const context = resolvePiInstallContext(home);
				await deployTemplate({ ...detectPlatform(), home }, { linear: scenario.linear, archivePath: staging.archive }, context);
				scenario.mutate?.(context.agentDir);
				const installerReport = runDoctor({ ...detectPlatform(), home }, context);
				const runtimeReport = doctorSmokeReport(context.agentDir, context.home);
				for (const name of LINEAR_DOCTOR_CHECKS) {
					const expected = name === scenario.failed ? "FAIL" : "OK";
					const installerLevel = doctorCheck(installerReport, name)?.level;
					const runtimeLevel = runtimeDoctorLevel(runtimeReport, name);
					expect({ scenario: scenario.name, name, installerLevel, runtimeLevel }).toEqual({
						scenario: scenario.name,
						name,
						installerLevel: expected,
						runtimeLevel: expected,
					});
				}
				for (const group of installerReport.groups.filter(({ title }) => SHARED_DOCTOR_GROUPS.has(title))) {
					for (const check of group.checks.filter(({ name }) => !INSTALLER_ONLY_DOCTOR_CHECKS.has(name))) {
						expect({ scenario: scenario.name, name: check.name, installer: check.level, runtime: runtimeDoctorLevel(runtimeReport, check.name) }).toEqual({
							scenario: scenario.name,
							name: check.name,
							installer: check.level,
							runtime: check.level,
						});
					}
				}
			}
		} finally {
			rmSync(staging.root, { recursive: true, force: true });
		}
	}, 15_000);

	test("install fallback y doctor incluyen scout sin ampliar los siete SDD", () => {
		const verify = readFileSync(join(ROOT, "installer", "src", "core", "verify.ts"), "utf8");
		const doctor = readFileSync(join(ROOT, "ein-pi", "agent", "extensions", "ein-doctor.ts"), "utf8");
		expect(verify).toContain('NON_SDD_AGENTS = ["ein-linear.md", "ein-git.md", "ein-scout.md", "ein-cleaner.md", "ein-architect.md"]');
		expect(verify).toContain("manifest?.agents?.length ? manifest.agents");
		expect(doctor).toContain('"ein-scout.md"');
		expect(doctor).toContain('"ein-scout tools"');
		expect(doctor).toContain('"ein-scout extensions"');
		expect(doctor).toContain("static extension contract");
		expect(doctor).toContain("no es una sonda ni recibo por ejecución");
		expect((verify.match(/sdd-[a-z]+\.md/g) ?? []).slice(0, 7)).toEqual([
			"sdd-scope.md", "sdd-map.md", "sdd-design.md", "sdd-tasks.md", "sdd-apply.md", "sdd-verify.md", "sdd-close.md",
		]);
	});

	test("el bundler conserva un scan list-free", () => {
		const bundle = readFileSync(BUNDLE_SCRIPT, "utf8");
		expect(bundle).not.toContain("ein-scout.md");
		expect(bundle).toContain('listMd(join(staging, "agents"))');
		expect(existsSync(join(SOURCE_AGENTS, "ein-scout.md"))).toBe(true);
	});
});
