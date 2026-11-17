# 0005: Proposed common identity and standalone SSR origin

Status: **Proposed — owner approval and provider evidence pending**
Date: 2026-11-13

## Context

Reserve and Veni Account have distinct Auth projects. Current M1 identity/RLS binds
public.users to the local auth.users UUID. The parent static website cannot host
Reserve's SSR backend, and provider project inspection was denied.

## Proposed decision

Evaluate central Veni Account OIDC with a deliberately mapped Reserve-local Auth
identity/session. Preserve server-side active Membership/capability resolution and
independent RLS. Do not link by email or accept foreign JWTs as Reserve authority.
Use an independently deployed, explicitly approved SSR workers.dev target for the
first connected test; retain the parent Pages site and separate static Playground.
No provider changes or deployment are authorized by this proposed ADR.

## Alternatives considered

Direct external JWT acceptance requires changing current identity assumptions.
Project consolidation expands migration/blast radius. Independent passwords create
the duplicate identity the product is avoiding. None is silently selected as fallback.

## Consequences

Provider enablement/signing, consent, dual-hop PKCE, linking/collision handling,
callbacks, logout/revocation and resource quotas remain explicit gates. Synthetic
contract tests cannot prove interoperability. See the [feasibility report](../engineering/veni-account-federation-feasibility.md)
for evidence, limitations, owner actions and rollback boundaries.

## Ledger / VR references

Master Product Ledger amendments 01–03; VR-1476/1477/1481/1488–1490;
Issue #13 and PR #14 coordination comments. No private source text is reproduced.
