# Business onboarding and the VVB pilot

## Shared baseline

Reserve staging uses the Cloudflare Worker at `vf-reserve-stg.veni-reserve.workers.dev` and the Website Auth and database project `droslqfcazwkwvqlbtsq`. On 19 November 2026 the primary migration history contained the nine Reserve versions from `20261117160650` to `20261117160855`. The public health and readiness endpoints responded successfully. Anonymous workspace access required sign-in. The original Reserve project is paused.

The first three migrations provide tenants, identity projections, memberships, roles, capability mappings, audit and RLS. The next three provide business settings, transactional bootstrap with owner and retry receipt, and private theme revisions. The last three provide locations, services with duration, buffers and booking overrides, and staff profiles with explicit staff/service/location eligibility. A practitioner profile represents a schedulable person. Account permissions come from membership and role assignments.

The standalone migration directory in this repository is the source of the historical Reserve baseline. The Website repository owns its namespaced, applied equivalents and the shared migration ledger. [Primary baseline and hosted verification](https://github.com/venipublishing-main/venipublishing-website/blob/aac1382f41dfb1e7bb8bf11d5ee1f74a6700d274/docs/architecture/reserve-primary-supabase-migration-ledger-20261117.md)

## Owner workflow

1. Enter **Create my business** or **Sign in** and use the existing Veni Account OAuth flow. Select an existing business to resume, or create one. Bootstrap writes one SETUP tenant and one active owner in the same transaction. Retries reuse the creation receipt.
2. Save the business name, time zone, locale and currency. Add locations, services with durations, and practitioners. In **Staff and eligibility**, enable staff–service, staff–location and service–location relationships. Enable online booking for the intended service and practitioner. A practitioner must be visible for named booking or eligible for no-preference booking.
3. In **Hours and activation**, save business contacts, the weekly schedule in the business time zone, minimum notice and advance booking horizon. Each day supports one daytime interval or closure. This is business-wide availability. Services retain their existing booking overrides. Each form saves independently. After signing in again, select the business to retrieve its committed configuration.
4. Review the saved business, locations, durations, staff and outstanding items. The owner can submit a complete configuration. With no current grant, Reserve records **pending entitlement**. After Account authorises the pilot, the owner reloads the review and activates. Public booking has a separate release gate.

## Primary database handoff

The candidate is `integration/veni-publishing/supabase/migrations/20261119075047_reserve_shared_onboarding.sql`. It is outside the standalone migration chain. It adds two RLS-protected onboarding data tables in `reserve_internal`, a restricted non-login executor, and five authenticated invoker RPCs under `public.reserve_*`. One table stores a revisioned business draft and activation decision. The other binds retryable service and staff creation to the actor, tenant, request key and payload. Replayed creations return the existing item. Locations and eligibility links already enforce uniqueness. Older tenants with no onboarding row start at revision zero.

A third private relation, `reserve_internal.oauth_clients(client_id uuid primary key)`, holds the Account-managed list of approved Reserve clients. It starts empty. RLS and revoked grants leave application roles without direct access. In the **same approved Website release transaction**, provision the exact registered confidential client UUID for the environment before commit. Verify it against Account's registration and the Worker's configured public client ID. Rotation can overlap two approved Reserve registrations. Removing a registration denies subsequent database requests with tokens issued to it.

The existing argument-free Reserve identity verifier checks the signed subject, non-anonymous identity, current provider session and its OAuth client, a live confidential registration in the allowlist, and current unrevoked consent for that user/client pair. It returns only the verified subject. The existing function owner already has the necessary read privileges on the provider tables. Older Reserve RLS and catalogue paths use the same identity through `business_user_id()`. Website account functions and token issuance retain their own identity checks. A genuine Website session can manage its Account while the Reserve Data API denies that session access to Reserve records. [Supabase OAuth client claims and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security) · [OAuth grant revocation](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)

The database derives the active owner from the verified Reserve session, membership and system role. Product staff retain their existing domain capabilities. The Worker forwards the user's bearer token and the publishable key. Draft writes use compare-and-swap. Activation compares the reviewed configuration fingerprint and uses a serializable transaction to update the draft and tenant lifecycle together. Private helpers pin their search paths. Existing catalogue helpers retain their limited owners.

## Contract with central Veni Account

The Website team owns checkout, subscriptions, discount redemption, renewals, cancellations and pilot authorisation. Reserve consumes a private database adapter named `reserve_internal.account_publish_entitlement(target uuid)`. The candidate returns zero rows until the Website team connects its authoritative source. No public method sets the result. No approved Account endpoint was found in Website main or an entitlement RPC in the inspected primary schema.

| Field | Contract |
| --- | --- |
| business_id | Exact shared Reserve tenant UUID. Account must validate the business association. |
| product / capability | Exact values `reserve` and `publish`. |
| basis | `subscription` or `free_pilot`. Both carry the same Reserve capability. |
| valid_from / expires_at | Trusted timestamps defining a bounded interval, inclusive at start and exclusive at expiry. |
| revoked_at | Must be null for a current grant. Account must withdraw superseded or cancelled decisions. |

An external Account API may feed the adapter through a Website-owned, server-authenticated projection. Account must validate issuer, audience, business, product, scope and freshness and bound any cache lifetime by the decision expiry. A purchased plan or centrally redeemed 100% discount may qualify according to Account policy. Reserve receives only the resulting decision. The integration must define revocation latency before release.

Draft read, save and configuration review are independent of Account. Their direct RPC response carries `entitled: null` and, for a previously activated complete draft, `status: "verification_required"`. The Worker follows a committed draft operation with an independently authorised, bounded call to `reserve_read_publish_entitlement(target)`. A verified negative decision yields `false`; missing or failed verification leaves `null`. The UI displays that distinction and keeps drafts editable. An auth or membership denial still denies access.

Activation checks the owner, review fingerprint and configuration completeness, then evaluates the seven-field grant inside its own serializable transaction. A fresh negative decision can record a pending request. An adapter failure or overdue decision blocks activation. A successful activation returns the checked result with its committed review. The adapter must convey upstream errors as failures and return zero rows for a verified absence. Its decision budget is 1.5 seconds. A previously activated tenant can remain operationally ACTIVE while its effective Reserve authorisation is pending. Future public booking handlers must check a current publish decision and booking readiness on the server. Tenant status or a historical activation alone cannot authorise publication.

## Release coordination

- Website and Performance maintainers reconcile the candidate version and isolated object/role names with outstanding primary migrations. Review the exact SQL in the Website ledger after the nine prerequisites. Re-run against the combined candidate before approving a single migration order.
- Authorise and apply the reviewed Website migration through the shared release process. The transaction is additive. For an application rollback, restore the prior Worker and preserve drafts and receipts for recovery.
- Release the reviewed Reserve Worker separately. Use the OAuth-connected business workspace to confirm persistence and isolation on an approved staging business.
- VVB supplies its owner account, contact, time zone, hours, locations, service durations and staff eligibility. Register or resume VVB once. The Account team authorises its free pilot, including any discount redemption, before owner activation. Publishing public booking requires separate approval.

## Verification

The `shared-onboarding` CI job reconstructs the nine pinned Website migrations and candidate in a fresh, disposable Supabase project. It signs in two synthetic users through the Worker OAuth flow and tests bootstrap replay, owner association, configuration round trips, resumption, concurrency, stale reviews, tenant and staff isolation, and entitlement decisions including a free pilot. The fixture replaces the empty adapter only inside the designated local test container and restores it afterward. The existing application, database-security and preview checks run independently.

Migration and security references include [Supabase migration deployment](https://supabase.com/docs/guides/deployment/database-migrations), [database function privileges](https://supabase.com/docs/guides/database/functions) and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

To repeat the cross-product acceptance on the Account team's disposable role-routing stack, replay Website, Arcana, the nine Reserve migrations, this candidate, and the reviewed Performance foundation and role files. Use the existing local test project `reserve_account_role_review` on loopback port 58421. Run `node local/shared-product-roles.mjs <disposable-stack-dir>` from Reserve. The test registers synthetic client mappings on that stack and exercises actual GoTrue tokens for both products and Website refresh. The Performance hook and its configuration are supplied by Account's existing fixture. The standard Reserve CI stack runs with its default Auth configuration.
