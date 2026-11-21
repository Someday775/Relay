import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { teamsCard } from './teams.mjs';

const output = process.argv[2] ?? 'reports/sample-cards';
await mkdir(output, { recursive: true });
const scenario = {
  feature: 'Task management',
  name: 'A completed task stays done after reload',
  status: 'failed',
  failedStep: 'Then "Check handover" is still "Done" after reload',
  error: 'Expected status "Done" but received "To do".',
};
for (const status of ['PASSED', 'FAILED']) {
  const failed = status === 'FAILED' ? 1 : 0;
  const report = {
    status,
    environment: 'Illustrative demo',
    runId: 'sample-' + status.toLowerCase(),
    startedAt: '2026-11-21T16:00:00.000Z',
    durationMs: 14872,
    counts: { total: 11, passed: 11 - failed, failed, skipped: 0 },
    scenarios: failed ? [scenario] : [],
  };
  const payload = teamsCard(report, {
    reportUrl: 'https://example.com/relay/reports/' + report.runId + '.pdf',
  });
  await writeFile(
    join(output, report.runId + '.json'),
    JSON.stringify(payload.attachments[0].content, null, 2) + '\n',
  );
}
