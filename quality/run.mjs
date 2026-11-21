import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { generate } from 'multiple-cucumber-html-reporter';
import { analyze } from './analyze.mjs';
import { renderHtml, renderPdf } from './render.mjs';
import { normalize, summary } from './results.mjs';
import { teamsCard } from './teams.mjs';

const start = new Date();
const startedAt = start.toISOString();
const ci = process.env.GITHUB_ACTIONS === 'true';
const runId = ci
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`
  : 'local-' + randomUUID().slice(0, 12);
const directory = join('reports', startedAt.slice(0, 10), runId);
const runUrl = ci
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : undefined;

await mkdir(directory, { recursive: true });
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `directory=${directory}\narchive=relay-${startedAt.slice(0, 10)}-${runId}\n`,
  );
}

async function runCypress() {
  const log = createWriteStream(join(directory, 'cypress.log'));
  const child = spawn(
    process.execPath,
    [
      'node_modules/cypress/bin/cypress',
      'run',
      '--posix-exit-codes',
      ...process.argv.slice(2),
    ],
    {
      env: { ...process.env, RELAY_REPORT_DIRECTORY: directory },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  for (const [source, destination] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    source.on('data', (value) => {
      destination.write(value);
      log.write(value);
    });
  }
  child.on('error', (error) => log.write(error.message + '\n'));
  const code = await new Promise((resolve) => child.once('close', resolve));
  log.end();
  await finished(log);
  return Number.isInteger(code) && code >= 0 ? code : 1;
}

const exitCode = await runCypress();
process.exitCode = exitCode;

let features = [];
try {
  features = JSON.parse(
    await readFile(join(directory, 'cucumber.json'), 'utf8'),
  );
  if (!Array.isArray(features))
    throw new Error('Expected a Cucumber feature array.');
} catch (error) {
  if (error.code !== 'ENOENT')
    console.error('Cucumber results could not be read:', error.message);
  features = [];
}
const report = normalize(
  features,
  {
    runId,
    runUrl,
    startedAt,
    exitCode,
    environment: ci ? 'GitHub Actions' : 'Local',
    durationMs: Date.now() - start.getTime(),
  },
  directory,
);
if (report.status === 'FAILED' && !exitCode) process.exitCode = 1;

const writeJson = (name, value) =>
  writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n');
const markdown = summary(report);
const reports = await Promise.allSettled([
  writeJson('results.json', report),
  writeJson(
    'teams.json',
    teamsCard(report, {
      reportUrl: process.env.REPORT_PDF_URL || undefined,
      artifactUrl: runUrl,
    }),
  ),
  analyze(report, { modelCommand: process.env.RELAY_MODEL_COMMAND }).then(
    (value) => writeJson('analysis.json', value),
  ),
  renderHtml(report, directory),
  renderPdf(report, directory),
  writeFile(join(directory, 'summary.md'), markdown),
  ...(process.env.GITHUB_STEP_SUMMARY
    ? [appendFile(process.env.GITHUB_STEP_SUMMARY, markdown)]
    : []),
]);
if (features.length) {
  try {
    const legacyData = join(directory, 'cucumber-data');
    await mkdir(legacyData);
    // The reporter scans a directory, so keep the Cucumber input separate from our other JSON.
    await writeFile(
      join(legacyData, 'cucumber.json'),
      JSON.stringify(features),
    );
    generate({
      jsonDir: legacyData,
      reportPath: join(directory, 'cucumber'),
      reportName: 'Relay Cucumber scenarios',
      pageTitle: 'Relay Cucumber scenarios',
      displayDuration: true,
      customData: {
        title: 'Execution',
        data: [
          { label: 'Run', value: runId },
          { label: 'Environment', value: report.environment },
          { label: 'Started (UTC)', value: startedAt },
        ],
      },
    });
  } catch (error) {
    reports.push({ status: 'rejected', reason: error });
  }
}
for (const result of reports) {
  if (result.status === 'rejected') {
    console.error('Report generation failed:', result.reason.message);
    process.exitCode ||= 1;
  }
}
console.log(markdown);
console.log('Run archive:', directory);
