# Security Policy

Veni Reserve is maintained by Veni Publishing as part of Veni Flow.

## Public repository rule

This repository is public for operational accessibility. It must never contain:

- passwords
- private API keys
- Supabase service-role values
- database passwords
- OAuth client secrets
- Meta or WhatsApp access tokens
- SMTP or transactional-email credentials
- signing/private keys
- production `.env` files
- real customer or tenant data
- private billing, recovery-code, or infrastructure-security records

## Secret handling

Use local ignored environment files during development and provider-managed secret stores for hosted environments.

The committed `.env.example` is a variable-name manifest only.

## Reporting a vulnerability

Do not publish active vulnerabilities, leaked credentials, or sensitive security details in a public GitHub issue.

Until a dedicated Veni security mailbox is established, report security concerns privately to:

`veni.publishing@gmail.com`

If a credential is exposed, treat it as compromised and rotate/revoke it immediately rather than merely deleting it from the repository.

## Environment separation

Development, staging and production credentials must remain separate. Production credentials must never be reused for development or staging.
