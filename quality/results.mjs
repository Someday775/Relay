import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function files(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function normalize(
  features,
  metadata,
  directory,
  screenshotPrefix = '',
) {
  const screenshots = files(join(directory, 'screenshots'));
  const scenarios = features.flatMap((feature) =>
    (feature.elements ?? [])
      .filter((element) => element.type === 'scenario')
      .map((scenario) => {
        const steps = (scenario.steps ?? [])
          .filter((step) => !step.hidden)
          .map((step) => ({
            text: (step.keyword ?? '') + (step.name ?? ''),
            status: step.result?.status ?? 'skipped',
            error: step.result?.error_message ?? '',
          }));
        const results = [
          ...(scenario.before ?? []),
          ...(scenario.steps ?? []),
          ...(scenario.after ?? []),
        ];
        const failure = results.find((step) =>
          ['failed', 'undefined', 'pending', 'ambiguous', 'unknown'].includes(
            step.result?.status,
          ),
        );
        const status = failure
          ? 'failed'
          : results.length &&
              results.every((step) => step.result?.status === 'passed')
            ? 'passed'
            : 'skipped';
        return {
          id: feature.uri + ':' + (scenario.id ?? scenario.name),
          feature: feature.name,
          uri: feature.uri,
          name: scenario.name,
          status,
          steps,
          failedStep: failure
            ? ((failure.keyword ?? '') + (failure.name ?? '')).trim() ||
              'Scenario hook'
            : '',
          error: failure?.result.error_message ?? failure?.result.status ?? '',
          screenshots: screenshots
            .filter(
              (path) =>
                path.endsWith('.png') &&
                path.includes(feature.uri.split('/').at(-1)) &&
                path.includes(scenario.name),
            )
            .map((path) =>
              [screenshotPrefix, relative(directory, path).split(sep).join('/')]
                .filter(Boolean)
                .join('/'),
            ),
        };
      }),
  );
  const counts = { total: scenarios.length, passed: 0, failed: 0, skipped: 0 };
  for (const scenario of scenarios) counts[scenario.status]++;
  return {
    project: 'Relay',
    ...metadata,
    status:
      metadata.exitCode || counts.failed || !counts.total ? 'FAILED' : 'PASSED',
    counts,
    scenarios,
  };
}

export function summary(report) {
  const { counts } = report;
  return `# Relay quality report · ${report.status}

- Environment: ${report.environment}
- Run: ${report.runId}
- Started: ${report.startedAt} (UTC)
- Duration: ${(report.durationMs / 1000).toFixed(1)} s
- Scenarios: ${counts.total} total · ${counts.passed} passed · ${counts.failed} failed · ${counts.skipped} skipped

Download the run artifact and open \`index.html\` for Gherkin steps and diagnostics.
`;
}
