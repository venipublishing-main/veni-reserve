# VVB booking preview — first customer-facing implementation slice

**Status:** Local/synthetic prototype only. No provider database calls, migrations,
cloud deployment, patient data, access controls or real appointment writes.

## Surfaces

- `/` — Veni Reserve platform introduction and preview links
- `/demo/vvb` — public booking demonstration, four steps:
  Service → Practitioner / No preference → Date & time → Demo details →
  illustrative confirmation
- `/demo/vvb/workspace` — synthetic, read-only reception dashboard

The brand `van Vollenhoven Bruwer Optometrists` is **Tenant 001**. Its
illustrative opening hours, practitioner profiles and service descriptions
are explicitly fictional and MUST be replaced with owner-approved, published
tenant configuration before any real use. No real location, pricing or
practitioner claims are made.

## Architectural boundaries

The shared deterministic `app/features/demo/booking.ts` computes example
availability from a generic service, eligible staff, opening windows, minimum
notice, duration, buffer and fictional existing appointments. All personnel,
services and appointments are hard-coded synthetic fixture data. Displayed
slots are **not reservations**. This preview is not the production availability
engine: UTC+02 is a fixture-specific offset, no daylight-saving support is
provided, and not all source-catalogue policy constraints are implemented.

No form action, API call, browser storage, email, message or appointment commit
exists in the preview. The details form deliberately uses fictional defaults
and local React state. The confirmation states explicitly that nothing was
saved or sent. The demo workspace is intentionally **not** an admin product
and has no authentication or access to tenant records.

The production implementation must consume a narrow, published tenant
projection; be tenant-scoped; validate duration, buffers, staff/location/
resource eligibility, leave, external calendar conflicts and timezone at the
server; revalidate on booking commit; prevent concurrent double-booking in
the database; be idempotent; and restrict private workspace access by
authenticated tenant permissions. Nothing in these preview routes satisfies
those requirements or authorises their deployment with real patient data.

## Try locally (does not deploy)

From a clean local checkout of this branch, following
`docs/engineering/README.md`, use the pinned Node 24/pnpm 12 environment:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dev
```

Open the localhost URL printed by the dev server, then select
**Explore VVB booking demo**. No credentials or Supabase connection are
required. `pnpm dev` starts only a local development server.
**Do not deploy or merge without ordinary PR review and passing CI.**

## Next delivery slices

1. Publishable, tenant-scoped Service/Staff/Location configuration and
   explicit visibility controls.
2. Server-side availability and safe booking commit with tenancy, RLS and
   conflict/idempotency tests.
3. Authenticated business workspace, then configuration/branding studio.
4. Real pilot data only after privacy, publication and recovery gates.
