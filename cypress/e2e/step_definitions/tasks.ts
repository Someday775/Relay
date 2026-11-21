import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import { createTask, type Role } from '../../api/relay.js';
import {
  dialog,
  openWorkspace,
  submitNew,
  taskList,
  taskRow,
} from '../../pages/workspace.js';

Given(
  'I am signed in with the {string} role with a task called {string}',
  (role: Role, name: string) => {
    cy.signInAs(role);
    createTask(name);
    openWorkspace();
  },
);
When('I create a task called {string}', (title: string) =>
  submitNew('task', title),
);
When('I submit a task title with only spaces', () => submitNew('task', '   '));
Then('the editor asks for a task title', () => {
  dialog().find('[role=alert]').should('have.text', 'Task title is required.');
});
Then('{string} is {string}', (title: string, status: string) =>
  taskRow(title).find('select').should('have.value', status),
);
When('I rename {string} to {string}', (original: string, updated: string) => {
  taskRow(original).find('button').click();
  dialog().find('[name=title]').clear().type(updated);
  dialog().find('#save').click();
});
Then('I no longer see {string}', (title: string) =>
  taskList().should('not.contain.text', title),
);
When('I mark {string} as {string}', (title: string, status: string) => {
  taskRow(title).find('select').select(status);
  cy.get('#notice').should('have.text', 'Task status updated.');
});
Then(
  '{string} is still {string} after reload',
  (title: string, status: string) => {
    cy.reload();
    taskRow(title).find('select').should('have.value', status);
  },
);
When('I search for {string}', (query: string) => cy.get('#search').type(query));
When('I filter to {string}', (status: string) =>
  cy.get('#filter').select(status),
);
When('I clear my search', () => cy.get('#search').clear());
Then('only {string} is shown', (title: string) => {
  taskList().find('li').should('have.length', 1).and('contain.text', title);
});
Then('no tasks match', () => {
  cy.get('#empty')
    .should('be.visible')
    .and('have.text', 'No tasks match your filters.');
});
