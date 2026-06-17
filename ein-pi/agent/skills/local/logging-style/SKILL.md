---
name: logging-style
description: "Samuhlo's brutalist runtime logging style for TypeScript/JavaScript (Node, APIs, servers, DB, webhooks). Trigger: adding or refactoring logs, console output, observability, or a logger helper."
license: internal
metadata:
  author: samuhlo
---

# Logging Style — Brutalist + Minimalist

Samuhlo's style for **runtime logs** (Node, APIs, servers, jobs, webhooks). Not for code comments (see `comment-style`) and not for user-facing UI copy.

Use it when adding, refactoring, or normalizing logs in `.ts` / `.js`, or when writing a logger helper.

## Core Principle

A log line is an **event record**, not prose. Optimised for instant scanning and grep.

- Zero emojis. Zero colloquial phrases. Zero full sentences.
- One log = one event. Never concatenate events.
- Details are `key: value` pairs, not narrative.
- Every error log carries enough context to reproduce (`user_id`, `duration`, `target`, `attempt`...).

## Base Format

```text
[TAG]    SEP  ACTION_NAME   :: key: value | key: value
```

| Column | Rule |
| :--- | :--- |
| **Tag** | Max 6 chars, UPPERCASE, in `[]`. E.g. `[WARN]`, `[DB]`, `[API]` |
| **Separator** | `::` general · `>>` start/async · `++` success · `->` outbound |
| **Action** | Max 12 chars, UPPERCASE. E.g. `CONN_FAIL`, `WRITING`, `GRANTED` |
| **Details** | `key: value` pairs, `|`-separated. Minimal punctuation. |

## Tag Catalogue

| Tag | Meaning |
| :--- | :--- |
| `[INFO]` | General flow info |
| `[WARN]` | Non-critical warning |
| `[ERR]` | Error — action failed |
| `[HOOK]` | Webhook received |
| `[INGEST]` | Data ingestion start |
| `[ANLZ]` | Analysis in progress |
| `[DATA]` | Datum extracted/processed |
| `[DB]` | Database operation |
| `[API]` | External API call |
| `[AUTH]` | Authentication / authorization |
| `[CACHE]` | Cache hit/miss |

Add domain tags as needed (`[QUEUE]`, `[CRON]`, `[PAY]`), same rules.

## Level Mapping

Map tags to the logger level so production filtering works:

- `[INFO]` `[HOOK]` `[INGEST]` `[DATA]` `[DB]` `[API]` `[AUTH]` `[CACHE]` → `info` (or `debug` for hot paths).
- `[WARN]` → `warn`.
- `[ERR]` → `error`.

In production prefer **structured JSON** logs (pino/console with an object); keep this format as the human-readable `msg`/dev transport.

## Examples

```text
[WARN]   :: SIG_MISSING   :: reason: webhook secret not set | action: skip verify
[ERR]    :: DB_CONN       :: timeout_ms: 5000 | host: db-primary
[ERR]    :: AUTH_FAIL     :: reason: token_expired | user_id: usr_49x2k
[HOOK]   >> TRIGGER_REC   :: source: github | branch: main
[INGEST] >> START         :: ctx: loading
[INGEST] ++ COMPLETE      :: duration_ms: 340 | records: 12
[DB]     >> WRITING       :: table: projects | op: upsert
[DB]     ++ SAVED         :: id: tiny-showcase | table: projects
[API]    -> OUTBOUND      :: target: localhost:3000/api/webhooks/github
[API]    :: RETRY         :: attempt: 2/3 | reason: timeout
[AUTH]   ++ GRANTED       :: role: admin | session: ses_9f3kp
```

## TypeScript Helper

```ts
// logging.ts
const SEP = { general: "::", start: ">>", success: "++", outbound: "->" } as const;
type LogSep = (typeof SEP)[keyof typeof SEP];

function log(tag: string, sep: LogSep, action: string, detail: string): void {
  console.log(`${tag.padEnd(8)} ${sep}  ${action.padEnd(14)} :: ${detail}`);
}

// log("[DB]", SEP.success, "SAVED", "id: tiny-showcase | table: projects");
```

When a real logger exists (pino, winston, the framework's), wire this format into it instead of `console.log`; keep the columns.

## Golden Rules

1. **No emojis. Ever.** Not even in dev.
2. **One log = one event.** No multi-event lines.
3. **`key: value` details**, not sentences.
4. **Errors are reproducible**: include the context to debug without rerunning.
5. **Never log secrets or PII** (tokens, passwords, full card/email). Redact or use ids (`user_id`, `session`).
6. **Don't log noise**: no per-iteration logs in hot loops, no logging successful trivial reads. Log decisions, boundaries, failures, and slow operations.
7. **Align separators** where cheap, but structural consistency beats pixel alignment.
