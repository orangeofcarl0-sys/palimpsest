# G10-GC7 — Dependency Matrix

| Operation | Required sources |
| --- | --- |
| createCampaign | CampaignStore + CampaignInstitutionPort |
| refreshBeliefs | CampaignStore + CampaignEvidencePort (when hypotheses exist) |
| admitWait | CampaignStore + CampaignInstitutionPort |
| observeCurrentWorld / reconcileCurrentWorld | + CampaignEvidencePort (active hypotheses) + CampaignWorkPort (linked projects) |
| beginWake / resumeWake | CampaignStore + CampaignInstitutionPort |
| compileNextAction / admitNextAction | + CampaignCompilerPort (+ CampaignWorkAdmissionPort for Project) |
| installWatch / scanWatches | CampaignStore (+ relevant watch sources) |

Bare install remains unchanged; the campaign surface is opt-in.
