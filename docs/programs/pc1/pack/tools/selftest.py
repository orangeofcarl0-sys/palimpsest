#!/usr/bin/env python3
"""Unit tests for the DOCUMENT PACKAGE utilities only; not Palimpsest tests."""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from validate_pack import ROOT, load_json, validate_schema, validate_dag, validate_claims, validate_manifest, safe_child, check_package
from plan_next import next_work
from visible_sources import visible_plan, stage


class PackageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.program = load_json(ROOT / "tracking/program.json")
        self.state = load_json(ROOT / "tracking/program-state.json")

    def test_initial_contracts_are_valid(self):
        report = check_package(ROOT, working_copy=True)
        self.assertTrue(report["ok"], report["errors"])

    def test_all_requirements_have_tests(self):
        r = load_json(ROOT / "tracking/requirements.json")
        self.assertGreaterEqual(len(r["requirements"]), 80)
        self.assertTrue(all(x["verification"] for x in r["requirements"]))

    def test_dag_cycle_rejected(self):
        self.program["phases"][0]["dependsOn"] = ["S10"]
        self.assertTrue(any("cycle" in e for e in validate_dag(self.program)))

    def test_unknown_dependency_rejected(self):
        self.program["phases"][0]["dependsOn"] = ["GHOST"]
        self.assertTrue(any("unknown" in e for e in validate_dag(self.program)))

    def test_initial_planner_starts_s00(self):
        self.assertEqual(next_work(self.program, self.state)["nextRecommended"], "S00")

    def test_independent_work_continues(self):
        self.state["phases"]["S00"].update(implementation="IMPLEMENTED", deterministic="PASSED")
        ready = [x["phase"] for x in next_work(self.program, self.state)["ready"]]
        self.assertIn("S01", ready)
        self.assertIn("S03", ready)

    def test_failed_dependency_blocks_effectful_successor(self):
        self.state["phases"]["S00"].update(implementation="IMPLEMENTED", deterministic="FAILED")
        ready = [x["phase"] for x in next_work(self.program, self.state)["ready"]]
        self.assertNotIn("S01", ready)

    def test_live_block_does_not_block_final_engineering(self):
        for pid, value in self.state["phases"].items():
            if pid != "S10":
                value.update(implementation="IMPLEMENTED", deterministic="PASSED")
        self.state["phases"]["S08"]["live"] = "BLOCKED"
        self.state["phases"]["S08"]["blockers"] = [{"id":"quota", "scope":"LIVE", "kind":"PROVIDER", "detail":"quota", "unblocksWhen":"owner-funded provider"}]
        result = next_work(self.program, self.state)
        self.assertIn("S10", [x["phase"] for x in result["ready"]])
        self.assertTrue(result["separateLiveOrExternalBlocks"])

    def test_model_verification_cannot_use_fixture_alone(self):
        record = {"live":"VERIFIED", "evidence":[{"kind":"DETERMINISTIC_TEST", "result":"PASS"}]}
        self.assertTrue(any("real-agent" in e for e in validate_claims(record, "test")))

    def test_failed_test_does_not_support_pass(self):
        record = {"deterministic":"PASSED", "evidence":[{"kind":"DETERMINISTIC_TEST", "result":"FAIL"}]}
        self.assertTrue(validate_claims(record, "test"))

    def test_pass_requires_real_test_reference_class(self):
        record = {"deterministic":"PASSED", "evidence":[{"kind":"DETERMINISTIC_TEST", "result":"PASS"}]}
        self.assertFalse(validate_claims(record, "test"))

    def test_comparison_requires_pair_and_live(self):
        self.assertTrue(validate_claims({"comparison":"SUPPORTED", "live":"NOT_RUN", "evidence":[]}, "test"))

    def test_block_requires_explanation(self):
        self.assertTrue(validate_claims({"live":"BLOCKED", "blockers":[]}, "test"))

    def test_bool_is_not_integer(self):
        self.assertTrue(validate_schema(True, {"type":"integer"}))

    def test_additional_property_rejected(self):
        self.assertTrue(validate_schema({"approved":True}, {"type":"object","properties":{},"additionalProperties":False}))

    def test_short_git_oid_rejected_in_manifest(self):
        sch = {"type":"string", "pattern":"^(?:[0-9a-f]{40}|[0-9a-f]{64})$"}
        self.assertTrue(validate_schema("f1536b8", sch))
        self.assertFalse(validate_schema("a" * 40, sch))
        self.assertFalse(validate_schema("a" * 64, sch))

    def test_path_traversal_rejected(self):
        for path in ("../secret", "/etc/passwd", "C:/secrets", "a\\..\\secret"):
            with self.assertRaises(ValueError):
                safe_child(ROOT, path)

    def test_tampered_manifest_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/"x").write_bytes(b"actual")
            man = {"files":[{"path":"x","bytes":5,"sha256":hashlib.sha256(b"other").hexdigest()}]}
            self.assertTrue(any("mismatch" in e for e in validate_manifest(root, man)))

    def test_t1_hides_future_and_oracle(self):
        plan = visible_plan(ROOT/"scenarios/field-study", "2026-03-02T09:00:00Z")
        self.assertTrue(plan["files"])
        self.assertTrue(all(x["event"] == "INITIAL" for x in plan["files"]))
        self.assertTrue(all("evaluator-only" not in x["source"] for x in plan["files"]))

    def test_t2_releases_candidate_not_acceptance(self):
        plan = visible_plan(ROOT/"scenarios/field-study", "2026-03-09T09:00:00Z")
        by_event = {x["event"]: x["standing"] for x in plan["files"]}
        self.assertEqual(by_event["field-validation"], "EXTERNAL_CANDIDATE")
        self.assertEqual(by_event["budget-directive"], "OPERATOR_REVIEW_REQUIRED")
        self.assertTrue(plan["notProductAcceptance"])

    def test_staging_never_overwrites(self):
        scenario = ROOT/"scenarios/field-study"
        plan = visible_plan(scenario, "2026-03-02T09:00:00Z")
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)/"world"
            stage(scenario, plan, output)
            self.assertFalse((output/"inbox").exists())
            self.assertFalse((output/"evaluator-only").exists())
            with self.assertRaises(FileExistsError):
                stage(scenario, plan, output)

    def test_modified_visibility_plan_cannot_write_arbitrary_file(self):
        scenario = ROOT/"scenarios/field-study"
        plan = visible_plan(scenario, "2026-03-02T09:00:00Z")
        plan["files"][0]["destination"] = "../escape"
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)/"world"
            with self.assertRaises(ValueError):
                stage(scenario, plan, output)
            self.assertFalse(output.exists())

    def test_naive_project_time_rejected(self):
        with self.assertRaises(ValueError):
            visible_plan(ROOT/"scenarios/field-study", "2026-03-09T09:00:00")

    def test_fixture_cost_arithmetic(self):
        oracle = load_json(ROOT/"scenarios/field-study/evaluator-only/expected-facts.json")
        self.assertEqual(oracle["examples_not_single_required_answer"][0]["total"], 3*1800+1280+300)
        self.assertEqual(oracle["examples_not_single_required_answer"][1]["total"], 600+2*1800+1280+300)


if __name__ == "__main__":
    unittest.main(verbosity=2)
