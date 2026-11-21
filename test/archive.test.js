import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createArchive, reportOptions } from '../quality/archive.mjs';
import { publishPdf } from '../quality/sharepoint.mjs';
import { publishCard, teamsCard } from '../quality/teams.mjs';

const run = {
  runId: 'test-run',
  environment: 'Test',
  startedAt: '2026-11-21T16:00:00Z',
  durationMs: 5,
};

async function fixture(t, status) {
  const root = await mkdtemp(join(tmpdir(), 'relay-archive-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scratch = join(root, 'scratch');
  const output = join(root, 'archive');
  await mkdir(scratch);
  await writeFile(
    join(scratch, 'cypress.log'),
    'detailed output\nCYPRESS_RUN_BINARY missing\n',
  );
  if (status)
    await writeFile(
      join(scratch, 'cucumber.json'),
      JSON.stringify([
        {
          uri: 'cypress/e2e/features/tasks.feature',
          name: 'Tasks',
          elements: [
            {
              type: 'scenario',
              name: 'Status persists',
              steps: [
                {
                  keyword: 'Given ',
                  name: 'a task exists',
                  result: { status: 'passed' },
                },
                {
                  keyword: 'When ',
                  name: 'I update it',
                  result: { status: 'passed' },
                },
                {
                  keyword: 'Then ',
                  name: 'I see Done',
                  result: {
                    status,
                    ...(status === 'failed'
                      ? { error_message: 'Expected Done but got To do' }
                      : {}),
                  },
                },
              ],
            },
          ],
        },
      ]),
    );
  return { scratch, output, root };
}

test('passing runs keep only the HTML and normalized JSON by default', async (t) => {
  const { scratch, output, root } = await fixture(t, 'passed');
  const summaryPath = join(root, 'step-summary');
  const { report, errors } = await createArchive(
    scratch,
    output,
    { ...run, exitCode: 0 },
    { summaryPath },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual((await readdir(output)).sort(), [
    'index.html',
    'results.json',
  ]);
  assert.equal(report.status, 'PASSED');
  assert.deepEqual(report.artifacts, {});
  assert.match(await readFile(summaryPath, 'utf8'), /1 total · 1 passed/);
  const html = await readFile(join(output, 'index.html'), 'utf8');
  for (const text of [
    'Tasks',
    'Status persists',
    'Given a task exists',
    'When I update it',
    'Then I see Done',
  ])
    assert.ok(html.includes(text));
  assert.doesNotMatch(html, /href="(?:report.pdf|teams.json|diagnostics\/)/);
  assert.equal(
    await publishPdf(output, { SP_DRIVE_ID: 'drive' }, () =>
      assert.fail('unexpected network request'),
    ),
    null,
  );
});

test('failed runs retain investigation evidence and reference it without duplicating logs or DOM data', async (t) => {
  const { scratch, output } = await fixture(t, 'failed');
  const screenshot = 'Status persists (failed).png';
  await mkdir(join(scratch, 'screenshots', 'tasks.feature'), {
    recursive: true,
  });
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d494844520000000100000001',
    'hex',
  );
  await writeFile(
    join(scratch, 'screenshots', 'tasks.feature', screenshot),
    png,
  );
  await writeFile(
    join(scratch, 'failure-dom.ndjson'),
    JSON.stringify({
      spec: 'tasks.feature',
      scenario: 'Status persists',
      elements: [{ id: 'example', testId: 'example', visible: true }],
    }) + '\n',
  );
  const { report, errors } = await createArchive(scratch, output, {
    ...run,
    exitCode: 7,
  });
  assert.deepEqual(errors, []);
  assert.equal(report.exitCode, 7);
  assert.equal(report.status, 'FAILED');
  assert.deepEqual((await readdir(output)).sort(), [
    'diagnostics',
    'index.html',
    'results.json',
  ]);
  assert.deepEqual((await readdir(join(output, 'diagnostics'))).sort(), [
    'analysis.json',
    'cypress.log',
    'failure-dom.ndjson',
    'screenshots',
  ]);
  const analysis = JSON.parse(
    await readFile(join(output, report.artifacts.analysis), 'utf8'),
  );
  assert.equal(analysis.log.path, 'diagnostics/cypress.log');
  assert.equal(analysis.log.excerpt, undefined);
  assert.equal(
    analysis.findings[0].evidence.dom,
    'diagnostics/failure-dom.ndjson',
  );
  assert.equal(analysis.findings[0].evidence.screenshots[0].available, true);
  const html = await readFile(join(output, 'index.html'), 'utf8');
  assert.match(html, /Expected Done but got To do/);
  assert.match(html, /diagnostics\/analysis.json/);
  assert.match(
    html,
    /diagnostics\/screenshots\/tasks.feature\/Status%20persists/,
  );
  const card = teamsCard(report);
  await publishCard(
    'https://teams.example/webhook',
    card,
    async (url, options) => {
      assert.equal(url, 'https://teams.example/webhook');
      assert.equal(options.method, 'POST');
      assert.match(options.body, /Relay · FAILED/);
      return { ok: true };
    },
  );
});

test('missing or incomplete Cucumber output generates diagnostics', async (t) => {
  const { scratch, output } = await fixture(t);
  const missing = await createArchive(scratch, output, { ...run, exitCode: 0 });
  assert.equal(missing.report.status, 'FAILED');
  assert.equal(missing.report.incomplete, true);
  assert.equal(missing.report.counts.total, 0);
  assert.match(
    await readFile(join(output, 'index.html'), 'utf8'),
    /Cucumber output is missing/,
  );
  assert.ok(missing.report.artifacts.analysis);
  const skipped = await fixture(t, 'skipped');
  const { report } = await createArchive(skipped.scratch, skipped.output, {
    ...run,
    exitCode: 0,
  });
  assert.equal(report.incomplete, true);
  assert.ok(report.artifacts.analysis);
});

test('explicit exports and retention settings work with mocked SharePoint', async (t) => {
  const { scratch, output } = await fixture(t, 'passed');
  const options = reportOptions({
    RELAY_REPORT_PDF: '1',
    RELAY_REPORT_VERBOSE: '1',
    RELAY_ARCHIVE_TEAMS_CARD: '1',
    RELAY_ARTIFACT_RETENTION_DAYS: '14',
  });
  assert.equal(options.retentionDays, 14);
  assert.throws(
    () => reportOptions({ RELAY_ARTIFACT_RETENTION_DAYS: '91' }),
    /integer/,
  );
  const { report, errors } = await createArchive(
    scratch,
    output,
    { ...run, exitCode: 0 },
    options,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(report.artifacts, {
    log: 'diagnostics/cypress.log',
    cucumber: 'diagnostics/cucumber.json',
    pdf: 'report.pdf',
    teams: 'teams.json',
  });
  assert.match(
    await readFile(join(output, 'teams.json'), 'utf8'),
    /Relay · PASSED/,
  );
  const calls = [];
  const url = await publishPdf(
    output,
    {
      SP_DRIVE_ID: 'drive',
      SP_TENANT_ID: 'tenant',
      SP_CLIENT_ID: 'app',
      SP_CLIENT_SECRET: 'test-only',
    },
    async (destination, request) => {
      calls.push(destination);
      if (request.method === 'POST')
        return { ok: true, json: async () => ({ access_token: 'mock' }) };
      assert.equal(request.method, 'PUT');
      assert.equal(request.headers.Authorization, 'Bearer mock');
      assert.equal(request.body.toString('ascii', 0, 5), '%PDF-');
      return {
        ok: true,
        json: async () => ({ webUrl: 'https://sharepoint.example/relay.pdf' }),
      };
    },
  );
  assert.deepEqual(
    calls.map((value) => new URL(value).hostname),
    ['login.microsoftonline.com', 'graph.microsoft.com'],
  );
  assert.equal(url, 'https://sharepoint.example/relay.pdf');
});

test('sample Teams cards remain available for local previews and tests', async () => {
  for (const status of ['passed', 'failed']) {
    const file = new URL(`../examples/sample-${status}.json`, import.meta.url);
    const card = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(card.type, 'AdaptiveCard');
    assert.match(card.body[0].text, new RegExp(status.toUpperCase()));
    assert.equal(
      card.actions.some(({ type }) => type === 'Action.ToggleVisibility'),
      status === 'failed',
    );
  }
});
