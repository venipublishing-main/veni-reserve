# Veni Reserve

**Veni Reserve** is Product 001 in **Veni Flow**, the software and automation sphere of **Veni Publishing**.

> Your booking system. Your brand. Your rules.

## Repository purpose

This repository contains the application source, safe public documentation, database migrations, tests, deployment scaffolding, and other code required to build Veni Reserve.

The repository is intentionally public so the approved ChatGPT/Codex workflow can access it reliably. Public visibility does **not** mean secrets, customer data, credentials, or private operational material may be stored here.

## Infrastructure model

- Parent organisation: Veni Publishing
- Sphere: Veni Flow
- Product: Veni Reserve
- Development: local
- Shared remote environment: staging
- Staging Supabase organisation: `Veni Flow`
- Staging Supabase project: `vf-reserve-stg`
- Staging region: West EU (Ireland), `eu-west-1`
- Production: not yet provisioned
- Production upgrade trigger: first paying customer / production-grade requirement

## Core principles

- $0-first during development
- multi-tenant where sensible
- vendor-portable
- customer-owned external identities/accounts by default
- Veni-managed integrations may be offered as a premium service
- clear separation between development, staging and production
- infrastructure must remain reusable for future Veni Flow products

## Secrets rule

Never commit real credentials or customer data to this repository.

Use `.env.example` only as a variable manifest. Local secrets belong in ignored local environment files or provider secret stores.

## Planning and operational records

Detailed product planning, infrastructure ledgers, security inventories, billing records and operational documentation are maintained privately in the Veni Publishing Google Drive structure.

## Stack status

The approved M0.1 foundation uses React Router v8 Framework Mode, React,
TypeScript, Vite, Tailwind CSS v4, and Cloudflare Workers SSR through the official
Cloudflare Vite plugin. Tooling uses Node 24 LTS and an exact pnpm 12 version
pinned in `package.json`.

See [local setup and engineering conventions](docs/engineering/README.md) and
[ADR 0001](docs/adr/0001-framework-runtime.md).

## Status

M0.1 application shell: `/` and `/health`, local Workers runtime, Vitest, ESLint,
and CI validation. Database/domain implementation starts in M1. Cloudflare
deployment and Supabase linking require separate explicit instructions.
