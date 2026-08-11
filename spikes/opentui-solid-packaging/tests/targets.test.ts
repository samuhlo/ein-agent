import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/expected-targets.json";
import { TARGETS } from "../src/targets";

describe("target matrix", () => {
  test("matches the approved four exact target/native selections", () => {
    const actual = TARGETS.map(({ id, bunTarget, nativePackage, libc }) => ({ id, bunTarget, nativePackage, libc }));
    expect(JSON.stringify(actual)).toBe(JSON.stringify(fixture.targets));
  });

  test("does not silently select musl", () => {
    expect(TARGETS.filter(({ os }) => os === "linux").every(({ libc }) => libc === "glibc")).toBe(true);
  });
});
