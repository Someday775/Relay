export const projectList = () => cy.get('#projects');
export const dialog = () => cy.get('#editor').should('be.visible');
export const taskList = () => cy.get('#tasks');
export const taskRow = (title: string) =>
  cy
    .contains('[data-testid="task-row"] button', title)
    .closest('[data-testid="task-row"]');

export function openWorkspace() {
  cy.visit('/');
  cy.get('#workspace').should('be.visible');
}

export function submitNew(kind: 'project' | 'task', title: string) {
  cy.get('#new-' + kind).click();
  dialog().find('[name=title]').type(title);
  dialog().find('#save').click();
}
