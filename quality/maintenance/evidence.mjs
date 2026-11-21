import { spawnSync } from 'node:child_process';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { editableFile, selectorChange, sourceFile, target } from './policy.mjs';

const sourcePaths = [
  editableFile,
  sourceFile,
  'public/app.js',
  'server.js',
  ...['authentication', 'collaboration', 'projects', 'tasks', 'workspace'].map(
    (name) => `cypress/e2e/step_definitions/${name}.ts`,
  ),
];
const redact = (value) =>
  value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/(relay_session=)[a-f0-9]+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1[redacted]')
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gi, '$1?[redacted]')
    .replace(/relay-demo/g, '[demo password]');
export const excerpt = (value, max = 2000) =>
  redact(String(value ?? '')).slice(0, max);

function git(root, ...args) {
  const result = spawnSync('git', ['--no-pager', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 3500,
    maxBuffer: 256 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  return result.status === 0 ? result.stdout : null;
}

async function optional(path) {
  return readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
}

async function logTail(path) {
  const file = await open(path, 'r').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!file) return '';
  try {
    const size = (await file.stat()).size;
    const buffer = Buffer.alloc(Math.min(size, 32000));
    await file.read(buffer, 0, buffer.length, size - buffer.length);
    return buffer.toString('utf8');
  } finally {
    await file.close();
  }
}

export async function collectEvidence(directory, root = process.cwd()) {
  const log = directory ? await logTail(join(directory, 'cypress.log')) : '';
  const rawDom = directory
    ? await optional(join(directory, 'failure-dom.ndjson'))
    : '';
  const dom = rawDom.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const html = await optional(join(root, sourceFile));
  const headHtml = git(root, 'show', `HEAD:${sourceFile}`);
  const previousHtml = git(root, 'show', `HEAD^:${sourceFile}`);
  const selector =
    selectorChange(headHtml, html) ?? selectorChange(previousHtml, html);
  const changes = git(
    root,
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--name-only',
    'HEAD',
    '--',
    ...sourcePaths,
  );
  const recentFiles = git(
    root,
    'log',
    '-3',
    '--format=commit %h',
    '--name-only',
    '--',
    ...sourcePaths,
  );
  const diff = git(
    root,
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--unified=1',
    'HEAD',
    '--',
    ...sourcePaths,
  );
  const recentDiff = git(
    root,
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--unified=1',
    'HEAD^',
    'HEAD',
    '--',
    ...sourcePaths,
  );
  const source = await Promise.all(
    sourcePaths.map(async (path) => ({
      path,
      lines: (await optional(join(root, path))).split('\n'),
    })),
  );
  return {
    dom,
    selector,
    source,
    git: {
      head: git(root, 'rev-parse', 'HEAD')?.trim() ?? null,
      changedFiles: excerpt(changes).split('\n').filter(Boolean),
      recentFiles: excerpt(recentFiles, 1600),
      worktreeDiff: excerpt(diff, 3000),
      recentDiff: excerpt(recentDiff, 3000),
    },
    log: excerpt(log.slice(-5000), 5000),
    environmentSignal: excerpt(
      log
        .split('\n')
        .find((line) =>
          /ECONNREFUSED|ENOTFOUND|CYPRESS_RUN_BINARY|could not verify|Cypress.*failed to start|browser.*crash|Relay failed its readiness/i.test(
            line,
          ),
        ),
      400,
    ),
  };
}

async function screenshotEvidence(directory, path) {
  const result = { path, available: false };
  if (
    !directory ||
    !/^screenshots\/[^\\]+\.png$/.test(path) ||
    path.split('/').some((part) => part === '..' || part === '.')
  )
    return result;
  try {
    const root = await realpath(directory);
    const file = await realpath(join(root, path));
    if (
      !file.startsWith(join(root, 'screenshots') + sep) ||
      !(await lstat(file)).isFile()
    )
      return result;
    const stream = await open(file, 'r');
    try {
      const header = Buffer.alloc(24);
      const { bytesRead } = await stream.read(header, 0, header.length, 0);
      if (
        bytesRead !== 24 ||
        header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        header.toString('ascii', 12, 16) !== 'IHDR'
      )
        return result;
      return {
        path,
        available: true,
        width: header.readUInt32BE(16),
        height: header.readUInt32BE(20),
      };
    } finally {
      await stream.close();
    }
  } catch {
    return result;
  }
}

export async function scenarioEvidence(scenario, context, directory) {
  const dom = context.dom.find(
    (item) =>
      item.scenario === scenario.name &&
      item.spec === scenario.uri?.split('/').at(-1),
  );
  const locator =
    scenario.error.match(/\[data-testid=["']([a-z][a-z0-9-]*)["']\]/i)?.[1] ??
    null;
  const needle = (scenario.failedStep ?? '')
    .replace(/^(Given|When|Then|And|But)\s+/, '')
    .replace(/"[^"]*"/g, '{string}');
  const terms = [
    locator,
    needle.length > 8 ? needle : null,
    ...(locator === target ? [target] : []),
  ].filter(Boolean);
  const sources = context.source
    .flatMap(({ path, lines }) => {
      if (!terms.length) return [];
      const index = lines.findIndex((line) =>
        terms.some((term) => line.includes(term)),
      );
      return index < 0
        ? []
        : [
            {
              path,
              line: index + 1,
              excerpt: excerpt(
                lines.slice(Math.max(0, index - 1), index + 2).join('\n'),
                500,
              ),
            },
          ];
    })
    .slice(0, 6);
  const anchors =
    dom?.elements.filter((element) => element.id === target) ?? [];
  const proven =
    locator === target &&
    context.selector &&
    anchors.length === 1 &&
    anchors[0].testId === context.selector.to &&
    anchors[0].visible &&
    dom.elements.filter((item) => item.testId === context.selector.to)
      .length === 1 &&
    !dom.elements.some((item) => item.testId === target);
  return {
    featureFile: scenario.uri ?? null,
    steps: (scenario.steps ?? [])
      .slice(0, 40)
      .map(({ text, status }) => ({ text: excerpt(text, 350), status })),
    assertionError: excerpt(scenario.error),
    selector: locator,
    dom: dom
      ? { captured: true, elements: dom.elements.slice(0, 120) }
      : { captured: false },
    screenshots: await Promise.all(
      (scenario.screenshots ?? [])
        .slice(0, 12)
        .map((path) => screenshotEvidence(directory, path)),
    ),
    sources,
    candidate: proven ? context.selector : null,
  };
}
