/**
 * G10-AB — Durable Project Operating Posture & Management History.
 *
 * Two orthogonal, non-authoritative axes a durable project remembers across
 * sessions: the user's preferred Work Mode, and how deeply Palimpsest may manage
 * the project. Plus an append-only, non-authoritative record of what management
 * actually did.
 *
 *   OperatingPosture ≠ Authority      WorkModePreference ⟂ ManagementInvolvement
 *   OperatingPosture ≠ RecipePlan     ManagementActivityRecord ≠ WorkEvent
 *
 * Nothing here is canonical truth: the Work EventStore, the ProjectIR and the
 * Ordarium ledger keep their ownership, and these artifacts reference them.
 */

export * from "./work_mode_profile.js";
export * from "./work_mode_store.js";
export * from "./posture.js";
export * from "./preference.js";
export * from "./activity.js";
export * from "./activity_store.js";
export * from "./history.js";
