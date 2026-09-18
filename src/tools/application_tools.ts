/**
 * G10-O application tools — the COMPATIBILITY import path (SR-1 §10).
 *
 * The switchboard that used to live here is now a set of cohesive capability adapters under
 * `src/adapters/dsh/`, composed by `adapters/dsh/index.ts`. This file keeps the existing import
 * path working and implements nothing.
 */

export { defineApplicationTools } from "../adapters/dsh/index.js";
