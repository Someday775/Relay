import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const text = (content, options = {}) => ({
  type: 'TextBlock',
  text: content,
  wrap: true,
  ...options,
});

export function teamsCard(report, { reportUrl, artifactUrl } = {}) {
  const { counts } = report;
  const failures = report.scenarios
    .filter((item) => item.status === 'failed')
    .slice(0, 5);
  const actions = [];
  if (failures.length) {
    actions.push({
      type: 'Action.ToggleVisibility',
      title: 'Toggle failure details',
      targetElements: ['failure-details'],
    });
  }
  if (reportUrl)
    actions.push({
      type: 'Action.OpenUrl',
      title: 'Open PDF report',
      url: reportUrl,
    });
  if (artifactUrl)
    actions.push({
      type: 'Action.OpenUrl',
      title: 'GitHub archive (requires access)',
      url: artifactUrl,
    });
  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.2',
    body: [
      text('Relay · ' + report.status, {
        weight: 'Bolder',
        size: 'Large',
        color: report.status === 'PASSED' ? 'Good' : 'Attention',
      }),
      text(
        `${counts.total} total · ${counts.passed} passed · ${counts.failed} failed · ${counts.skipped} skipped`,
      ),
      text(
        `${report.environment} · ${report.runId} · ${(report.durationMs / 1000).toFixed(1)} s · ${report.startedAt}`,
        { isSubtle: true },
      ),
      text(
        reportUrl
          ? 'PDF: configured report storage. Storage permissions apply.'
          : artifactUrl
            ? 'Reports: GitHub Actions artifact. Repository access is required.'
            : 'Reports: local run archive.',
      ),
      ...failures.map((item) =>
        text(
          item.name +
            ' — ' +
            (item.error.split('\n')[0] || 'See report.').slice(0, 155),
        ),
      ),
      ...(failures.length
        ? [
            {
              type: 'Container',
              id: 'failure-details',
              isVisible: false,
              items: failures.map((item) =>
                text(
                  `${item.feature} / ${item.name}\n\n${item.failedStep}\n\n${item.error.slice(0, 500)}`,
                ),
              ),
            },
          ]
        : []),
    ],
    actions,
  };
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: card,
      },
    ],
  };
}

export async function publishCard(url, payload, send = fetch) {
  if (new URL(url).protocol !== 'https:')
    throw new Error('The Teams endpoint must use HTTPS.');
  let response;
  try {
    response = await send(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Teams delivery could not reach the configured endpoint.');
  }
  if (!response.ok)
    throw new Error('Teams delivery returned HTTP ' + response.status);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.TEAMS_WEBHOOK_URL) {
    console.log('Teams delivery skipped (no webhook configured).');
  } else {
    const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
    await publishCard(
      process.env.TEAMS_WEBHOOK_URL,
      teamsCard(report, {
        reportUrl: process.env.REPORT_PDF_URL || undefined,
        artifactUrl: process.env.ARTIFACT_URL || report.runUrl,
      }),
    );
    console.log('Teams workflow accepted the card.');
  }
}
