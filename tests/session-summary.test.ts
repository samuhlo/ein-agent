// =============================================================================
// SESSION SUMMARY
// One recognizable phrase per session. Two transcript dialects reach this
// parser: Pi writes `message.content` as an array of parts, Claude Code writes
// a plain string for a real turn and an array of tool results for the synthetic
// ones it injects. Only what the human actually typed may become a label.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
  SESSION_LABEL_MAX,
  lastActionFromSession,
  lastActionFromSessionText,
  sanitizeLabel,
  summarizeSessions,
  type SessionReader,
} from "../ein-pi/agent/lib/session-summary.ts";

function jsonl(...records: unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

const piUser = (text: string) => ({ message: { role: "user", content: [{ type: "text", text }] } });
const claudeUser = (text: string) => ({
  type: "user",
  promptId: "p1",
  message: { role: "user", content: text },
});

describe("Pi transcripts", () => {
  test("the last user message becomes the label", () => {
    const text = jsonl(piUser("primero"), { message: { role: "assistant", content: [] } }, piUser("último"));
    expect(lastActionFromSessionText(text)).toBe("último");
  });

  test("assistant turns never become the label", () => {
    const text = jsonl({ message: { role: "assistant", content: [{ type: "text", text: "respuesta" }] } });
    expect(lastActionFromSessionText(text)).toBeUndefined();
  });
});

describe("Claude Code transcripts", () => {
  test("a string content turn becomes the label", () => {
    const text = jsonl(claudeUser("arregla el instalador"));
    expect(lastActionFromSessionText(text)).toBe("arregla el instalador");
  });

  test("a tool_result is not a phrase the human typed", () => {
    const text = jsonl(
      claudeUser("mira el error"),
      {
        type: "user",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{\"ok\":true}" }] },
      },
    );
    expect(lastActionFromSessionText(text)).toBe("mira el error");
  });

  test("a subagent turn is not the user's turn", () => {
    const text = jsonl(
      claudeUser("plan general"),
      { type: "user", isSidechain: true, message: { role: "user", content: "busca ficheros" } },
    );
    expect(lastActionFromSessionText(text)).toBe("plan general");
  });

  test("a meta turn injected by the harness is skipped", () => {
    const text = jsonl(
      claudeUser("haz el cambio"),
      { type: "user", isMeta: true, message: { role: "user", content: "Caveat: local command output" } },
    );
    expect(lastActionFromSessionText(text)).toBe("haz el cambio");
  });

  test("a command stdout envelope is skipped", () => {
    const text = jsonl(
      claudeUser("dime el estado"),
      {
        type: "user",
        message: { role: "user", content: "<local-command-stdout>algo</local-command-stdout>" },
      },
    );
    expect(lastActionFromSessionText(text)).toBe("dime el estado");
  });

  test("a transcript with only synthetic turns yields unknown", () => {
    const text = jsonl({
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "x" }] },
    });
    expect(lastActionFromSessionText(text)).toBeUndefined();
  });
});

describe("label hygiene", () => {
  test("control characters and newlines collapse into one line", () => {
    expect(sanitizeLabel("uno\n\tdos   tres")).toBe("uno dos tres");
  });

  test("a long label is truncated with an ellipsis", () => {
    const label = sanitizeLabel("x".repeat(SESSION_LABEL_MAX * 2));
    expect(label.length).toBe(SESSION_LABEL_MAX);
    expect(label.endsWith("…")).toBe(true);
  });

  test("a chunk that starts mid-record ignores its truncated first line", () => {
    const text = `role":"user"}}\n${jsonl(claudeUser("entero"))}`;
    expect(lastActionFromSessionText(text, true)).toBe("entero");
  });
});

describe("bounded scanning", () => {
  test("the scan walks backwards and stops at the first match", () => {
    // A chunk that starts mid-file always drops its first line as a fragment,
    // so the fixture puts one there on purpose.
    const tail = `role":"user"}}\n${jsonl(claudeUser("el último"))}`;
    const reads: number[] = [];
    const reader: SessionReader = {
      size: () => 100,
      chunk: (_path, start, length) => {
        reads.push(start);
        return start + length >= 100 ? tail : "";
      },
    };
    expect(lastActionFromSession("/x", reader, { chunkBytes: 50, maxScanBytes: 100 })).toBe("el último");
    expect(reads).toEqual([50]);
  });

  test("the scan gives up at the cap instead of reading the whole file", () => {
    let reads = 0;
    const reader: SessionReader = {
      size: () => 10_000,
      chunk: () => {
        reads++;
        return "no user records here\n";
      },
    };
    expect(lastActionFromSession("/x", reader, { chunkBytes: 100, maxScanBytes: 300 })).toBeUndefined();
    expect(reads).toBe(3);
  });

  test("a record larger than one chunk is reassembled, not lost", () => {
    // An agentic session pastes images and huge tool results: one record can
    // span several chunks, and before the carry existed every one of those
    // chunks was unparseable, so the human's turn silently disappeared.
    const huge = jsonl(claudeUser(`el prompt real ${"x".repeat(300)}`));
    const file = `${huge}${jsonl({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "y".repeat(200) }] } })}`;
    const reader: SessionReader = {
      size: () => file.length,
      chunk: (_path, start, length) => file.slice(start, start + length),
    };
    expect(lastActionFromSession("/x", reader, { chunkBytes: 64, maxScanBytes: file.length }))
      .toContain("el prompt real");
  });

  test("an unreadable session is summarized with an unknown action, not dropped", () => {
    const reader: SessionReader = { size: () => undefined, chunk: () => undefined };
    const summaries = summarizeSessions(
      [{ project: "app", id: "1", ageMs: 1_000, cwd: "/work/app", path: "/x" }],
      reader,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.lastAction).toBeUndefined();
  });
});
