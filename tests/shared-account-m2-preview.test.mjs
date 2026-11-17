import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SOURCES, gitBlobSha, transform, verifySources } from '../scripts/preview-shared-account-m2.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'scripts', 'preview-shared-account-m2.mjs');

test('three exact source Git blobs convert to eight isolated relations and eight namespaced public RPCs', async () => {
  const previews = await verifySources(root);
  assert.equal(previews.length, 3);
  assert.equal(previews.reduce((sum, { spec }) => sum + spec.relations.length, 0), 8);
  assert.equal(previews.reduce((sum, { spec }) => sum + spec.rpcs.length, 0), 8);
  const allRpcs = new Set();
  const allRelations = new Set();

  for (const { spec, sql } of previews) {
    const source = await readFile(join(root, 'supabase', 'migrations', spec.filename), 'utf8');
    assert.equal(gitBlobSha(source), spec.blob);
    assert.match(sql, /LOCAL PREVIEW/);
    assert.doesNotMatch(sql, /\bprivate\.|\bschema private\b/);
    assert.doesNotMatch(sql, /\bpublic\.(?:tenants|users|memberships)\b/);
    assert.doesNotMatch(sql, /\bveni_(?:location|service|staff)_executor\b/);
    assert.doesNotMatch(sql, /\bcreate\s+table\s+public\./i);
    assert.match(sql, /\breserve\.tenants\b/);
    assert.match(sql, /\breserve\.users\b/);
    assert.match(sql, /\breserve\.memberships\b/);
    assert.match(sql, /\brevoke\s+reserve_.*_executor\s+from\s+postgres;/);

    for (const table of spec.relations) {
      assert.match(sql, new RegExp(`create table reserve_internal\\.${table} \\(`));
      assert.match(sql, new RegExp(`alter table reserve_internal\\.${table} enable row level security;`));
      assert.equal(allRelations.has(table), false);
      allRelations.add(table);
    }
    for (const rpc of spec.rpcs) {
      assert.match(sql, new RegExp(`create function public\\.reserve_${rpc}\\(`));
      assert.match(sql, new RegExp(`grant execute on function[\\s\\S]*public\\.reserve_${rpc}\\(`));
      assert.equal(allRpcs.has(rpc), false);
      allRpcs.add(rpc);
    }
    for (const [, name] of sql.matchAll(/\bpublic\.([a-z_][a-z_0-9]*)\b/g)) {
      assert.ok(spec.rpcs.some(rpc => name === `reserve_${rpc}`), `unexpected public.${name}`);
    }
  }
});

test('drift, new public dependencies and removed security statements fail closed', async () => {
  const [{ spec }] = await verifySources(root);
  const source = await readFile(join(root, 'supabase', 'migrations', spec.filename), 'utf8');
  for (const drift of [
    source.replace('public.tenants', 'public.arcana_cards'),
    source.replace('nobypassrls', 'bypassrls'),
    source.replace(`revoke ${spec.role} from postgres;`, '-- accidentally retained inherited membership'),
    source.replace('commit;', '-- commit accidentally omitted'),
    source + '\ncreate table public.unreviewed (id int);\n',
  ]) {
    assert.throws(() => transform(drift, spec), /source changed/);
  }
});

test('CLI verifies without writing, emits only in a disposable directory, never overwrites files', async () => {
  const verified = spawnSync(process.execPath, [cli, '--verify'], { encoding: 'utf8' });
  assert.equal(verified.status, 0, verified.stderr);
  assert.match(verified.stdout, /NO hosted Supabase operation performed/);

  const directory = await mkdtemp(join(tmpdir(), 'reserve-shared-m2-'));
  try {
    const first = spawnSync(process.execPath, [cli, '--preview-dir', directory], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual((await readdir(directory)).sort(), SOURCES.map(source => source.output).sort());
    for (const source of SOURCES) {
      const content = await readFile(join(directory, source.output), 'utf8');
      assert.match(content, /-- LOCAL PREVIEW:/);
    }

    const second = spawnSync(process.execPath, [cli, '--preview-dir', directory], { encoding: 'utf8' });
    assert.notEqual(second.status, 0, 'same output directory must never silently overwrite');
    assert.match(second.stderr, /EEXIST/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const inside = spawnSync(process.execPath, [cli, '--preview-dir', join(root, 'generated-preview')], { encoding: 'utf8' });
  assert.notEqual(inside.status, 0);
  assert.match(inside.stderr, /outside the Reserve source repository/);
});
