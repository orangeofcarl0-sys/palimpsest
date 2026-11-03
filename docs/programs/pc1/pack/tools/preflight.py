#!/usr/bin/env python3
"""Read-only local Git preflight. Never checks out, fetches, resets, commits or pushes."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import subprocess

BASE = "044b08056a0e98b7d7cee207cb36fb7e453907fe"
TREE = "1b7caa156d187e952be8bd90e797f440cb7e2402"
TARGET = "palimpsest-product-convergence-v1"


def run_git(repo: Path, args: list[str]) -> dict[str, object]:
    try:
        p = subprocess.run(["git", "-C", str(repo), *args], capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=30, check=False)
        return {"args": args, "exitCode": p.returncode, "stdout": p.stdout.strip(), "stderr": p.stderr.strip()}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"args": args, "exitCode": None, "stdout": "", "stderr": str(exc)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--check-remote", action="store_true", help="Add read-only git ls-remote; requires network/auth")
    a = parser.parse_args()
    commands = [
        ["status", "--porcelain=v1", "-uall"], ["branch", "--show-current"],
        ["rev-parse", "HEAD"], ["rev-parse", "HEAD^{tree}"],
        ["rev-parse", "origin/main"], ["rev-parse", "origin/palimpsest-c6r-behavioral-qualification"],
        ["worktree", "list", "--porcelain"], ["stash", "list"],
        ["branch", "--list", TARGET], ["branch", "-r", "--list", "origin/" + TARGET],
        ["cat-file", "-e", BASE + "^{commit}"], ["merge-base", "--is-ancestor", BASE, "HEAD"],
    ]
    if a.check_remote:
        commands.append(["ls-remote", "--heads", "origin", "main", "palimpsest-c6r-behavioral-qualification", TARGET])
    records = [run_git(a.repo.resolve(), cmd) for cmd in commands]
    status = records[0]
    exact = records[2]["stdout"] == BASE and records[3]["stdout"] == TREE
    clean = status["exitCode"] == 0 and status["stdout"] == ""
    print(json.dumps({"mode": "READ_ONLY", "repo": str(a.repo.resolve()), "expectedBase": BASE,
                      "expectedTree": TREE, "targetBranch": TARGET, "exactBase": exact,
                      "cleanWorkingTree": clean, "mutationsPerformed": False,
                      "records": records,
                      "next": "Review programme branch/resume rules; this utility does not authorize mutation."}, ensure_ascii=False, indent=2))
    return 0 if clean and exact else 2


if __name__ == "__main__":
    raise SystemExit(main())
