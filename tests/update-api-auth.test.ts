import { expect, test } from "bun:test";
import { defaultUpdateCaps } from "../installer/src/core/update-caps.ts";

test("release metadata can authenticate without forwarding credentials to asset redirects", async () => {
  const savedFetch = globalThis.fetch;
  const savedToken = process.env.GH_TOKEN;
  const savedFallback = process.env.GITHUB_TOKEN;
  const requests: { url: string; authorization: string | null }[] = [];
  try {
    process.env.GH_TOKEN = "fixture-token";
    globalThis.fetch = (async (url: URL | string, options?: RequestInit) => {
      requests.push({ url: String(url), authorization: new Headers(options?.headers).get("authorization") });
      return String(url).startsWith("https://api.github.com/")
        ? new Response(null, { status: 302, headers: { location: "https://release-assets.githubusercontent.com/fixture" } })
        : new Response("asset");
    }) as typeof fetch;
    await defaultUpdateCaps().http.get("https://api.github.com/repos/example/repo/releases");
    expect(requests.map((r) => r.authorization)).toEqual(["Bearer fixture-token", null]);
    delete process.env.GH_TOKEN;
    process.env.GITHUB_TOKEN = "fixture-fallback";
    requests.length = 0;
    await defaultUpdateCaps().http.get("https://api.github.com/repos/example/repo/releases");
    expect(requests.map((r) => r.authorization)).toEqual(["Bearer fixture-fallback", null]);
    delete process.env.GITHUB_TOKEN;
    requests.length = 0;
    await defaultUpdateCaps().http.get("https://api.github.com/repos/example/repo/releases");
    expect(requests.map((r) => r.authorization)).toEqual([null, null]);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedToken === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = savedToken;
    if (savedFallback === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = savedFallback;
  }
});
