import { describe, expect, test } from "bun:test";
import {
	GITHUB_PR_VIEW_TIMEOUT_MS,
	observeMergedPullRequest,
	resolveExplicitPushRemoteRepository,
	type RemoteCommandRunner,
} from "../ein-pi/agent/lib/candidate-receipt-retirement-remote";

describe("adaptador remoto de retiro", () => {
	test("usa pushurl único y rechaza varios destinos", async () => {
		const one: RemoteCommandRunner = async (_file, args) => {
			expect(args).toEqual(["remote", "get-url", "--push", "--all", "origin"]);
			return "git@github.com:Owner/Repo.git\n";
		};
		expect(await resolveExplicitPushRemoteRepository("/repo", "origin", one)).toBe("owner/repo");
		const many: RemoteCommandRunner = async () => "git@github.com:owner/repo.git\nhttps://github.com/owner/other.git\n";
		expect(await resolveExplicitPushRemoteRepository("/repo", "origin", many)).toBeNull();
	});

	test("normaliza un PR merged del mismo repositorio mediante el runner inyectado", async () => {
		const controller = new AbortController();
		const runner: RemoteCommandRunner = async (file, args, options) => {
			expect(file).toBe("gh");
			expect(args).toEqual([
				"pr",
				"view",
				"42",
				"--repo",
				"owner/repo",
				"--json",
				"number,url,state,mergedAt,mergeCommit,headRepository,headRefName,headRefOid,baseRefName",
			]);
			expect(options.timeoutMs).toBe(GITHUB_PR_VIEW_TIMEOUT_MS);
			expect(options.signal).toBe(controller.signal);
			return JSON.stringify({
				number: 42,
				url: "https://github.com/Owner/Repo/pull/42",
				state: "MERGED",
				mergedAt: "2026-07-30T12:00:00Z",
				mergeCommit: { oid: "abcdef0123456789abcdef0123456789abcdef01" },
				headRepository: { nameWithOwner: "Owner/Repo" },
				headRefName: "feature/receipt-retirement",
				headRefOid: "0123456789abcdef0123456789abcdef01234567",
				baseRefName: "main",
			});
		};

		expect(await observeMergedPullRequest("/repo", "owner/repo", 42, controller.signal, runner)).toEqual({
			repository: "owner/repo",
			prNumber: 42,
			url: "https://github.com/Owner/Repo/pull/42",
			state: "MERGED",
			headRepository: "owner/repo",
			headRef: "feature/receipt-retirement",
			headRefOid: "0123456789abcdef0123456789abcdef01234567",
			baseRef: "main",
			mergeCommitOid: "abcdef0123456789abcdef0123456789abcdef01",
		});
	});

	test("el view usa timeout, propaga AbortSignal y falla cerrado", async () => {
		const controller = new AbortController();
		let seenTimeout = 0;
		let seenSignal: AbortSignal | undefined;
		const runner: RemoteCommandRunner = async (_file, _args, options) => {
			seenTimeout = options.timeoutMs ?? 0;
			seenSignal = options.signal;
			throw new Error("timeout");
		};
		expect(await observeMergedPullRequest("/repo", "owner/repo", 7, controller.signal, runner)).toBeNull();
		expect(seenTimeout).toBe(GITHUB_PR_VIEW_TIMEOUT_MS);
		expect(seenSignal).toBe(controller.signal);
		controller.abort();
		expect(await observeMergedPullRequest("/repo", "owner/repo", 7, controller.signal, runner)).toBeNull();
	});
});
