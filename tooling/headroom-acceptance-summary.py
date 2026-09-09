"""Summarize the complete paired study; never discard failed trials.

python tooling/headroom-acceptance-summary.py STUDY_DIR OUTPUT_JSON
Requires tiktoken from the Headroom environment for independent view counts.
"""
import json
import sys
from pathlib import Path

import tiktoken

root, output = map(Path, sys.argv[1:3])
study = json.loads((root / "results.json").read_text())
trials = study["results"]
groups = []
for kind in ["full-report", "api-table", "log-count", "small-edit", "all"]:
    group = {"kind": kind}
    for arm in ["off", "on"]:
        rows = [r for r in trials if r["arm"] == arm and (kind == "all" or r["kind"] == kind)]
        group[arm] = {
            "runs": len(rows), "passed": sum(r["pass"] for r in rows),
            "tokens": sum(r["usage"]["totalTokens"] for r in rows),
            "estimatedCostUSD": sum(r["usage"]["cost"] for r in rows),
            "seconds": sum(r["elapsedMs"] / 1000 for r in rows),
            "turns": sum(r["turns"] for r in rows),
            "compressed": sum(receipt["outcome"] == "compressed" for r in rows for receipt in r["receipts"]),
            "fullRecovered": sum(r["receipts"][-1]["counts"]["fullRecovered"] if r["receipts"] else 0 for r in rows),
        }
    for key in ["tokens", "estimatedCostUSD", "seconds"]:
        old = group["off"][key]
        group[key + "SavedPercent"] = round(100 * (1 - group["on"][key] / old), 2) if old else None
    groups.append(group)

encoding = tiktoken.encoding_for_model("gpt-4o")
views = []
for trial in trials:
    if trial["arm"] != "on":
        continue
    entries = [json.loads(line) for line in (root / "logs" / (trial["id"] + ".session.jsonl")).read_text().splitlines()]
    messages = {entry["message"].get("toolCallId"): entry["message"] for entry in entries if entry.get("type") == "message" and entry.get("message", {}).get("role") == "toolResult"}
    previous = {"savedBytes": 0, "promptSavedBytes": 0}
    for receipt in trial["receipts"]:
        if receipt["outcome"] != "compressed":
            continue
        text = "".join(part["text"] for part in messages[receipt["toolCallId"]]["content"] if part["type"] == "text")
        path, _ = json.JSONDecoder().raw_decode(text.split("Original: ", 1)[1])
        original = Path(path).read_text()
        final_bytes = len(text.encode())
        saved = receipt["counts"]["savedBytes"] - previous["savedBytes"]
        saved_prompt = receipt["counts"]["promptSavedBytes"] - previous["promptSavedBytes"]
        previous = receipt["counts"]
        views.append({
            "trial": trial["id"], "completeSource": receipt["completeSource"],
            "originalBytes": len(original.encode()), "piViewBytes": final_bytes + saved_prompt,
            "headroomViewBytes": final_bytes, "savedOriginalBytes": saved,
            "originalTokens": len(encoding.encode(original)), "headroomViewTokens": len(encoding.encode(text)),
            "compressionMs": receipt["elapsedMs"],
        })

result = {"version": 1, "model": study["model"], "provider": study["provider"], "method": "Five paired runs per workload, all attempts included. Real Pi and Headroom; controlled generated data. Monetary values are Pi estimates, not invoices. Cache and model choices were not normalized. Token counts of views use o200k_base; trial totals use Pi usage.", "groups": groups, "views": views, "trials": trials}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"groups": groups, "viewCount": len(views), "originalBytes": sum(v["originalBytes"] for v in views), "piViewBytes": sum(v["piViewBytes"] for v in views), "headroomViewBytes": sum(v["headroomViewBytes"] for v in views)}, indent=2))
