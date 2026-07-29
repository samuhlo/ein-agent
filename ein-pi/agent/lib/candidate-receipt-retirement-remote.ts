import { execFile } from "node:child_process";
import type { NormalizedMergedPullRequestObservation } from "./delivery-receipt.ts";

export const GITHUB_PR_VIEW_TIMEOUT_MS = 10_000;

export type RemoteCommandOptions = {
	cwd: string;
	timeoutMs?: number;
	signal?: AbortSignal;
};

export type RemoteCommandRunner = (file: string, args: string[], options: RemoteCommandOptions) => Promise<string>;

export function runRemoteCommand(file: string, args: string[], options: RemoteCommandOptions): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(file, args, {
			cwd: options.cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: options.timeoutMs,
			signal: options.signal,
		}, (error, stdout) => {
			if (error) reject(error);
			else resolve(stdout);
		});
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeGitHubRepository(remoteUrl: string): string | null {
	const value = remoteUrl.trim().replace(/\.git\/?$/, "");
	const match = /^(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+)$/i.exec(value);
	if (!match?.[1] || !match[2] || !/^[A-Za-z0-9_.-]+$/.test(match[1]) || !/^[A-Za-z0-9_.-]+$/.test(match[2])) return null;
	return `${match[1]}/${match[2]}`.toLowerCase();
}

// FAIL CLOSED -> Un pushurl define el destino real; varias URLs no identifican uno.
export async function resolveExplicitPushRemoteRepository(cwd: string, remote: string, run: RemoteCommandRunner = runRemoteCommand): Promise<string | null> {
	if (!/^[A-Za-z0-9_.-]+$/.test(remote)) return null;
	try {
		const output = await run("git", ["remote", "get-url", "--push", "--all", remote], { cwd });
		const urls = output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
		if (urls.length !== 1) return null;
		return normalizeGitHubRepository(urls[0]!);
	} catch {
		return null;
	}
}

export async function observeMergedPullRequest(
	cwd: string,
	repository: string,
	prNumber: number,
	signal?: AbortSignal,
	run: RemoteCommandRunner = runRemoteCommand,
): Promise<NormalizedMergedPullRequestObservation | null> {
	if (!repository || !Number.isSafeInteger(prNumber) || prNumber < 1 || signal?.aborted) return null;
	try {
		const output = await run("gh", ["pr", "view", String(prNumber), "--repo", repository, "--json", "number,url,state,mergedAt,mergeCommit,headRepository,headRefName,headRefOid,baseRefName"], {
			cwd,
			timeoutMs: GITHUB_PR_VIEW_TIMEOUT_MS,
			signal,
		});
		const raw: unknown = JSON.parse(output);
		if (!isRecord(raw) || raw.state !== "MERGED" || typeof raw.mergedAt !== "string" || !isRecord(raw.mergeCommit) || !isRecord(raw.headRepository)) return null;
		const mergeCommitOid = raw.mergeCommit.oid;
		const headRepository = raw.headRepository.nameWithOwner;
		if (typeof raw.number !== "number" || typeof raw.url !== "string" || typeof raw.headRefName !== "string" || typeof raw.headRefOid !== "string" || typeof raw.baseRefName !== "string" || typeof mergeCommitOid !== "string" || typeof headRepository !== "string") return null;
		return {
			repository,
			prNumber: raw.number,
			url: raw.url,
			state: "MERGED",
			headRepository: headRepository.toLowerCase(),
			headRef: raw.headRefName,
			headRefOid: raw.headRefOid,
			baseRef: raw.baseRefName,
			mergeCommitOid,
		};
	} catch {
		return null;
	}
}
