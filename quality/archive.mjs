import { appendFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyze } from './analyze.mjs';
import { renderHtml, renderPdf } from './render.mjs';
import { normalize, summary } from './results.mjs';
import { teamsCard } from './teams.mjs';

export function reportOptions(env = process.env) {
  const retentionDays = Number(env.RELAY_ARTIFACT_RETENTION_DAYS || 30);
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > 90
  )
    throw new Error(
      'RELAY_ARTIFACT_RETENTION_DAYS must be an integer from 1 to 90.',
    );
  return {
    retentionDays,
    pdf: env.RELAY_REPORT_PDF === '1',
    verbose: env.RELAY_REPORT_VERBOSE === '1',
    archiveCard: env.RELAY_ARCHIVE_TEAMS_CARD === '1',
    modelCommand: env.RELAY_MODEL_COMMAND,
    reportUrl: env.REPORT_PDF_URL,
    summaryPath: env.GITHUB_STEP_SUMMARY,
  };
}

async function cucumberResults(scratch) {
  try {
    const value = JSON.parse(
      await readFile(join(scratch, 'cucumber.json'), 'utf8'),
    );
    if (
      !Array.isArray(value) ||
      value.some(
        (feature) =>
          typeof feature?.uri !== 'string' || !Array.isArray(feature.elements),
      )
    ) {
      throw new Error('Expected Cucumber features with scenario arrays.');
    }
    return { features: value };
  } catch (error) {
    return {
      features: [],
      problem:
        error.code === 'ENOENT'
          ? 'Cucumber output is missing.'
          : 'Cucumber output could not be read.',
    };
  }
}

export async function createArchive(
  scratch,
  directory,
  metadata,
  options = {},
) {
  const { features, problem } = await cucumberResults(scratch);
  const report = normalize(features, metadata, scratch, 'diagnostics');
  report.incomplete = Boolean(
    problem || !report.counts.total || report.counts.skipped,
  );
  if (problem) report.incompleteReason = problem;
  else if (!report.counts.total)
    report.incompleteReason = 'Cucumber emitted no scenarios.';
  else if (report.counts.skipped)
    report.incompleteReason = 'Some scenarios did not complete.';
  report.artifacts = {};
  const errors = [];
  await mkdir(directory, { recursive: true });

  const saveJson = (path, value) =>
    writeFile(join(directory, path), JSON.stringify(value, null, 2) + '\n');
  if (report.status === 'FAILED' || report.incomplete || options.verbose) {
    await mkdir(join(directory, 'diagnostics'), { recursive: true });
    for (const [name, file] of [
      ['log', 'cypress.log'],
      ['dom', 'failure-dom.ndjson'],
      ['screenshots', 'screenshots'],
      ...(options.verbose ? [['cucumber', 'cucumber.json']] : []),
    ]) {
      const path = 'diagnostics/' + file;
      try {
        await cp(join(scratch, file), join(directory, path), {
          recursive: true,
        });
        report.artifacts[name] = path;
      } catch (error) {
        if (error.code !== 'ENOENT') errors.push(error);
      }
    }
  }

  if (report.status === 'FAILED' || report.incomplete) {
    try {
      const analysis = await analyze(report, {
        directory,
        modelCommand: options.modelCommand,
      });
      await saveJson('diagnostics/analysis.json', analysis);
      report.artifacts.analysis = 'diagnostics/analysis.json';
    } catch (error) {
      errors.push(error);
    }
  }
  if (options.pdf) {
    try {
      await renderPdf(report, directory);
      report.artifacts.pdf = 'report.pdf';
    } catch (error) {
      errors.push(error);
    }
  }
  if (options.archiveCard) {
    try {
      await saveJson(
        'teams.json',
        teamsCard(report, {
          reportUrl: options.reportUrl,
          artifactUrl: report.runUrl,
        }),
      );
      report.artifacts.teams = 'teams.json';
    } catch (error) {
      errors.push(error);
    }
  }

  await saveJson('results.json', report);
  await renderHtml(report, directory);
  const markdown = summary(report);
  if (options.summaryPath) await appendFile(options.summaryPath, markdown);
  return { report, markdown, errors };
}
