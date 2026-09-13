# G10-GC7 — Trust Boundaries

- The compiler is untrusted: strict candidate parsing, freshness checks,
  idempotent admission. No belief/Institution/wake mutation.
- Institution/Evidence/Work current state is READ-ONLY through ports.
- Missing sources are never silently defaulted (no fake institution, no
  historical observation as current evidence, no assumed Work state).
- Work admission is idempotent through a host-neutral port; a concrete Work
  adapter remains DEFERRED where no stable admission key exists.
