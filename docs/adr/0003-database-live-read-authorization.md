# 0003: Database-live read authorization

## Status

Accepted architecture through AR-028. M1.2 implementation requires independent
review and integration before closure.

## Context

M1.1 established access persistence and transaction integrity without an ordinary
API surface. M1.2 must authorize reads while enforcing tenant isolation and
immediate loss of authority after committed membership/role changes.

## Decision

Resolve authority from the validated Auth identity through the live User,
ACTIVE Membership, assigned Roles and explicit Permission mappings. A signed
`is_anonymous` JSON boolean must be false; missing or anonymous classification
fails closed. User metadata, role labels and cached JWT capabilities are not
authority. A mapping for an own-scope capability does not authorize a domain row
or substitute for future same-tenant Staff linkage.

Grant authenticated SELECT only on tenants, users, memberships, roles,
role_permissions, membership_roles and audit_events. Each has one SELECT policy.
Withhold application-table writes and ordinary service-role privileges. Keep
permissions and private invitation history inaccessible through the ordinary API.

Use an invoker identity helper and seven read-only private definers owned by the
verified migration/table owner, postgres. The acyclic helper graph avoids recursive
RLS while inspecting the access graph. Each helper uses a fixed empty search_path,
qualified relations, caller-scoped results and no supplied actor identity. Only
authenticated receives exact-signature EXECUTE and private schema USAGE; private
remains outside API schemas/search paths. Integrity triggers remain invokers and
receive no ordinary API execution grants. No public wrapper, view or mutation RPC
is introduced.

SETUP/ACTIVE permit the approved read surfaces. SUSPENDED/ARCHIVED expose only
minimal tenant metadata to still-active members with tenant.read, plus the
separate own-identity/own-membership status channel. Inactive memberships confer
no normal authority. Global User projections are self-only. Directory and audit
reads require their live same-tenant capabilities; visible role definitions do
not themselves grant capabilities.

## Alternatives Considered

JWT authority caches delay revocation. Joins through recursively protected graph
tables risk policy recursion. Broad definers or service-role CRUD weaken the
database boundary. The bounded private predicates inspect only the caller's
approved authorization context without creating a public service API.

## Consequences

Subsequent requests using the same signed token observe committed membership,
assignment and mapping changes. Revocation does not require token refresh.
Provider identity/session validation remains the provider's responsibility.
No mutation endpoint is delivered here: later trusted writers must retain the
SERIALIZABLE/whole-transaction retry, final Owner and atomic audit contracts.

Local evidence combines structural pgTAP, preserved M1.1 integrity/concurrency
tests and genuine Auth/PostgREST attacks. Temporary anonymous sign-in testing uses
an OS-temporary CLI work directory and guarded local reset boundaries; canonical
Auth settings remain unchanged. Hosted security CI belongs to M1.3.

## References

- Master Product Ledger v1.1
- Architecture Reconciliation Register v0.1, AR-026, AR-027 and AR-028
- [Local database and security evidence](../../tests/database/README.md)

## Date

2026-10-31
