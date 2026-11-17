#!/usr/bin/env node
/**
 * Reserve-owned, pinned M2.3–M2.5 SQL translation for Website integration review.
 * This script never connects to a database and never writes deployable migrations.
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {{
 *  id: string, filename: string, blob: string, role: string,
 *  relations: readonly string[], rpcs: readonly string[], output: string
 * }} SourceSpec
 */

export const SOURCES = Object.freeze([
  Object.freeze({
    id: 'location',
    filename: '20261117121500_locations_private_configuration.sql',
    blob: 'f69f549b8989cc36bbd57a27ae026c22b9c94133',
    role: 'veni_location_executor',
    relations: ['locations', 'location_events'],
    rpcs: ['list_tenant_locations', 'save_tenant_location'],
    output: 'preview-m23-location.sql',
  }),
  Object.freeze({
    id: 'service',
    filename: '20261117123001_service_private_configuration.sql',
    blob: '09a09b94dcccda5808df594ac0353d1bf2e7b8bb',
    role: 'veni_service_executor',
    relations: ['services', 'service_events'],
    rpcs: ['list_tenant_services', 'save_tenant_service'],
    output: 'preview-m24-service.sql',
  }),
  Object.freeze({
    id: 'staff',
    filename: '20261117130126_staff_eligibility_private_configuration.sql',
    blob: 'e0c4a8e9225e9265db0ff3fa8b70135dd8fe581c',
    role: 'veni_staff_executor',
    relations: ['staff_members', 'staff_events', 'eligibility_links', 'eligibility_events'],
    rpcs: ['list_tenant_staff', 'save_tenant_staff', 'list_tenant_eligibility', 'save_tenant_eligibility'],
    output: 'preview-m25-staff.sql',
  }),
]);

const SHARED_PUBLIC_DEPENDENCIES = new Set(['tenants', 'users', 'memberships']);

/** @param {string} content */
export function gitBlobSha(content) {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/** @param {string} sql @param {string} marker */
function requireOnce(sql, marker) {
  const at = sql.indexOf(marker);
  if (at < 0 || sql.indexOf(marker, at + marker.length) >= 0) {
    throw new Error(`Source drift: expected one occurrence of ${marker}`);
  }
}

/** @param {string} sql @param {SourceSpec} spec */
function assertPinnedSource(sql, spec) {
  if (typeof sql !== 'string' || !sql.trim()) throw new Error(`Missing ${spec.id} SQL`);
  const actual = gitBlobSha(sql);
  if (actual !== spec.blob) throw new Error(`${spec.id} source changed (${actual}); review and re-pin explicitly`);
}

/**
 * The exact Git blobs are mandatory, even for transform() calls. Changes to
 * grants, policies, SQL literals, or function signatures demand human review.
 */
/** @param {string} sql @param {SourceSpec} spec */
export function transform(sql, spec) {
  assertPinnedSource(sql, spec);
  if (!/\bbegin;/.test(sql) || !/\ncommit;\s*$/.test(sql)) {
    throw new Error(`${spec.id} transaction boundary changed`);
  }
  requireOnce(sql, `create role ${spec.role} nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication noinherit;`);
  requireOnce(sql, `revoke ${spec.role} from postgres;`);
  for (const relation of spec.relations) requireOnce(sql, `create table private.${relation} (`);
  for (const rpc of spec.rpcs) requireOnce(sql, `create function public.${rpc}(`);

  const allowedPublic = new Set([...SHARED_PUBLIC_DEPENDENCIES, ...spec.rpcs]);
  for (const [, name] of sql.matchAll(/\bpublic\.([a-z_][a-z_0-9]*)\b/g)) {
    if (!allowedPublic.has(name)) throw new Error(`Unexpected cross-sphere public reference: public.${name}`);
  }
  if (/\b(?:create|alter|drop|truncate)\s+(?:table|function|view|policy)\s+(?:auth|storage|arcana)\./i.test(sql) ||
      /\b(?:grant|revoke)\s+(?:all|usage|create)\s+on\s+schema\s+(?:public|auth|storage)\b/i.test(sql) ||
      /\bcreate\s+table\s+public\./i.test(sql)) {
    throw new Error('Source tries to change shared Website/Auth/Storage objects or privileges');
  }

  // Website owns shared public API and identity. Reserve owns isolated domain.
  let result = sql.replace(/\bpublic\.(tenants|users|memberships)\b/g, 'reserve.$1');
  result = result.replace(/\bpublic\.([a-z_][a-z_0-9]*)\b/g, (match, name) => {
    if (!spec.rpcs.includes(name)) throw new Error(`Unexpected public dependency after tenant conversion: ${match}`);
    return `public.reserve_${name}`;
  });
  result = result.replace(/\bprivate\./g, 'reserve_internal.');
  result = result.replace(/\bschema private\b/g, 'schema reserve_internal');
  result = result.replace(new RegExp(`\\b${spec.role}\\b`, 'g'), `reserve_${spec.role.slice(5)}`);

  if (/\bprivate\.|\bschema private\b|\bveni_(?:location|service|staff)_executor\b/.test(result) ||
      /\bcreate\s+table\s+public\./i.test(result)) {
    throw new Error(`${spec.id} contains unconverted private or global objects`);
  }
  const resultingPublic = new Set(spec.rpcs.map(rpc => `reserve_${rpc}`));
  for (const [, name] of result.matchAll(/\bpublic\.([a-z_][a-z_0-9]*)\b/g)) {
    if (!resultingPublic.has(name)) throw new Error(`Unexpected Website public dependency: ${name}`);
  }
  return `-- LOCAL PREVIEW: ${spec.id}. NON-DEPLOYABLE until integrated and approved.\n-- Integration, local real-Auth/RLS testing and owner approval are required.\n${result}`;
}

/** @param {string} [root] */
export async function verifySources(root = moduleRoot) {
  const previews = [];
  for (const spec of SOURCES) {
    const source = await readFile(join(root, 'supabase', 'migrations', spec.filename), 'utf8');
    previews.push({ spec, sql: transform(source, spec) });
  }
  return previews;
}

/** @param {string[]} args */
async function main(args) {
  if (!(args.length === 1 && args[0] === '--verify') &&
      !(args.length === 2 && args[0] === '--preview-dir' && isAbsolute(args[1]))) {
    throw new Error('Use --verify or --preview-dir /absolute/disposable/directory');
  }
  const previews = await verifySources();
  if (args[0] === '--preview-dir') {
    const target = resolve(args[1]);
    const rel = relative(moduleRoot, target);
    // Prevent a generated file from accidentally entering any deployed migration
    // directory or this source repository. Preview artifacts belong in scratch.
    if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) {
      throw new Error('Preview directory must be outside the Reserve source repository');
    }
    if (target === '/' || target === dirname(target)) throw new Error('Use a narrow disposable directory');
    await mkdir(target, { recursive: true });
    for (const { spec, sql } of previews) {
      await writeFile(join(target, spec.output), sql, { flag: 'wx' });
    }
  }
  for (const { spec } of previews) {
    process.stdout.write(`${spec.id}: ${spec.blob}; ${spec.relations.length} private tables; ${spec.rpcs.length} namespaced RPCs\n`);
  }
  process.stdout.write('Local review only; NO hosted Supabase operation performed.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
