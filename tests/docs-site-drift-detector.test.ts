import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { detectDrift, type GitRunner, type GitRunResult } from "../ein-pi/agent/lib/docs-site-drift-detector.ts";

function fakeRunner(handlers: Record<string, (args: string[]) => GitRunResult>): GitRunner {
	return (args: string[]) => {
		for (const [prefix, handler] of Object.entries(handlers)) {
			if (args[0] === prefix) return handler(args);
		}
		return { ok: true, code: 0, stdout: "", stderr: "" };
	};
}

describe("detectDrift", () => {
	test("rev inexistente devuelve unknown con reason rev-not-found (no clean)", () => {
		const runner = fakeRunner({
			"rev-parse": (args) => {
				if (args[1] === "--git-dir") return { ok: true, code: 0, stdout: ".git", stderr: "" };
				return { ok: false, code: 1, stdout: "", stderr: "not found" };
			},
		});
		const report = detectDrift([{ path: "x.md", verifiedRev: "deadbee", sources: ["README.md"] }], "/repo", runner);
		expect(report.pages[0].status).toBe("unknown");
		expect(report.pages[0].reason).toBe("rev-not-found");
		expect(report.counts.unknown).toBe(1);
		expect(report.counts.clean).toBe(0);
	});

	test("fuente modificada devuelve drifted con recuento de líneas", () => {
		const runner = fakeRunner({
			"rev-parse": () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
			diff: (args) => {
				if (args.includes("--numstat")) return { ok: true, code: 0, stdout: "5\t2\tREADME.md\n", stderr: "" };
				return { ok: true, code: 0, stdout: "M\tREADME.md\n", stderr: "" };
			},
		});
		const report = detectDrift([{ path: "x.md", verifiedRev: "0ae709d", sources: ["README.md"] }], "/repo", runner);
		expect(report.pages[0].status).toBe("drifted");
		expect(report.pages[0].sourcesChanged[0]).toEqual({ path: "README.md", status: "modified", linesAdded: 5, linesRemoved: 2 });
	});

	test("fuente eliminada reporta status deleted", () => {
		const runner = fakeRunner({
			"rev-parse": () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
			diff: (args) => {
				if (args.includes("--numstat")) return { ok: true, code: 0, stdout: "0\t5\tREADME.md\n", stderr: "" };
				return { ok: true, code: 0, stdout: "D\tREADME.md\n", stderr: "" };
			},
		});
		const report = detectDrift([{ path: "x.md", verifiedRev: "0ae709d", sources: ["README.md"] }], "/repo", runner);
		expect(report.pages[0].sourcesChanged[0].status).toBe("deleted");
	});

	test("directorio no es repo devuelve not-a-repo para todas las páginas", () => {
		const runner = fakeRunner({
			"rev-parse": (args) => (args[1] === "--git-dir" ? { ok: false, code: 128, stdout: "", stderr: "not a repo" } : { ok: true, code: 0, stdout: "", stderr: "" }),
		});
		const report = detectDrift([{ path: "x.md", verifiedRev: "0ae709d", sources: ["README.md"] }], "/repo", runner);
		expect(report.pages[0].status).toBe("unknown");
		expect(report.pages[0].reason).toBe("not-a-repo");
	});

	test("dos páginas con revs distintos se procesan sin compartir rev", () => {
		const seenRevs: string[] = [];
		const runner = fakeRunner({
			"rev-parse": (args) => {
				if (args[1] === "--git-dir") return { ok: true, code: 0, stdout: "", stderr: "" };
				seenRevs.push(args[3]);
				return { ok: true, code: 0, stdout: "", stderr: "" };
			},
			diff: () => ({ ok: true, code: 0, stdout: "", stderr: "" }),
		});
		const report = detectDrift(
			[
				{ path: "a.md", verifiedRev: "0ae709d", sources: ["README.md"] },
				{ path: "b.md", verifiedRev: "2f67c73", sources: ["README.md"] },
			],
			"/repo",
			runner,
		);
		expect(seenRevs).toEqual(["0ae709d^{commit}", "2f67c73^{commit}"]);
		expect(report.pages[0].verifiedRev).toBe("0ae709d");
		expect(report.pages[1].verifiedRev).toBe("2f67c73");
	});

	test("integración: repo temporal con GitRunner real detecta drifted", () => {
		const dir = mkdtempSync(join(tmpdir(), "docs-drift-"));
		try {
			execFileSync("git", ["init", "-q"], { cwd: dir });
			execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
			execFileSync("git", ["config", "user.name", "test"], { cwd: dir });
			writeFileSync(join(dir, "fuente.md"), "v1\n");
			execFileSync("git", ["add", "."], { cwd: dir });
			execFileSync("git", ["commit", "-q", "-m", "v1"], { cwd: dir });
			const v1 = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
			writeFileSync(join(dir, "fuente.md"), "v1\nv2\nv3\n");
			execFileSync("git", ["add", "."], { cwd: dir });
			execFileSync("git", ["commit", "-q", "-m", "v2"], { cwd: dir });

			const report = detectDrift([{ path: "pagina.md", verifiedRev: v1, sources: ["fuente.md"] }], dir);
			expect(report.pages[0].status).toBe("drifted");
			expect(report.pages[0].sourcesChanged[0].linesAdded).toBeGreaterThan(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
