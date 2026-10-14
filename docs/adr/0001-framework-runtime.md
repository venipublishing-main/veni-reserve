# 0001: React Router v8 + Vite + Cloudflare Workers

## Status

Accepted through the approved M0.0 architecture reconciliation.

## Context

Veni Reserve needs a reproducible, local-first application foundation with SSR,
clear provider boundaries, and a low initial infrastructure cost.

## Decision

Use React Router v8 Framework Mode, React, strict TypeScript, Vite, the official
Cloudflare Vite plugin, and Cloudflare Workers SSR. Use Node 24 LTS and pnpm 12
for tooling, Tailwind CSS v4 through its official Vite plugin, Vitest for unit
tests, and GitHub Actions for validation. Playwright is the approved E2E tool.

Use the current official Cloudflare scaffold as the integration reference.
Deployment requires a separate explicit instruction; M0.1 is local only.

## Alternatives Considered

The earlier initial Next.js direction was superseded by the approved architecture
reconciliation. A Node-hosted SSR server is not the selected initial runtime.

## Consequences

Keep runtime/provider details at infrastructure boundaries. Application and
domain services will remain separate from routes and external providers.
Tailwind is an implementation tool, not the future tenant theme data model.
Supabase PostgreSQL and Auth begin in M1; this shell requires no credentials or
database. Zod is approved but deferred until it has a concrete use.

## Ledger / VR References

- Veni Reserve Master Product Ledger v1.1
- Architecture Reconciliation & Implementation Decision Register v0.1
- M0.0 architecture reconciliation: passed
- M0.1 engineering conventions and application skeleton instruction

These are authority references only; private contents are not reproduced.

## Date

2026-10-14
