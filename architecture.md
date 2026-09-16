# Architecture

The engine processes each CSV row sequentially in supplied file order. It never sorts timestamps because timestamps are untrusted. A normalisation layer tolerates missing values, casing, punctuation, common category aliases and simple location variation.

An in-memory incident ledger is the agent memory. Each ledger entry records linked reports, evidence tokens, severity, confidence, lifecycle, services, action history, conflict and review markers. Correlation scores normalized type, conservative location similarity and meaningful evidence-token overlap. Strong matches are decided deterministically; weak candidates form a small shortlist. Only ambiguous matches may be sent to Groq, and then only to choose a real shortlisted incident or `NEW` through validated JSON. An unavailable key, timeout, invalid response or network failure always takes the deterministic fallback path.

The relationship classifier distinguishes duplicates, corroboration, conflict, updates and supported resolution. Severity is evidence-led rather than copied from the reporter. Confidence makes bounded adjustments for independent support, conflict and closure. The lifecycle tracks investigating, active, escalated, controlled and resolved states, and resolved incidents can reopen on new credible evidence.

The action layer maps operational needs only to service IDs in the supplied directory. Per-incident action history prevents repeated dispatches: duplicate and conflicting reports do not re-dispatch an already requested response. Safety guardrails flag uncertain high-consequence medical, security and conflict scenarios for human review. `predictions.jsonl` and `public/replay.json` come from the same run, so the later dashboard only displays decisions rather than recomputing them.
