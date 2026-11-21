// Build a fresh, unlinked CLI project from the pinned Website ledger, independent of onboarding.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const [website, stack] = process.argv.slice(2);
assert.ok(website && stack, 'Expected a Website checkout and a new disposable stack directory');
const ref = 'aac1382f41dfb1e7bb8bf11d5ee1f74a6700d274';
const git = (...args) => execFileSync('git', ['-C',website,...args], {encoding:'utf8'}).trimEnd();
const files = git('ls-tree','--name-only',ref+':supabase/migrations').split(/\r?\n/);
const baseline = files.filter(f => /^20261117\d+_reserve_shared_.*\.sql$/.test(f));
assert.equal(baseline.length,9);
mkdirSync(stack); // Refuse to reuse an existing project.
const migrations = join(stack,'supabase','migrations');
mkdirSync(migrations,{recursive:true});
copyFileSync('local/practitioner-schedules/config.toml',join(stack,'supabase','config.toml'));
for (const file of ['20260903_001_veni_account_foundation.sql','20260903071048_revoke_handle_new_user_rpc_access.sql',...baseline]) {
  const name = file.replace('20260903_001_', '20260903070000_');
  writeFileSync(join(migrations,name),git('show',ref+':supabase/migrations/'+file)+'\n');
}
const directory = 'integration/veni-publishing/supabase/migrations';
for (const suffix of ['_reserve_practitioner_schedules.sql','_reserve_dated_exceptions.sql']) {
  const candidates = readdirSync(directory).filter(f => f.endsWith(suffix));
  assert.equal(candidates.length,1);
  copyFileSync(join(directory,candidates[0]),join(migrations,candidates[0]));
}
