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

Production should be provisioned only when the pilot is approaching real production use. Veni Flow should move to paid production infrastructure when the first paying customer is landed or production-grade requirements justify it.

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
