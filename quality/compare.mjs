import { readFile } from 'node:fs/promises';

const paths = process.argv.slice(2);
if (paths.length !== 2) {
  console.error(
    'Usage: npm run report:compare -- <before/results.json> <after/results.json>',
  );
  process.exitCode = 2;
} else {
  const [before, after] = await Promise.all(
    paths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
  );
  const previous = new Map(
    before.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const current = new Map(
    after.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  console.log(
    `${before.runId} (${before.status}) → ${after.runId} (${after.status})`,
  );
  console.table(
    Object.keys(after.counts).map((metric) => ({
      metric,
      before: before.counts[metric],
      after: after.counts[metric],
      delta: after.counts[metric] - before.counts[metric],
    })),
  );
  for (const id of new Set([...previous.keys(), ...current.keys()])) {
    const original = previous.get(id);
    const latest = current.get(id);
    if (original?.status !== latest?.status) {
      console.log(
        `${latest?.name ?? original.name}: ${original?.status ?? 'absent'} → ${latest?.status ?? 'absent'}`,
      );
    }
  }
}
