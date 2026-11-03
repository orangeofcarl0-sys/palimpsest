#!/usr/bin/env python3
"""Read-only dependency planner. Does not authorize effects, model spending or completion."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def next_work(program: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    states = state["phases"]
    ready, waiting, qualified = [], [], []
    for phase in program["phases"]:
        pid = phase["id"]
        current = states[pid]
        if current["implementation"] == "IMPLEMENTED" and current["deterministic"] == "PASSED":
            qualified.append(pid)
            continue
        unmet = [
            dep for dep in phase["dependsOn"]
            if states[dep]["implementation"] != "IMPLEMENTED" or states[dep]["deterministic"] != "PASSED"
        ]
        engineering_blocks = [
            b for b in current.get("blockers", [])
            if b.get("scope") in {"ENGINEERING", "ALL"}
        ]
        item = {"phase": pid, "name": phase["name"], "spec": phase["spec"]}
        if unmet or engineering_blocks:
            waiting.append({**item, "unmetDependencies": unmet, "blockers": engineering_blocks})
        else:
            ready.append({**item, "action": "REPAIR_VERIFICATION" if current["implementation"] == "IMPLEMENTED" else "IMPLEMENT"})
    live_blocks = [
        {"phase": p, "kind": b["kind"], "detail": b["detail"]}
        for p, value in states.items() for b in value.get("blockers", [])
        if b.get("scope") not in {"ENGINEERING", "ALL"}
    ]
    return {
        "programId": program["programId"], "ready": ready, "waiting": waiting,
        "engineeringQualified": qualified, "separateLiveOrExternalBlocks": live_blocks,
        "nextRecommended": ready[0]["phase"] if ready else None,
        "note": "Readiness is an engineering suggestion only. Always check actual safety, authority and budget before effects or model execution.",
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--program", type=Path, default=ROOT / "tracking/program.json")
    p.add_argument("--state", type=Path, default=ROOT / "tracking/program-state.json")
    args = p.parse_args()
    try:
        program = json.loads(args.program.read_text(encoding="utf-8"))
        state = json.loads(args.state.read_text(encoding="utf-8"))
        result = next_work(program, state)
    except (OSError, ValueError, KeyError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
