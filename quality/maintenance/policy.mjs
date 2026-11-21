import { createHash } from 'node:crypto';

export const editableFile = 'cypress/pages/workspace.ts';
export const sourceFile = 'public/index.html';
export const target = 'projects';
export const hash = (value) => createHash('sha256').update(value).digest('hex');

function attribute(line, name, value) {
  const pattern = new RegExp(`(?:^|\\s)${name}="([^"]+)"`);
  const match = line.match(pattern);
  return match && (!value || match[1] === value) ? match[1] : null;
}

// Compare the same project navigation element in two revisions, requiring its stable ID
// and every attribute other than the test selector to match exactly.
export function selectorChange(before, after) {
  const element = (html) =>
    html?.split('\n').filter((line) => attribute(line, 'id', target)) ?? [];
  const previous = element(before);
  const current = element(after);
  if (previous.length !== 1 || current.length !== 1) return null;
  const from = attribute(previous[0], 'data-testid');
  const to = attribute(current[0], 'data-testid');
  if (
    from !== target ||
    !to ||
    from === to ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(to)
  )
    return null;
  if (
    previous[0].replace(`data-testid="${from}"`, `data-testid="${to}"`) !==
    current[0]
  )
    return null;
  return { file: editableFile, from, to };
}

export function applySelector(source, candidate) {
  if (
    candidate?.file !== editableFile ||
    candidate.from !== target ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(candidate.to) ||
    candidate.to === target
  ) {
    throw new Error('Selector replacement is outside the allowlist.');
  }
  const before = `export const projectList = () => byTestId('${target}');`;
  const after = `export const projectList = () => byTestId('${candidate.to}');`;
  if (source.split(before).length !== 2)
    throw new Error('Expected one exact project-list helper.');
  return source.replace(before, after);
}
