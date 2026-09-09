"""Independent token counts and paired results; uses the pinned pilot environment.

python tooling/headroom-metrics.py REPLAY_DIR LIVE_DIR OUTPUT_JSON
"""
import json
import statistics
import sys
from pathlib import Path

import tiktoken

replay_dir, live_dir, output = map(Path, sys.argv[1:4])
replay = json.loads((replay_dir / "replay.json").read_text())
live = json.loads((live_dir / "live.json").read_text())
encoding = tiktoken.encoding_for_model("gpt-4o")
for row in replay["results"]:
    arm = {"hypa-generic-experimental": "hypa-generic"}.get(row["arm"], row["arm"])
    raw = (replay_dir / f'{row["scenario"]}.raw.txt').read_text()
    compressed = (replay_dir / f'{row["scenario"]}.{arm}.txt').read_text()
    row["rawTokens"] = len(encoding.encode(raw))
    row["resultTokens"] = len(encoding.encode(compressed))
    row["savedTokenPercent"] = round(100 * (1 - row["resultTokens"] / row["rawTokens"]), 2)

groups = []
for scenario in ["repair", "inventory", "logs", "all"]:
    group = {"scenario": scenario}
    for arm in ["off", "on"]:
        trials = [row for row in live["trials"] if row["arm"] == arm and (scenario == "all" or row["scenario"] == scenario)]
        group[arm] = {
            "runs": len(trials), "passed": sum(row["pass"] for row in trials),
            "inputIncludingCache": sum(row["usage"]["input"] + row["usage"]["cacheRead"] + row["usage"]["cacheWrite"] for row in trials),
            "tokens": sum(row["usage"]["totalTokens"] for row in trials),
            "reportedCostUSD": sum(row["usage"]["cost"] for row in trials),
            "seconds": sum(row["elapsedMs"] / 1000 for row in trials),
            "turns": sum(row["turns"] for row in trials),
            "rawRetrievalRuns": sum(row["readOriginal"] for row in trials),
        }
    for metric in ["tokens", "inputIncludingCache", "reportedCostUSD", "seconds"]:
        baseline = group["off"][metric]
        group[f"{metric}ReductionPercent"] = round(100 * (1 - group["on"][metric] / baseline), 2) if baseline else None
    groups.append(group)

result = {"method": "o200k_base counts on actual replay text including retrieval notices; live usage as reported by Pi; no provider-cache normalization; tiny supervised pilot, not production savings", "replay": replay, "live": live, "groups": groups, "warmRpcMsMedian": statistics.median(replay["warmRpcMs"]), "warmRpcMsMax": max(replay["warmRpcMs"])}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"groups": groups, "warmRpcMsMedian": result["warmRpcMsMedian"], "warmRpcMsMax": result["warmRpcMsMax"]}, indent=2))
