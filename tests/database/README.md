# Local M1.1A structural tests

Run with Node 24, project pnpm 12.11.2, Supabase CLI 2.122.0, and the local
Docker/Supabase stack running. Docker must be on the process PATH (Windows
Docker Desktop per-user installs may need their `resources/bin` directory).

```sh
npx pnpm@12.11.2 exec supabase db reset --local --no-seed
npx pnpm@12.11.2 test:db
```

Reset **destroys local database data** and reconstructs the migration history.
The test command does not reset automatically and accepts no remote target.
On the verified Windows Docker setup, a reset left the loopback API connection
resetting despite healthy containers. Restarting only the local gateway with
`docker restart supabase_kong_veni-reserve` restored Auth connectivity. If this
occurs, verify the local stack and retry after that targeted restart.
It verifies the project-local loopback Auth URL, creates a synthetic identity
through the supported Auth Admin API, and runs pgTAP through `supabase test db
--local`. No provider identity rows are fabricated. The SQL template receives
only that generated identity UUID in an OS temporary file. Credentials remain
in process memory. SQL fixtures roll back, the Auth fixture is deleted in
`finally`, and the temporary directory is removed. A cleanup failure fails the
command; interrupted processes may require local fixture cleanup or a reset.

The suite tests real PostgreSQL keys, foreign keys, lifecycle constraints,
multi-Tenant Memberships, durable pair uniqueness, deletion restrictions,
creation timestamps, RLS flags, absence of policies and API table privileges.
It does not implement the M1.2 authorization matrix. Existing `pnpm test` and CI
remain unchanged; database CI belongs to M1.3.
The Node harness is checked by `tsconfig.node.json` and excluded from the
Cloudflare compilation so its filesystem/process types remain in the tooling
boundary. No new runtime dependency is required.

## Persistence decisions (AR-026)

The three tables use UUID primary keys, `created_at timestamptz not null default
now()`, and table-local text CHECKs for small lifecycle vocabularies. Lifecycle
values have no defaults. No `updated_at` or transition history is claimed;
access workflows/audit belong to M1.1B. No Role or ownership data is persisted.

All three foreign keys use `ON DELETE RESTRICT ON UPDATE RESTRICT`:
Memberships prevent deletion of their Tenant or application User, including
revoked relationships. An application User prevents deletion of its Auth
identity even without Memberships. Any eventual hard-delete process must
explicitly address retained relationships; no cascade erases history.

The unique `(tenant_id, user_id)` constraint covers Tenant-first access. A
separate `user_id` index supports a User's Memberships and FK checks.

RLS is enabled on all three public tables with no policies, and inherited
`PUBLIC`, `anon` and `authenticated` table privileges are revoked. Ordinary
RLS-subject roles therefore have default-deny row access; privileges also gate
table access. Owners normally bypass RLS and superusers/BYPASSRLS roles bypass
it. The privileged structural tests do not prove operative tenant isolation.

References: Master Product Ledger v1.1; Architecture Reconciliation Register
v0.1, AR-026. This is M1.1A only; M1.1 remains open pending M1.1B.
