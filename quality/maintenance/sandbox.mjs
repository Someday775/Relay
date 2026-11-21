import { spawn } from 'node:child_process';
import {
  cp,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from './policy.mjs';

const inputs = [
  '.cypress-cucumber-preprocessorrc.json',
  'cypress.config.ts',
  'cypress',
  'eslint.config.js',
  'package.json',
  'package-lock.json',
  'public',
  'quality',
  'seed.js',
  'server.js',
  'tsconfig.json',
];

async function inputFiles(root, path) {
  const info = await lstat(join(root, path));
  if (info.isSymbolicLink())
    throw new Error('Symlink in validation inputs: ' + path);
  if (info.isFile()) return [path];
  if (!info.isDirectory())
    throw new Error('Unexpected validation input: ' + path);
  const entries = (await readdir(join(root, path))).sort();
  return (
    await Promise.all(
      entries.map((entry) => inputFiles(root, join(path, entry))),
    )
  ).flat();
}

export async function fingerprint(root) {
  const files = (
    await Promise.all(inputs.map((path) => inputFiles(root, path)))
  ).flat();
  const entries = await Promise.all(
    files.map(async (path) => [path, hash(await readFile(join(root, path)))]),
  );
  return hash(JSON.stringify(entries));
}

export async function copySandbox(root, directory) {
  await fingerprint(root);
  for (const path of inputs)
    await cp(join(root, path), join(directory, path), { recursive: true });
  await symlink(
    await realpath(join(root, 'node_modules')),
    join(directory, 'node_modules'),
    'dir',
  );
}

export async function withSandbox(root, callback) {
  const directory = await mkdtemp(join(tmpdir(), 'relay-maintenance-'));
  try {
    await copySandbox(root, directory);
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function sandboxRun(directory, args = [], overrides = {}) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^cypress_/i.test(name) && name !== 'CYPRESS_CACHE_FOLDER')
      delete env[name];
  }
  Object.assign(env, overrides);
  for (const name of [
    'GITHUB_ACTIONS',
    'GITHUB_OUTPUT',
    'GITHUB_STEP_SUMMARY',
    'RELAY_MODEL_COMMAND',
    'TEAMS_WEBHOOK_URL',
    'SP_CLIENT_SECRET',
    'REPORT_PDF_URL',
  ])
    delete env[name];
  const child = spawn(process.execPath, ['quality/run.mjs', ...args], {
    cwd: directory,
    env,
    stdio: 'inherit',
    signal: AbortSignal.timeout(240000),
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  const archives = await readdir(join(directory, 'reports'));
  if (archives.length !== 1)
    throw new Error('Expected one report date in the validation run.');
  const date = join(directory, 'reports', archives[0]);
  const runs = await readdir(date);
  if (runs.length !== 1)
    throw new Error('Expected one validation run archive.');
  const archive = join(date, runs[0]);
  return {
    code,
    archive,
    report: JSON.parse(await readFile(join(archive, 'results.json'), 'utf8')),
  };
}
