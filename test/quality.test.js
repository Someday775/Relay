import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalize } from '../quality/results.mjs';
import { analyze } from '../quality/analyze.mjs';
import { renderHtml, renderPdf } from '../quality/render.mjs';
import { teamsCard } from '../quality/teams.mjs';

const metadata = {
  runId: 'report-test',
  startedAt: '2026-11-21T16:00:00.000Z',
  durationMs: 1500,
  exitCode: 1,
  environment: 'Test',
};

test('an assertion failure reaches HTML, PDF, JSON, analysis and the Teams card', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'relay-report-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = normalize([{
    uri: 'tasks.feature', name: 'Tasks',
    elements: [{
      type: 'scenario', name: 'Status persists', id: 'tasks;status-persists',
      steps: [{
        keyword: 'Then ', name: 'I see <Done>',
        result: { status: 'failed', error_message: 'AssertionError: expected Done' },
      }],
    }, {
      type: 'scenario', name: 'Status list', id: 'tasks;status-list',
      steps: [{ keyword: 'Then ', name: 'I see tasks', result: { status: 'skipped' } }],
    }],
  }], metadata, directory);

  assert.equal(report.status, 'FAILED');
  assert.deepEqual(report.counts, { total: 2, passed: 0, failed: 1, skipped: 1 });
  assert.equal(report.scenarios[0].failedStep, 'Then I see <Done>');
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.equal((await analyze(report)).findings[0].category, 'Behaviour or expectation mismatch');

  const card = teamsCard(report, { reportUrl: 'https://example.com/report.pdf' }).attachments[0].content;
  assert.equal(card.actions[0].type, 'Action.ToggleVisibility');
  assert.equal(card.actions[1].url, 'https://example.com/report.pdf');
  assert.equal(card.body.find((item) => item.id === 'failure-details').isVisible, false);

  await Promise.all([renderHtml(report, directory), renderPdf(report, directory)]);
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  assert.match(html, /Then I see &lt;Done&gt;/);
  assert.match(html, /AssertionError: expected Done/);
  const pdf = await readFile(join(directory, 'report.pdf'));
  assert.equal(pdf.toString('ascii', 0, 5), '%PDF-');
});

test('a runner failure without Cucumber output remains failed', async () => {
  const report = normalize([], metadata, tmpdir());
  assert.equal(report.status, 'FAILED');
  assert.equal(report.counts.total, 0);
  assert.equal((await analyze(report)).findings[0].category, 'Runner or setup');
});

test('selector policy preserves the business assertion and rejects other edits', async () => {
  const { applySelector, editableFile, selectorChange } = await import('../quality/maintenance/policy.mjs');
  const before = '<nav id="projects" data-testid="projects" aria-label="Projects">';
  const after = '<nav id="projects" data-testid="project-navigation" aria-label="Projects">';
  const candidate = selectorChange(before, after);
  assert.deepEqual(candidate, { file: editableFile, from: 'projects', to: 'project-navigation' });
  assert.equal(selectorChange(before, after.replace(' aria-label="Projects"', '')), null);
  assert.equal(selectorChange(before, after + '\n' + after), null);

  const source = "export const projectList = () => byTestId('projects');\nexpect(result).to.equal(403);\n";
  assert.equal(applySelector(source, candidate),
    "export const projectList = () => byTestId('project-navigation');\nexpect(result).to.equal(403);\n");
  assert.throws(() => applySelector(source, { ...candidate, file: 'server.js' }), /allowlist/);
  assert.throws(() => applySelector(source, { ...candidate, to: "x'); cy.exec('anything" }), /allowlist/);
  assert.throws(() => applySelector(source + source, candidate), /exact project-list helper/);
});
