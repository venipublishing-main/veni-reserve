# Engineering foundation

## Local setup

Use Node 24 LTS and pnpm 12.11.2 (pinned by `packageManager` in `package.json`).
Do not silently replace the workstation's Node or package manager installation.
If pnpm 12.11.2 is unavailable, use `npx --yes --package=pnpm@12.11.2 pnpm`
in place of `pnpm` in each command below. This invokes the pinned version without
a global installation. The committed lockfile makes dependency resolution repeatable.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dev
```

Open the local URL printed by the dev server. `/` renders the product name,
tagline, and development indication; `/health` returns public service metadata
as uncached JSON. No Supabase credentials or `.env` file are required.
Stop the server with Ctrl+C.

`pnpm preview` builds and serves the production bundle in the local Workers
runtime using Vite preview. It does not deploy. `pnpm typecheck` regenerates
Workers binding types and React Router route types, then checks both TypeScript
projects. `postinstall` generates local Workers types. Generated types, build
outputs, local runtime state, and TypeScript build metadata are ignored.

The scaffold's `pnpm-workspace.yaml` allows build scripts only for `esbuild` and
`workerd`, which need their native runtime binaries. Review any future additions.
Normal source/config/documentation files use LF through `.gitattributes`.

## Scaffold provenance

Reference generated on 2026-10-14 with the official Cloudflare C3 CLI:

```sh
pnpm create cloudflare@2.74.0 ../veni-reserve-m01-scaffold --framework=react-router --platform=workers --no-deploy --no-git --no-open --no-agents --no-auto-update --accept-defaults
```

C3 dispatched to `create-react-router@8.4.0`, then configured the Cloudflare
plugin, Worker entry point, split TypeScript projects, and local preview.
Only required tooling/runtime files were merged. Welcome assets, generated agent
skills, and the deploy script were not incorporated. Existing project documents
and repository history were preserved. The scaffold stays outside this repository.

Integration references:

- [Cloudflare React Router guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
- [Tailwind React Router Vite integration](https://tailwindcss.com/docs/installation/framework-guides/react-router)
- [pnpm installation](https://pnpm.io/installation/)

## Environment conventions

| Environment | Identifier | Current target |
| --- | --- | --- |
| DEV | `dev` | Local-first application and local Workers runtime |
| STG | `stg` | Supabase `vf-reserve-stg`; Cloudflare non-production deployment only when explicitly authorised |
| PROD | `prod` | Not provisioned |

Resource names follow `vf-<product>-<environment>`. The local Wrangler definition
uses `vf-reserve-dev`; it does not create a hosted Worker. Its non-secret `vars`
set `VENI_PRODUCT=reserve` and `VENI_ENV=dev`. Runtime routes read only the specific
public environment binding they need. A production-mode build does not change the
business environment to `prod`; deployment environment configuration is a later step.

`.env.example` is a placeholder-only future integration manifest, not a requirement
to configure a remote database. Local `.env*` and `.dev.vars*` secret files are
ignored. Never commit credentials or dump the runtime environment into responses.
The future `SUPABASE_SECRET_KEY` is server-only and must never enter client bundles,
loader responses, logs, or source control. Environment credentials remain separate.

## Application boundaries

Follow this dependency direction:

```text
Routes / UI
  -> Application / domain services
    -> Provider / infrastructure adapters
      -> External systems
```

`app/routes/` contains the current shell and health resource route; `app/root.tsx`
contains the document layout and error boundary. `workers/app.ts` is the SSR
runtime entry point. Add `app/components/`, `app/features/`, `app/services/`, and
`app/lib/` only when real code requires them. Keep provider SDK use behind adapters
as domain work begins. These are logical boundaries in one application, not
microservices. M0.1 introduces no business entities, authentication, or RLS.

Future logical services include tenant/membership authorization, business
configuration, availability, booking/appointment, client, theme/publication,
communications, integrations/calendar, onboarding, import/export, entitlements,
platform administration, and distribution/domain routing. Their implementation
requires the approved product design.

Tailwind implements application styling. The small `--vr-*` CSS variable layer is
a starting point for semantic styling, not a tenant theme model. Tenant-supplied
arbitrary CSS and Theme Studio are outside M0.1.

## Validation and future work

Vitest tests the real health loader's HTTP/JSON contract, environment binding, and
restricted public response. Its Cloudflare module mock keeps unit tests local;
it does not replace a dev/preview smoke check of the actual Workers runtime.
CI runs a frozen install, typecheck, lint, unit tests, and build on pull requests
and pushes to `main`. It needs no provider secrets and performs no deployment.

Playwright is the approved M0 follow-on for browser/E2E coverage; it is not
installed yet. Add browser journeys and CI browser jobs when that step is scoped.
Zod is approved but deferred until validation needs it. The health endpoint is
process liveness only, not a database or integration readiness check. Build IDs
are deferred until a release/version workflow exists.

Database work follows the [migration convention](../../supabase/migrations/README.md)
in M1. Architecture changes follow the [ADR process](../adr/README.md).
Cloudflare deployment, production provisioning, and Supabase linking are separate
explicit steps.
