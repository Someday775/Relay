import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { propose, validate } from './proposal.mjs';
import { copySandbox, sandboxRun } from './sandbox.mjs';

const [demo] = process.argv.slice(2);
const cases = {
  application: {
    path: 'server.js',
    before: '        save({ ...data, tasks });',
    after:
      '        save({ ...data, tasks: tasks.map(item => item.id === existing?.id ? { ...item, status: existing.status } : item) });',
    spec: 'tasks',
    category: 'Likely application defect',
  },
  selector: {
    path: 'public/index.html',
    before: 'id="projects" data-testid="projects"',
    after: 'id="projects" data-testid="project-navigation"',
    spec: 'projects',
    category: 'Selector drift',
  },
  environment: { category: 'Environment' },
};
if (!Object.hasOwn(cases, demo)) {
  console.error(
    'Usage: node quality/maintenance/demo.mjs <application|selector|environment>',
  );
  process.exit(2);
}
const example = cases[demo];
const output = resolve(
  'reports',
  'maintenance-demos',
  demo + '-' + randomUUID().slice(0, 8),
);
const root = join(output, 'workspace');
await mkdir(root, { recursive: true });
await copySandbox(process.cwd(), root);
console.log('Demo workspace:', root);
const gitEnvironment = { ...process.env };
for (const key of [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
]) {
  delete gitEnvironment[key];
}
const git = (...args) =>
  execFileSync(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgSign=false',
      '-c',
      'user.name=Relay fixture',
      '-c',
      'user.email=fixture@relay.test',
      ...args,
    ],
    { cwd: root, env: gitEnvironment, stdio: 'ignore' },
  );
git('init');
if (example.path) {
  git('add', example.path);
  git('commit', '--no-verify', '-m', 'Record clean demo fixture');
  const path = join(root, example.path);
  const source = await readFile(path, 'utf8');
  assert.equal(
    source.split(example.before).length,
    2,
    'Expected exactly one failure injection point',
  );
  await writeFile(path, source.replace(example.before, example.after));
}

const run = await sandboxRun(
  root,
  example.spec
    ? ['--spec', `cypress/e2e/features/${example.spec}.feature`]
    : [],
  demo === 'environment'
    ? { CYPRESS_RUN_BINARY: join(root, 'intentionally-missing-cypress') }
    : {},
);
const directory = join(output, 'failed-run');
await rename(run.archive, directory);
assert.ok(
  Number.isInteger(run.code) && run.code > 0,
  'Cypress must return a failure',
);
assert.equal(run.report.status, 'FAILED');
assert.equal(run.report.exitCode, run.code);
const analysis = JSON.parse(
  await readFile(join(directory, 'analysis.json'), 'utf8'),
);
const card = JSON.parse(await readFile(join(directory, 'teams.json'), 'utf8'));
assert.match(card.attachments[0].content.body[0].text, /FAILED/);
assert.ok(
  analysis.findings.some((finding) => finding.category === example.category),
  'Unexpected classifications: ' +
    analysis.findings.map((finding) => finding.category).join(', '),
);
console.log('Failed run artifacts:', directory);

if (demo === 'selector') {
  const digest = await propose(
    root,
    directory,
    process.env.RELAY_MODEL_COMMAND,
  );
  assert.equal(await validate(root, directory), digest);
  console.log('Validated patch requires separate human approval.');
  console.log('Patch:', join(directory, 'selector.patch'));
  console.log('Approval digest:', digest);
} else {
  await assert.rejects(
    () => propose(root, directory),
    /No policy-eligible selector correction/,
  );
  console.log('Policy blocked test-code changes.');
}
