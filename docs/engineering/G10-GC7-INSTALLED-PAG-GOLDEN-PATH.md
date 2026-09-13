# G10-GC7 — Installed PAG Golden Path

`installed.campaign.production` exposes the grounded loop and the campaign
surface is present only when `campaignStore` AND a canonical institution source
are supplied. Operations: `buildCurrentCampaignCheckpoint`, `admitWait`,
`observeCurrentWorld`, `reconcileCurrentWorld`, `beginWake`, `resumeWake`,
`completeWakeWithAction`, plus the G1–G6 services. No caller-built checkpoint,
world snapshot, reconciliation report, or compiler context is required on the
golden path; missing required sources yield explicit incomplete/blocked results
rather than stubs.
