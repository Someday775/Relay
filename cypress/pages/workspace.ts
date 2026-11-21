export const testId = (name: string) => `[data-testid="${name}"]`;
export const byTestId = (name: string) => cy.get(testId(name));
export const exactText = (text: string) =>
  new RegExp('^' + Cypress._.escapeRegExp(text) + '$');

export const projectList = () => byTestId('projects');
export const dialog = () => byTestId('editor');
export const taskList = () => byTestId('tasks');
export const taskRow = (title: string) =>
  taskList()
    .contains(testId('task-title'), exactText(title))
    .closest(testId('task-row'));

export function openWorkspace() {
  cy.visit('/');
  byTestId('workspace').should('be.visible');
}

export function submitNew(kind: 'project' | 'task', title: string) {
  byTestId('new-' + kind).click();
  dialog().find(testId('editor-title-input')).type(title);
  dialog().find(testId('save')).click();
}
