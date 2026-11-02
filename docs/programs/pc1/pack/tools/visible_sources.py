#!/usr/bin/env python3
"""List/stage ONLY visible synthetic field-study sources. No models or product writes.

Staging is explicit, into a new directory only. This is a fixture utility, not a
Palimpsest source-acceptance mechanism or an Agent discovery implementation.
"""
from __future__ import annotations
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def timestamp(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("observation timestamps must include a timezone")
    return dt


def visible_plan(scenario: Path, as_of: str) -> dict[str, Any]:
    scenario = scenario.resolve()
    timeline = json.loads((scenario / "timeline.json").read_text(encoding="utf-8"))
    observed = timestamp(as_of)
    if observed < timestamp(timeline["T1"]):
        raise ValueError("observation is before the registered scenario start")
    records: list[dict[str, Any]] = []
    destinations: set[str] = set()
    def add(relative: str, destination: str, event: str, standing: str) -> None:
        source = (scenario / relative).resolve()
        visible = (scenario / "visible").resolve()
        if visible not in source.parents or not source.is_file():
            raise ValueError(f"source is not an eligible visible file: {relative}")
        dest = Path(destination)
        if dest.is_absolute() or ".." in dest.parts or "\\" in destination:
            raise ValueError("invalid stage destination")
        if destination in destinations:
            raise ValueError(f"duplicate staged destination: {destination}")
        destinations.add(destination)
        data = source.read_bytes()
        records.append({"source": relative, "destination": destination, "event": event,
                        "standing": standing, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
    base = scenario / timeline["baseVisibleRoot"]
    for p in sorted(base.rglob("*")):
        if p.is_file():
            add(p.relative_to(scenario).as_posix(), p.relative_to(base).as_posix(), "INITIAL", "SCENARIO_INITIAL_SOURCE")
    for event in timeline["events"]:
        if timestamp(event["arrivedAt"]) <= observed:
            for path in event["paths"]:
                after = Path(path).relative_to("visible/updates").as_posix()
                add(path, "inbox/" + after, event["id"], event["standing"])
    return {"scenarioId": timeline["scenarioId"], "fictional": True, "observationTime": as_of,
            "notProductAcceptance": True, "files": records}


def stage(scenario: Path, plan: dict[str, Any], output: Path) -> None:
    scenario = scenario.resolve()
    output = output.resolve()
    if output == scenario or scenario in output.parents:
        raise ValueError("output must be outside the immutable scenario directory")
    # Recompute allowed visibility before making any filesystem changes. A caller-
    # modified plan is not permission to copy arbitrary or future files.
    expected = visible_plan(scenario, plan["observationTime"])
    if plan != expected:
        raise ValueError("visibility plan was changed or its inputs no longer match")
    payloads: list[tuple[str, bytes]] = []
    for record in expected["files"]:
        data = (scenario / record["source"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != record["sha256"]:
            raise ValueError("source changed after visibility plan was created")
        payloads.append((record["destination"], data))
    output.mkdir(parents=False, exist_ok=False)
    for relative, data in payloads:
        dest = output / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    (output / "visible-manifest.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--scenario", type=Path, default=ROOT / "scenarios/field-study")
    p.add_argument("--as-of", required=True)
    p.add_argument("--output", type=Path, help="Explicit NEW test-owned directory; never overwrite existing data")
    args = p.parse_args()
    try:
        plan = visible_plan(args.scenario, args.as_of)
        if args.output is not None:
            stage(args.scenario, plan, args.output)
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
