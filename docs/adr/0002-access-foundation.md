# 0002: Access persistence and transaction integrity

## Status

Accepted through AR-027; independently reviewed and merged. M1.1 is PASS / CLOSED
on main commit 464c832ac7a29cebf84d18e88fada1aa3262bee4. The historical structural
default-deny boundary below is extended by AR-028 / ADR 0003 for M1.2 reads.

## Context

The tenant/membership foundation needs durable roles, capabilities, invitations
and access audit without exposing an authorization API before M1.2.

## Decision

Use a global capability catalogue, four global system presets and explicit
role-permission and membership-role junctions. Future custom roles are scoped
to a tenant. System identities are immutable and custom roles cannot grant
ownership authority. Private invitations carry an immutable intended role set,
one-way verifier and terminal receipt. Audit is append-oriented and attributed.

Require SERIALIZABLE transactions for Tenant, Membership and role-assignment
writes. Deferred database checks ensure every surviving Tenant has an ACTIVE
system Owner. PostgreSQL serialization failures require whole-transaction retry.
All relations retain structural RLS and no ordinary API grants or policies.

## Alternatives Considered

A single role column conflicts with multi-role requirements. Per-tenant system
preset copies introduce drift. A deferred count without serialization permits
write skew. Advisory locking is permitted by AR-027, but enforcing SERIALIZABLE
avoids relying on subtle lock/snapshot ordering. Public authorization RPCs and
operative RLS are deferred to M1.2.

## Consequences

Trusted writers must use explicit transactions and handle retries. Bootstrap
must create the Owner coherently. Existing ownerless tenants require explicit
reconciliation, never guessed owners. Invitation delivery/authentication and
automatic actor-aware workflow auditing are not delivered by persistence.
See the database test README for exact integrity and test boundaries.

## Ledger / VR References

- Master Product Ledger v1.1, membership/access and security models
- Architecture Reconciliation Register v0.1, AR-026 and AR-027

## Date

2026-10-30
