import { describe, expect, test } from "bun:test";
import { localInstallSteps, runLocalInstall } from "../tooling/dev-install.ts";

describe("local development install", () => {
	test("builds one host target and installs the compiled binary with forwarded arguments", () => {
		const steps = localInstallSteps("/repo with spaces", ["--dry-run", "--runtime", "pi"], "darwin", "arm64");
		expect(steps).toEqual([
			{ command: [process.execPath, "run", "build:all", "darwin-arm64"], cwd: "/repo with spaces/installer" },
			{ command: ["/repo with spaces/installer/dist/ein-installer-darwin-arm64", "install", "--dry-run", "--runtime", "pi"], cwd: "/repo with spaces" },
		]);
	});
	test("never installs a stale binary when compilation fails", async () => {
		const executed: string[][] = [];
		const code = await runLocalInstall(localInstallSteps("/repo", [], "linux", "x64"), async (step) => { executed.push(step.command); return 17; });
		expect(code).toBe(17);
		expect(executed).toHaveLength(1);
	});
	test("build-only does not deploy and unsupported hosts cannot begin", () => {
		expect(localInstallSteps("/repo", ["--build-only"], "linux", "arm64")).toHaveLength(1);
		expect(() => localInstallSteps("/repo", [], "win32", "x64")).toThrow("no soportada");
	});
	test("propagates installation failure after a successful build", async () => {
		let calls = 0;
		expect(await runLocalInstall(localInstallSteps("/repo", []), async () => ++calls === 1 ? 0 : 23)).toBe(23);
		expect(calls).toBe(2);
	});
});
