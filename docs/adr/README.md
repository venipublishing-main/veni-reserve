# Architecture decision records

Record significant approved implementation decisions in short, public-safe ADRs.
Use sequential filenames: `0001-<decision-name>.md`, `0002-<decision-name>.md`.
Do not copy private ledgers, credentials, or operational records into an ADR.

Each ADR contains:

- Title
- Status (proposed, accepted, or superseded, with a successor reference)
- Context
- Decision
- Alternatives Considered
- Consequences
- Ledger / VR References (document/version references only)
- Date (`YYYY-MM-DD`)

New architectural decisions require approval through the planning workflow.
When a decision changes, add a successor ADR and mark the earlier one superseded;
retain the history.

## Decisions

- [0001: React Router v8, Vite, and Cloudflare Workers](0001-framework-runtime.md)
- [0002: Access persistence and transaction integrity](0002-access-foundation.md)
