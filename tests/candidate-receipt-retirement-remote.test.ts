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
