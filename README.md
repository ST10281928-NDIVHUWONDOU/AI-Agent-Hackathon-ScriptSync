# Campus Crisis Agent

Agentic AI Hackathon submission by Aaryan, Tival and Ndivhuwo.

The Campus Crisis Agent processes campus reports sequentially, correlates related reports into evolving incidents, reassesses severity and confidence, selects operational actions, prevents duplicate dispatches, handles conflicting evidence, and tracks incidents through control and resolution.


## Agent Hidden data Output
Output file :[View output] (Hackathon Result/predictions.jsonl)
Replay file : [View replay] (Hackathon Result/replay.json)
---

## Quick Start

### Install dependencies

npm install

### Process the default development data

npm run predict

### Process a lecturer/unseen CSV

npm run predict -- --input "FULL_PATH_TO_REPORTS.csv"

Example:

npm run predict -- --input "C:\Users\User\Desktop\lecturer-reports.csv"

### Start the dashboard

npm run dev

---

## Important Output Files

Every successful prediction run generates the latest outputs in:

outputs/predictions.jsonl
outputs/replay.json

Compatibility copies are also maintained at:

predictions.jsonl
public/replay.json

Each new successful prediction run replaces the previous latest outputs.

### predictions.jsonl

This is the main machine-readable prediction output.

It contains one JSON object per processed report with:

- report_id
- incident_id
- relationship
- severity
- confidence
- actions
- incident_status
- human_review

### replay.json

This contains the richer replay and incident history used by the dashboard, including:

- incoming reports
- agent decisions
- linked incidents
- severity changes
- confidence changes
- lifecycle changes
- action history
- conflicts
- human-review indicators
- decision-source information

---

## Using Lecturer or Unseen Data

When a new CSV is provided:

npm run predict -- --input "FULL_PATH_TO_LECTURER_FILE.csv"

Then start the dashboard:

npm run dev

The new run replaces the previous latest outputs and the dashboard automatically displays the latest replay.

The system does not assume:

- exactly 150 reports
- fixed report IDs
- fixed incident IDs
- a fixed number of incidents
- valid timestamps
- complete input fields

Reports are processed in CSV file order rather than timestamp order.

---

## Default Development Data

Running:

npm run predict

uses:

data/campus_reports.csv
data/campus_services.csv

The default development dataset contains the reports and service directory supplied for the hackathon.

---

## How the Agent Works

The agent follows the sequence:

Observe
→ Correlate
→ Assess
→ Decide
→ Act
→ Record
→ Monitor
→ Reassess

For each incoming report the system:

1. Normalises the incoming evidence.
2. Compares it with existing incidents.
3. Determines whether it belongs to a new or existing incident.
4. Classifies the relationship.
5. Reassesses incident severity.
6. Reassesses confidence.
7. Updates the incident lifecycle state.
8. Determines whether a new operational action is required.
9. Prevents duplicate dispatches.
10. Updates the incident ledger.
11. Generates the prediction output.
12. Records replay information for the dashboard.

---

## Report Relationships

Each report is classified as one of:

NEW
UPDATE
CORROBORATION
CONFLICT
DUPLICATE
RESOLUTION

---

## Severity Levels

LOW
MEDIUM
HIGH
CRITICAL

Reported severity is treated as evidence and is not automatically accepted as ground truth.

---

## Incident Status

Incidents move through:

INVESTIGATING
ACTIVE
ESCALATED
CONTROLLED
RESOLVED

A resolved incident can reopen when credible evidence indicates that the problem has returned.

---

## Duplicate Action Prevention

The system keeps an action history for each incident.

Repeated reports or duplicate evidence do not automatically trigger another dispatch.

If an existing response remains appropriate, the system can continue the current response, monitor the incident, or produce no new action instead of dispatching the same service again.

---

## Conflict and Human Review

When new evidence conflicts with the current understanding of an incident, the agent can:

- classify the report as CONFLICT
- reduce or restrain confidence
- preserve justified safety responses
- request human review when uncertainty and consequence justify it

Human review is also used for appropriate high-consequence or ambiguous situations.

---

## Hybrid Decision Architecture

The system uses a rules-first hybrid architecture.

Most clear cases are handled deterministically.

Groq is only used when semantic ambiguity genuinely benefits from language-model adjudication.

The configured model is:

openai/gpt-oss-120b

If Groq is unavailable, the deterministic fallback continues processing and produces valid predictions.

---

## Groq Configuration

Create a local:

.env.local

file in the project root with:

GROQ_API_KEY=your_api_key_here

Do not commit .env.local.

The repository includes:

.env.example

as a safe environment-variable template.

The application can still run without Groq because deterministic fallback is built in.

---

## Dashboard

The dashboard reads:

public/replay.json

It does not recompute decisions and does not call Groq from the browser.

The dashboard includes:

- Incoming Report
- Current Agent Decision
- Decision Log
- Incident Explorer
- Action History
- Severity changes
- Confidence changes
- Conflict indicators
- Human-review indicators
- Incident lifecycle changes
- Deterministic, Groq and fallback source indicators

Replay controls include:

- Previous
- Next
- Play / Pause
- Restart
- Replay speed
- Replay position slider

The dashboard supports different report counts dynamically.

---

## Development Baseline

The supplied development dataset currently produces:

150 reports processed
150 predictions generated
150 replay decisions generated
14 incidents identified
0 duplicate-report dispatches

The output has been validated for:

- report order
- valid relationship values
- valid severity values
- valid incident status values
- confidence bounds
- valid service IDs
- unique report outputs

---

## Unseen and Messy Data Testing

The system has also been tested against a separate synthetic dataset containing:

- malformed timestamps
- blank timestamps
- missing fields
- misspelled categories
- inconsistent categories
- inconsistent severity values
- location abbreviations
- missing locations
- exact duplicates
- near duplicates
- corroboration
- conflicts
- escalation
- controlled states
- verified resolution
- post-resolution recurrence
- ambiguous evidence

The production CLI successfully processes arbitrary report counts and Windows paths containing spaces.

---

## Useful Commands

Install dependencies:

npm install

Generate predictions from the default dataset:

npm run predict

Generate predictions from another CSV:

npm run predict -- --input "path\to\reports.csv"

Start the dashboard:

npm run dev

Run tests:

npm run test

Run lint checks:

npm run lint

Build the production version:

npm run build

Optional Groq connectivity test:

npm run test:groq

---

## Final Verification

Before submission, run:

npm install
npm run lint
npm run test
npm run build
npm run predict
npm run dev

Then confirm:

- outputs/predictions.jsonl exists
- outputs/replay.json exists
- prediction count matches the input report count
- dashboard loads the same latest run
- .env.local is not committed
- no API keys or secrets are present in the repository
