# Database migrations

Version-controlled Veni Reserve database migrations belong in this directory.

Do not place credentials, exports containing real customer data, or manual database dumps here.

## Convention

- PostgreSQL SQL in this directory is the authoritative schema history.
- Migrations are ordered and version-controlled. When database work begins, use
  the Supabase CLI migration generator for timestamped, descriptive filenames.
- Include RLS policy changes in the same reproducible migration history.
- Hosted dashboard edits are not authoritative until represented by a migration.
- Do not rewrite migrations already applied to shared environments; add a new one.
- Production-relevant destructive changes must use expand/contract discipline:
  introduce compatible structures, migrate usage/data, then remove old structures
  in a later reviewed change.
- Validate migrations locally before staging once the M1 local database workflow
  exists. Local validation must be reproducible without customer data.

M0.1 documents this convention only. No schema, migrations, remote project link,
or remote migration execution is introduced.
