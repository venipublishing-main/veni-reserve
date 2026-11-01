# 0004: Database / security CI gate

Status: Accepted architecture (AR-029); hosted implementation evidence pending.

Date: 2026-10-31

## Context

M1.1 and M1.2 established local database and genuine Auth/PostgREST security
evidence. Ordinary pull requests must reproduce it without a human workstation.
The existing application checks should retain fast, independent feedback.

## Decision

Keep workflow `CI` and its `validate` job unchanged. Add parallel
`database-security`, with no dependency on validate, on standard GitHub-hosted
`ubuntu-24.04`, with a 30-minute initial limit. This fixed OS avoids the ongoing
ubuntu-latest rollout. Both jobs run for pull_request and main pushes without
path filters. Only the new job cancels superseded runs for the same PR; distinct
main SHAs have separate concurrency groups.

Use Node 24, packageManager pnpm 12.11.2 and frozen project Supabase CLI 2.122.0.
Keep the existing v4 action references; coordinated SHA hardening is separate.
No second CLI installer, Docker image cache or uploaded runtime artifact.

The helper `tests/database/ci.mjs` exposes only fixed lifecycle phases. It locks
the Docker runtime with `SUPABASE_EXPERIMENTAL_STACK=0`, rejects binary/runtime
overrides, remote Docker configuration, hosted credentials, hosted links and
unreviewed environment files. Reset requires the canonical config, exact loopback
API and project-labelled running database/Kong containers. The full bounded
profile excludes edge-runtime, imgproxy, logflare, vector and supavisor, matching
the accepted security harness. No canonical config change is required.

Order: guarded startup, clean local no-seed reset, existing test:db, existing
test:security, independent canonical hygiene, local advisors, targeted cleanup.
Accepted evidence is 466 pgTAP assertions, five real-connection checks and 345
genuine Auth/PostgREST assertions. Test exit status gates execution; visible
counts require closure review, because the existing suites do not enforce a
fixed assertion-count contract. No brittle log parsing is added.

Lifecycle output is captured in memory. Only fixed guard messages and safe
phase/disk evidence are logged; advisor identifiers/severity are allowlisted.
The accepted test scripts retain their existing bounded diagnostics. GitHub
permissions stay contents: read. No hosted Supabase credentials or deployment
commands are required or permitted.

An independent always() cleanup step stops only veni-reserve with no-backup and
verifies project resources are absent. A startup-attempt marker under ignored
.tmp allows cleanup after partial startup. Failure is never suppressed: successful
cleanup cannot repair a failed test, and failed cleanup fails the job. Hard
termination can prevent cleanup; the hosted VM is disposable. Restoration failure
still fails the security suite. No new performance threshold is imposed.

## Alternatives considered

Expanding validate couples fast application feedback to image pulls and resets.
A separate workflow duplicates event policy. Splitting database-only and API
security jobs duplicates stack cost and cannot replace genuine provider evidence.

## Consequences

The independent job duplicates dependency installation but isolates failures and
timeouts. Cold Ubuntu image availability, disk use, timing and cleanup must be
proved on publication; local Windows execution does not establish that proof.
Keep existing inner test timeouts. Investigate measured cold-run failures before
changing them. No branch protection or ruleset is configured by this decision.

Closure requires independently reviewed publication, passing PR and merged-main
runs for both jobs, safe hosted controlled-failure/cleanup evidence, clean main
and short-lived branch cleanup. M1.3 remains open until these gates pass. Hosted
staging belongs to M1.4, not this gate.

## Ledger / VR references

Master Product Ledger v1.1; Architecture Reconciliation Register, AR-026 through
AR-029. ADRs 0002 and 0003 define the accepted persistence/security semantics.
