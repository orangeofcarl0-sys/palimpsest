# G10-G6 — CampaignCompiler

```text
CampaignCompiler ≠ Scheduler (§154)
compiler output = CANDIDATE only (§155)
```

`CampaignCompilerPort.compile(context) → unknown` (§156). The compiler may be
an LLM, a deterministic planner, a human adapter, or another host service. Its
output crosses a STRICT parser boundary (`parseCampaignNextActionProposal`,
§164) and is never canonical truth.

`CampaignPlanningContext` is built from canonical/derived facts only (§157):
active commitments, active hypotheses, CurrentBeliefState, recent observation
refs, intervention summaries, institution epoch, active watches. It is
DISPOSABLE (§201) — destroying it does not damage Campaign continuity, and it
never carries hidden CoT (§159).

`CompiledCampaignAction` wraps the validated action with the Campaign freshness
basis and belief digest. A candidate whose basis no longer matches is refused
as `campaign_action_stale` before any Work mutation (§168). The compiler cannot
terminate a Campaign (§163) and cannot set belief, modify Evidence, or advance
an Institution (§181/§182).
