# Veni Reserve — Infrastructure Baseline

## Hierarchy

Veni Publishing  
→ Veni Flow  
→ Veni Reserve (Product 001)

Veni Flow is a software/automation sphere within Veni Publishing. It does not require a separate corporate website or domain by default.

## Public web presence

Veni Flow and Veni Reserve extend from the existing Veni Publishing web estate.

Parent domain:

`venipublishing.co.za`

Dedicated product domains may be added later when there is a commercial or operational reason.

## Source control

Repository:

`venipublishing-main/veni-reserve`

Visibility is public to support the established ChatGPT/Codex access workflow.

Public visibility changes the security model: credentials, customer data, operational security records, billing data and private ledgers must never be committed.

## Supabase

Organisation:

`Veni Flow`

Current staging project:

`vf-reserve-stg`

Region:

West EU (Ireland), `eu-west-1`

Current development model:

- DEV: local development
- STG: `vf-reserve-stg`
- PROD: not yet created

M0.1 uses React Router v8 and the Cloudflare Vite plugin for local Workers SSR.
M0.2 established one non-production Cloudflare Worker, `vf-reserve-stg`, addressed
through `workers.dev`, with only `VENI_PRODUCT=reserve` and `VENI_ENV=stg` and no
Supabase connection at that milestone.

M1.4 deployed the reviewed staging Worker. Hosted `/health` and `/ready` passed
under AR-030. Future deployments require separate review and authorization.
The explicit `stg` environment is selected at Vite build time. Its original four
public vars are `VENI_PRODUCT`, `VENI_ENV`, `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY`. The originally deployed Worker targets
`opjgaepryqwmsohtajja.supabase.co`. The shared staging build targets
`droslqfcazwkwvqlbtsq.supabase.co` with its public key and the namespaced
`public.reserve_*` RPCs. The Worker uses central Veni Account authorization
with PKCE and a registered confidential client. Set `VENI_OAUTH_CLIENT_ID`,
`VENI_OAUTH_CLIENT_SECRET` and `VENI_OAUTH_COOKIE_KEY` as staging Worker secrets.
The cookie key is 32 random bytes encoded as base64url.

The registered callback is
`https://vf-reserve-stg.veni-reserve.workers.dev/auth/veni/callback`.
The Website consent allowlist must contain the same public client ID, exact
callback and `email` scope. After a successful callback the Worker stores an
encrypted host-only cookie for up to five minutes. It revalidates the user
and database session on each private request. Tenant operations use the
user's access token. Reauthorization starts from `/login`.

Run `node local/shared-workspace-smoke.mjs <isolated-stack-directory>` from
this repository after applying the Website integration fixture and nine
Reserve migrations to the disposable stack on ports 56321 and 56322.
The test creates its own local client and identities. Use a clean worktree
with port 5193 free and no existing `.dev.vars`.

Under Architecture Reconciliation AR-007, production infrastructure is provisioned
when the M0–M14 implementation and launch-readiness gates justify production use.
VVB / Tenant 001 is itself a legitimate production pilot. PROD is not provisioned
merely because a paying customer exists; commercial payment status is not the
production-environment trigger.

Paid infrastructure or tier upgrades occur when production safety, capacity,
backup/recovery, provider capability, or other evidenced production requirements
justify them.

## Environment naming

Canonical short environment names:

- `dev`
- `stg`
- `prod`

Resource naming convention:

`vf-<product>-<environment>`

Examples:

- `vf-reserve-stg`
- `vf-reserve-prod`

Avoid ad-hoc names such as `test-final`, `prod2`, `new-live`, or developer-personal environment names.

## Ownership principles

Veni Publishing owns the platform and core Veni Flow infrastructure.

Customers should own external business identities/accounts wherever practical, including their domains, Google/Microsoft identities, Meta business assets, WhatsApp business numbers/accounts, and payment-gateway identities.

Veni may provide managed setup and administration as a paid service without unnecessarily taking ownership of the customer's external identity.

## Vendor portability

Application code should avoid unnecessary hard coupling to individual vendors. Integration boundaries should make later provider replacement practical.

## Private records

The private Veni Publishing Google Drive remains the home for:

- product/master ledgers
- infrastructure inventories
- billing ownership records
- recovery information
- security-sensitive operational documentation
- account ownership records
- private customer information

This public repository is the source of truth for code and safe code-adjacent technical documentation, not for secrets or private administration.
