#!/usr/bin/env python3
"""Validate PC1 package integrity and planning contracts. Never mutates a repo.

The bundled schema validator intentionally implements the JSON Schema subset used
in this package, not the entire Draft 2020-12 standard. Unsupported validation
keywords fail explicitly. No network or non-standard dependency is required.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
SUPPORTED = {
    "$schema", "$id", "title", "description", "$comment", "type", "enum", "const",
    "properties", "required", "additionalProperties", "items", "minItems", "maxItems",
    "uniqueItems", "minLength", "maxLength", "pattern", "minimum", "maximum", "anyOf",
}


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _is_type(value: Any, expected: str) -> bool:
    return {
        "object": lambda: isinstance(value, dict),
        "array": lambda: isinstance(value, list),
        "string": lambda: isinstance(value, str),
        "integer": lambda: isinstance(value, int) and not isinstance(value, bool),
        "number": lambda: isinstance(value, (int, float)) and not isinstance(value, bool),
        "boolean": lambda: isinstance(value, bool),
        "null": lambda: value is None,
    }[expected]()


def validate_schema(value: Any, schema: dict[str, Any], at: str = "$") -> list[str]:
    errors: list[str] = []
    unknown = set(schema) - SUPPORTED
    if unknown:
        return [f"{at}: unsupported validation keywords: {sorted(unknown)}"]
    if "anyOf" in schema and not any(
        not validate_schema(value, candidate, at) for candidate in schema["anyOf"]
    ):
        return [f"{at}: no anyOf alternative matches"]
    if "const" in schema and value != schema["const"]:
        errors.append(f"{at}: const mismatch")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{at}: invalid enum value {value!r}")
    if "type" in schema:
        expected = schema["type"]
        expected = expected if isinstance(expected, list) else [expected]
        try:
            matches = any(_is_type(value, t) for t in expected)
        except KeyError as exc:
            return [f"{at}: unsupported type {exc}"]
        if not matches:
            return errors + [f"{at}: expected type {expected}"]
    if isinstance(value, dict):
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{at}: missing required property {key}")
        if schema.get("additionalProperties") is False:
            for key in set(value) - set(props):
                errors.append(f"{at}: unexpected property {key}")
        for key, sub in props.items():
            if key in value:
                errors.extend(validate_schema(value[key], sub, f"{at}.{key}"))
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{at}: too few items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{at}: too many items")
        if schema.get("uniqueItems"):
            canonical = [json.dumps(x, ensure_ascii=False, sort_keys=True) for x in value]
            if len(set(canonical)) != len(canonical):
                errors.append(f"{at}: duplicate items")
        if "items" in schema:
            for idx, item in enumerate(value):
                errors.extend(validate_schema(item, schema["items"], f"{at}[{idx}]"))
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{at}: string too short")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errors.append(f"{at}: string too long")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{at}: pattern mismatch")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{at}: below minimum")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{at}: above maximum")
    return errors


def validate_dag(program: dict[str, Any]) -> list[str]:
    phases = program.get("phases", [])
    ids = [p["id"] for p in phases]
    errors = []
    if len(ids) != len(set(ids)):
        errors.append("duplicate phase IDs")
    nodes = {p["id"]: p.get("dependsOn", []) for p in phases}
    for node, deps in nodes.items():
        for dep in deps:
            if dep not in nodes:
                errors.append(f"{node}: unknown dependency {dep}")
    visiting: set[str] = set()
    done: set[str] = set()
    def walk(node: str) -> None:
        if node in visiting:
            errors.append(f"cycle detected at {node}")
            return
        if node in done or node not in nodes:
            return
        visiting.add(node)
        for dep in nodes[node]:
            walk(dep)
        visiting.remove(node)
        done.add(node)
    for node in nodes:
        walk(node)
    return errors


def validate_claims(record: dict[str, Any], label: str) -> list[str]:
    """Check evidence-class requirements; this does not verify artifact truth."""
    errors = []
    ev = record.get("evidence", [])
    successful = {e.get("kind") for e in ev if e.get("result") in {"PASS", "OBSERVED"}}
    if record.get("deterministic") == "PASSED" and not successful.intersection(
        {"DETERMINISTIC_TEST", "PRODUCT_INTEGRATION_RUN"}
    ):
        errors.append(f"{label}: deterministic PASSED lacks passed test/integration evidence")
    if record.get("live") == "VERIFIED" and "REAL_AGENT_RUN" not in successful:
        errors.append(f"{label}: live VERIFIED lacks observed real-agent evidence")
    if record.get("comparison") in {"SUPPORTED", "NO_ADVANTAGE"}:
        if "MATCHED_COMPARISON" not in successful:
            errors.append(f"{label}: comparison conclusion lacks a matched comparison")
        if record.get("live") != "VERIFIED":
            errors.append(f"{label}: comparison conclusion requires verified live observations")
    if any(record.get(k) == "BLOCKED" for k in ("deterministic", "live", "comparison")):
        if not record.get("blockers"):
            errors.append(f"{label}: BLOCKED requires a scoped blocker")
    if record.get("implementation") == "NOT_APPLICABLE":
        if not record.get("notes", "").strip():
            errors.append(f"{label}: NOT_APPLICABLE requires a justification")
        if not record.get("scopeDecisionRef") or "OPERATOR_DECISION" not in successful:
            errors.append(f"{label}: waiving a MUST requirement requires an explicit scope decision")
    return errors


def safe_child(root: Path, relative: str) -> Path:
    """Reject absolute paths, traversal and symlink escapes in manifests."""
    rel = Path(relative)
    if rel.is_absolute() or ".." in rel.parts or "\\" in relative or re.match(r"^[A-Za-z]:", relative):
        raise ValueError(f"unsafe package path: {relative}")
    target = (root / rel).resolve()
    if root.resolve() not in target.parents:
        raise ValueError(f"path escapes package: {relative}")
    return target


def validate_manifest(root: Path, manifest: dict[str, Any]) -> list[str]:
    errors = []
    seen: set[str] = set()
    for entry in manifest.get("files", []):
        relative = entry.get("path", "")
        if relative in seen:
            errors.append(f"manifest duplicate: {relative}")
        seen.add(relative)
        try:
            p = safe_child(root, relative)
            data = p.read_bytes()
            if len(data) != entry["bytes"]:
                errors.append(f"manifest byte count mismatch: {relative}")
            if hashlib.sha256(data).hexdigest() != entry["sha256"]:
                errors.append(f"manifest hash mismatch: {relative}")
        except (OSError, ValueError, KeyError) as exc:
            errors.append(f"manifest {relative}: {exc}")
    actual = {
        p.relative_to(root).as_posix() for p in root.rglob("*")
        if p.is_file() and "__pycache__" not in p.parts
        and p.relative_to(root).as_posix() != "MANIFEST.json"
    }
    for p in sorted(actual - seen):
        errors.append(f"file not in immutable manifest: {p}")
    for p in sorted(seen - actual):
        errors.append(f"manifest file missing: {p}")
    return errors


def check_package(root: Path, working_copy: bool = False) -> dict[str, Any]:
    errors: list[str] = []
    for p in root.rglob("*.json"):
        try:
            load_json(p)
        except (ValueError, OSError) as exc:
            errors.append(f"invalid JSON {p.relative_to(root)}: {exc}")
    try:
        program = load_json(root / "tracking/program.json")
        reqs = load_json(root / "tracking/requirements.json")
        state = load_json(root / "tracking/program-state.json")
        results = load_json(root / "tracking/requirement-results.json")
    except (OSError, ValueError) as exc:
        return {"ok": False, "errors": errors + [str(exc)]}
    errors.extend(validate_dag(program))
    phase_ids = {p["id"] for p in program["phases"]}
    for phase in program["phases"]:
        if not (root / phase["spec"]).is_file():
            errors.append(f"missing spec: {phase['spec']}")
    req_ids = {r["id"] for r in reqs["requirements"]}
    test_ids = {t["id"] for t in reqs["tests"]}
    if len(req_ids) != len(reqs["requirements"]):
        errors.append("duplicate requirement IDs")
    if len(test_ids) != len(reqs["tests"]):
        errors.append("duplicate test IDs")
    for req in reqs["requirements"]:
        if req["phase"] not in phase_ids:
            errors.append(f"{req['id']}: unknown phase")
        if not req["verification"]:
            errors.append(f"{req['id']}: no acceptance test")
        for tid in req["verification"]:
            if tid not in test_ids:
                errors.append(f"{req['id']}: unknown test {tid}")
        p = root / req["spec"]
        if not p.is_file() or req["id"] not in p.read_text(encoding="utf-8"):
            errors.append(f"{req['id']}: not found in spec")
    for test in reqs["tests"]:
        for rid in test["requirements"]:
            if rid not in req_ids:
                errors.append(f"{test['id']}: unknown requirement {rid}")
    for name, value in [("program-state", state), ("requirement-results", results)]:
        errors.extend(validate_schema(value, load_json(root / f"schemas/{name}.schema.json"), name))
    result_ids = [r["requirementId"] for r in results["results"]]
    if set(result_ids) != req_ids or len(set(result_ids)) != len(result_ids):
        errors.append("requirement-results must contain each requirement exactly once")
    for record in results["results"]:
        errors.extend(validate_claims(record, record["requirementId"]))
    for phase_id, record in state["phases"].items():
        errors.extend(validate_claims(record, phase_id))
        if record["implementation"] == "IMPLEMENTED":
            matching = [r for r in results["results"] if r["requirementId"].startswith(phase_id + "-")]
            if any(r["implementation"] not in {"IMPLEMENTED", "NOT_APPLICABLE"} for r in matching):
                errors.append(f"{phase_id}: phase claims implemented before its requirements")
    for p in root.glob("skills/*/SKILL.md"):
        content = p.read_text(encoding="utf-8")
        if not content.startswith("---\n"):
            errors.append(f"{p.relative_to(root)}: missing skill front matter")
        for key in ("name", "description", "version"):
            if not re.search(rf"^{key}:\s*\S", content, re.M):
                errors.append(f"{p.relative_to(root)}: missing {key}")
    # Check relative markdown links, not repository paths written in inline code.
    for p in root.rglob("*.md"):
        if "inputs" in p.parts:  # Source documents remain untouched; external relative refs may be absent.
            continue
        content = p.read_text(encoding="utf-8")
        for link in re.findall(r"\[[^\]]*\]\(([^)]+)\)", content):
            link = link.strip().split("#", 1)[0]
            if not link or "://" in link or link.startswith(("mailto:", "sandbox:")):
                continue
            target = (p.parent / unquote(link)).resolve()
            if not target.exists():
                errors.append(f"{p.relative_to(root)}: broken relative link {link}")
    config = load_json(root / "tracking/execution-config.json")["modelExecution"]
    if config.get("enabled") and not config.get("spendAuthorizationRef"):
        errors.append("model execution enabled without a spend authorization reference")
    lim = config["proposedLimits"]
    if lim["stopNewLaunchesAt"] + lim["inFlightReserveTokens"] > lim["reportedTokensMax"]:
        errors.append("budget threshold plus reserve exceeds total cap")
    for src in load_json(root / "references/input-integrity.json")["files"]:
        data = (root / src["file"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != src["sha256"]:
            errors.append(f"original supplied input changed: {src['file']}")
    if not working_copy:
        manifest_path = root / "MANIFEST.json"
        if not manifest_path.exists():
            errors.append("immutable MANIFEST.json missing; use --working-copy only for edited execution copies")
        else:
            errors.extend(validate_manifest(root, load_json(manifest_path)))
    return {
        "ok": not errors,
        "scope": "DOCUMENT_PACKAGE_AND_PLANNING_CONTRACTS_ONLY",
        "product_implementation_tested": False,
        "manifest_checked": not working_copy,
        "counts": {
            "phases": len(phase_ids), "requirements": len(req_ids), "acceptance_cases": len(test_ids),
            "skills": len(list(root.glob('skills/*/SKILL.md'))),
            "schemas": len(list(root.glob('schemas/*.schema.json'))),
        },
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--working-copy", action="store_true", help="Skip immutable package hashes after editing execution state; does not certify original integrity")
    args = parser.parse_args()
    result = check_package(args.root.resolve(), args.working_copy)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
