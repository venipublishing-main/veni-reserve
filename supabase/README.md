# Supabase

This directory will contain the version-controlled Supabase schema and migration history for Veni Reserve.

## Current environment

Remote staging:

`vf-reserve-stg`

Production has not yet been provisioned.

## Rules

1. Database schema changes should become reproducible migrations rather than undocumented dashboard-only changes.
2. Test migrations locally before applying them to staging.
3. Never commit database passwords, service-role keys, access tokens, or generated local secret files.
4. Tenant isolation and Row Level Security must be treated as core requirements, not post-launch additions.
5. When production is created, production changes must follow the same migration history as staging.
6. Production data must never be copied into local development without an explicit sanitisation process.

## Migration directory

Place migrations under:

`supabase/migrations/`

The application shell is established in M0.1. The initial schema and local database
tooling remain deferred to M1 and must follow the approved Veni Reserve technical
design. See the [migration convention](migrations/README.md).
