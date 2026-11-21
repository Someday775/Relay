import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { createArchive, reportOptions } from './archive.mjs';

const options = reportOptions();
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
const scratch = await mkdtemp(join(tmpdir(), 'relay-report-'));

async function runCypress() {
  const log = createWriteStream(join(scratch, 'cypress.log'));
  const child = spawn(
    process.execPath,
    [
      'node_modules/cypress/bin/cypress',
      'run',
      '--posix-exit-codes',
      ...process.argv.slice(2),
    ],
    {
      env: { ...process.env, RELAY_REPORT_DIRECTORY: scratch },
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
  child.once('error', (error) => log.write(error.message + '\n'));
  const code = await new Promise((resolve) => child.once('close', resolve));
  log.end();
  const exitCode = Number.isInteger(code) && code >= 0 ? code : 1;
  process.exitCode = exitCode;
  await finished(log);
  return exitCode;
}

try {
  const exitCode = await runCypress();
  const { report, markdown, errors } = await createArchive(
    scratch,
    directory,
    {
      runId,
      runUrl,
      startedAt,
      exitCode,
      environment: ci ? 'GitHub Actions' : 'Local',
      durationMs: Date.now() - start.getTime(),
    },
    options,
  );
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `directory=${directory}\narchive=relay-${startedAt.slice(0, 10)}-${runId}\nretention=${options.retentionDays}\npdf=${Boolean(report.artifacts.pdf)}\n`,
    );
  }
  if (report.status === 'FAILED' || errors.length) process.exitCode ||= 1;
  for (const error of errors)
    console.error('Report generation failed:', error.message);
  console.log(markdown);
  console.log('Run archive:', directory);
} catch (error) {
  process.exitCode ||= 1;
  console.error('Report generation failed:', error.message);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
