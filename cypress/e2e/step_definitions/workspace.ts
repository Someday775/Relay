import { Given, Then } from '@badeball/cypress-cucumber-preprocessor';
import type { Role } from '../../api/relay.js';
import { openWorkspace, taskRow } from '../../pages/workspace.js';

Given('I am signed in with the {string} role', (role: Role) => {
  cy.signInAs(role);
  openWorkspace();
});
Then('I see the task {string}', (title: string) =>
  taskRow(title).should('be.visible'),
);
