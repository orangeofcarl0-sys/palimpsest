/**
 * G10-S recipe layer barrel.
 *
 *   artifacts — digest-bound RecipeDefinition / RecipePlan / CompiledRecipePlan
 *   registry  — immutable in-code catalog (NO RecipeStore)
 *   compiler  — pure, descriptive plan resolution (no store, no authority)
 *   execution — descriptive plan meets existing governed services (no new peer/point)
 */

export * from "./artifacts.js";
export * from "./registry.js";
export * from "./compiler.js";
export * from "./execution.js";
