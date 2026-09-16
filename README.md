# Campus Crisis Agent

Rules-first, sequential incident processing for the Campus Crisis Agent challenge.

## Setup

`npm install`

## Prediction generation

`npm run predict`

This processes `data/campus_reports.csv` in supplied file order and writes `predictions.jsonl` plus `public/replay.json`. Optional overrides are available, for example `npm run predict -- --input path/to/reports.csv --services path/to/services.csv --output predictions.jsonl --replay public/replay.json`.

## Dashboard foundation

`npm run dev`

The dashboard reads the replay produced by the exact prediction run; its full interface is intentionally deferred to Phase 2.

## Optional Groq

Copy `.env.example` to a local environment file and set `GROQ_API_KEY` when semantic adjudication is wanted. The engine remains deterministic and fully runnable without Groq; failed or unavailable Groq calls fall back without interrupting processing.

To verify a configured local Groq credential without exposing it, run `npm run test:groq`. This optional server-side diagnostic loads `.env.local`, validates structured adjudication, exercises an ambiguous engine case, and checks failure fallback.
