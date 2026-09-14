import { expect, test } from "bun:test";
import { fetchLatestRelease } from "../installer/src/core/release-record.ts";
const release = (version: string) => ({ tag_name: `installer-v${version}`, html_url: `https://example.test/${version}`, prerelease: version.includes("-"), draft: false, assets: [] });
const response = (body: unknown, status = 200) => ({ status, url: "https://api.github.com/", headers: {}, body: new TextEncoder().encode(JSON.stringify(body)) });

test("30 alphas do not hide the stable release on the next page", async () => {
 const urls: string[] = [];
 const caps = { http: { get: async (url: string) => { urls.push(url); return response(url.includes("page=2") ? [release("0.81.1")] : Array.from({ length: 30 }, (_, n) => release(`0.99.0-alpha.${n+1}`))); } } };
 const result = await fetchLatestRelease(caps);
 expect(result).toMatchObject({ ok: true, value: { tag: "installer-v0.81.1" } });
 expect(urls).toHaveLength(2); expect(urls[1]).toEndWith("&page=2");
});
test("malformed full pages do not terminate the scan and version order is semantic", async () => {
 let page = 0;
 const result = await fetchLatestRelease({ http: { get: async () => response(++page === 1 ? [...Array(29).fill({}), release("1.0.0")] : [release("2.0.0")]) } });
 expect(result).toMatchObject({ ok: true, value: { tag: "installer-v2.0.0" } }); expect(page).toBe(2);
});
test("later page errors and exhausted bounds cannot promote a partial result", async () => {
 let page = 0;
 const records = Array(30).fill(release("1.0.0"));
 const failure = await fetchLatestRelease({ http: { get: async () => ++page === 1 ? response(records) : response({}, 503) } });
 expect(failure).toMatchObject({ ok: false, error: { code: "http" } });
 page = 0;
 const bounded = await fetchLatestRelease({ http: { get: async () => { page++; return response(records); } } });
 expect(bounded).toMatchObject({ ok: false, error: { code: "candidate-limit" } }); expect(page).toBe(10);
});
