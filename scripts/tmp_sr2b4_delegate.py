import io

p = "src/tools/controller.ts"
t = io.open(p, encoding="utf-8").read()

# ── compileTaskContext: delegate whole. ──
start = t.index("  async compileTaskContext(\n    attemptId: string,")
end = t.index("  /**\n   * PLMP-CTX-4 §1.2: resolve a `@ctx/…` handle against the latest context manifest of the attempt's task.")
new_compile = '''  /**
   * PLMP-CTX-2 §1/§3: compile (or return) ONE attempt's context manifest.
   *
   * SR-2 §十二: the compilation moved to `src/context/service.ts` whole — the requirement, the
   * deterministic retrieval, the optional semantic channel and the §D5-c2 prior-result block. This
   * method is the façade existing callers use.
   */
  async compileTaskContext(
    attemptId: string,
    options: {
      verificationHistory?: { list(projectId: string): readonly ProjectVerificationRun[] };
    } = {},
  ): Promise<{ manifest: ContextManifest; coverage: CoverageAssessment; distribution: ContextDistribution }> {
    return this.context.compile(attemptId, options);
  }

'''
t = t[:start] + new_compile + t[end:]

# ── fetchContext: delegate whole. ──
start = t.index("  async fetchContext(\n    attemptId: string,\n    handle: string,")
end = t.index("  /**\n   * §D5-c2: the durable rework lineage for THIS attempt")
new_fetch = '''  /**
   * PLMP-CTX-4 §1.2: resolve a `@ctx/…` handle against THIS ATTEMPT's own compiled manifest.
   *
   * SR-2 §十二: the resolution moved to the context owner. `TaskLatestContext ≠
   * AttemptCompiledContext` — resolving by task-latest was context time travel, and the owner is
   * where that rule now lives.
   */
  async fetchContext(
    attemptId: string,
    handle: string,
  ): Promise<{ kind: "exact" | "source" | "evidence"; ref: string; body: unknown } | undefined> {
    return this.context.fetch(attemptId, handle);
  }

'''
t = t[:start] + new_fetch + t[end:]

# ── #reworkLineageFor: the owner owns it now; the controller's private copy goes. ──
start = t.index("  /**\n   * §D5-c2: the durable rework lineage for THIS attempt")
end = t.index("  /**\n   * E3: the cross-session resume block.")
t = t[:start] + t[end:]

# ── workWorkerAttemptContext: delegate the composed shape. ──
start = t.index("  async workWorkerAttemptContext(\n    attemptId: string,")
end = t.index("  workWorkerTaskContext(taskId: string): WorkWorkerTaskContext {")
new_worker = '''  /**
   * §D5-c3: the attempt-centric worker context — the task half plus THIS attempt's compiled half.
   *
   * SR-2 §十二: the composition moved to the context owner; the ordering it encodes
   * (identity and world exist ≺ compile ≺ deliver) is unchanged.
   */
  async workWorkerAttemptContext(
    attemptId: string,
    options: {
      verificationHistory?: { list(projectId: string): readonly ProjectVerificationRun[] };
    } = {},
  ): Promise<WorkWorkerAttemptContext> {
    return this.context.workWorkerContext(attemptId, options);
  }

'''
t = t[:start] + new_worker + t[end:]

# ── workWorkerTaskContext: delegate the static half. ──
start = t.index("  workWorkerTaskContext(taskId: string): WorkWorkerTaskContext {")
end = t.index("  /**\n   * The canonical envelope of one task, as the Work owner reads it.")
new_task = '''  workWorkerTaskContext(taskId: string): WorkWorkerTaskContext {
    // SR-2 §十二: the task-level static half is the context owner's read.
    return this.context.taskContext(taskId);
  }

'''
t = t[:start] + new_task + t[end:]

io.open(p, "w", encoding="utf-8", newline="\n").write(t)
print("four context methods delegated")
