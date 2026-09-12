/**
 * G10-C1 RunConfiguration machine proofs.
 *
 *   C1-M01  strict RunConfiguration parsing
 *   C1-M02  RunConfiguration digest determinism
 *   C1-M03  runtime immutability (+ caller-input detachment)
 *   plus: the canonical default is the only valid configuration (C1 §16/§19)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  RUN_CONFIGURATION_DIGEST_DOMAIN,
  RunConfigurationParseError,
  computeRunConfigurationDigest,
  materializeRunConfiguration,
  parseRunConfiguration,
  runConfigurationDigestContent,
} from "../src/run/index.js";

const CONFIGURATION_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/run/configuration.ts", import.meta.url)),
  "utf-8",
);
const CONFIGURATION_CODE = CONFIGURATION_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /\/\/[^\n]*/g,
  "",
);

describe("C1-M01: strict RunConfiguration parsing (C1 §19)", () => {
  it("parses the canonical default configuration", () => {
    const parsed = parseRunConfiguration(JSON.parse(JSON.stringify(materializeRunConfiguration())));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.digest).toBe(computeRunConfigurationDigest());
  });

  it("rejects unknown fields, missing fields, bad schemaVersion, and tampered digests", () => {
    const base = JSON.parse(JSON.stringify(materializeRunConfiguration())) as Record<string, unknown>;
    expect(() => parseRunConfiguration({ ...base, provider: "x" })).toThrow(
      /unknown RunConfiguration field/,
    );
    expect(() => parseRunConfiguration({ schemaVersion: 1 })).toThrow(RunConfigurationParseError);
    expect(() => parseRunConfiguration({ ...base, schemaVersion: 2 })).toThrow(
      RunConfigurationParseError,
    );
    expect(() => parseRunConfiguration({ ...base, digest: "tampered" })).toThrow(/digest mismatch/);
    expect(() => parseRunConfiguration({ ...base, digest: 42 })).toThrow(RunConfigurationParseError);
    expect(() => parseRunConfiguration("nope")).toThrow(RunConfigurationParseError);
  });

  it("with no run-scoped fields, the canonical default is the ONLY valid configuration (C1 §16)", () => {
    // The digest content is exactly the empty specialization under the domain.
    expect(runConfigurationDigestContent()).toEqual({
      domain: RUN_CONFIGURATION_DIGEST_DOMAIN,
      content: {},
    });
    expect(RUN_CONFIGURATION_DIGEST_DOMAIN).toBe("palimpsest.run-configuration.v1");
  });
});

describe("C1-M02: RunConfiguration digest determinism (C1 §20)", () => {
  it("the same default configuration has the same digest across materializations", () => {
    expect(materializeRunConfiguration().digest).toBe(materializeRunConfiguration().digest);
    expect(computeRunConfigurationDigest()).toBe(materializeRunConfiguration().digest);
  });
});

describe("C1-M03: runtime immutability (C1 §19)", () => {
  it("parsed and materialized configurations are frozen; parsed output detaches from input", () => {
    expect(Object.isFrozen(materializeRunConfiguration())).toBe(true);
    const raw = JSON.parse(JSON.stringify(materializeRunConfiguration()));
    const parsed = parseRunConfiguration(raw);
    expect(Object.isFrozen(parsed)).toBe(true);
    raw.digest = "mutated";
    expect(parsed.digest).toBe(computeRunConfigurationDigest());
  });

  it("purity: no clock, randomness, io, or database access in the module (§84 audit)", () => {
    expect(CONFIGURATION_CODE).not.toMatch(/Date\.now|Math\.random|randomUUID|performance\.now/);
    expect(CONFIGURATION_CODE).not.toMatch(/node:(fs|path|net|http)|readFile/);
    expect(CONFIGURATION_CODE).not.toMatch(/\bDatabaseSync\b|\.prepare\(|localStorage|fetch\(/);
  });
});
