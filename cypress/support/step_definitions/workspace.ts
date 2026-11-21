import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import { createTask, credentials, type Role } from '../../api/relay.js';
import {
  dialog,
  openWorkspace,
  projectList,
  taskList,
  taskRow,
} from '../../pages/workspace.js';

Given('the sign-in page is open', () => {
  cy.visit('/');
  cy.get('#login-form').should('be.visible');
});

When(
  /^the member signs in with (valid credentials|an incorrect password)$/,
  (kind: string) => {
    const member = credentials('member');
    cy.get('#login-form [name=email]').type(member.email);
    cy.get('#login-form [name=password]').type(
      kind === 'valid credentials'
        ? member.password
        : 'incorrect-demo-password',
      { log: false },
    );
    cy.contains('#login-form button', 'Sign in').click();
  },
);
Then('the member workspace is visible', () => {
  cy.get('#workspace').should('be.visible');
  cy.get('#user').should('contain.text', 'Member');
});
When('the member signs out', () => cy.get('#logout').click());
Then(
  'the sign-in page is shown and the workspace requires authentication',
  () => {
    cy.get('#login-form').should('be.visible');
    cy.request({ url: '/api/workspace', failOnStatusCode: false })
      .its('status')
      .should('equal', 401);
  },
);
Then('the sign-in form explains that the credentials are incorrect', () => {
  cy.get('#login-form [role=alert]').should(
    'have.text',
    'Email or password is incorrect.',
  );
  cy.get('#workspace').should('not.be.visible');
});

Given('I am signed in with the {string} role', (role: Role) => {
  cy.signInAs(role);
  openWorkspace();
});
Given(
  'I am signed in with the {string} role with a task called {string}',
  (role: Role, name: string) => {
    cy.signInAs(role);
    createTask(name);
    openWorkspace();
  },
);

function submitNew(kind: 'project' | 'task', title: string) {
  cy.get('#new-' + kind).click();
  dialog().find('[name=title]').type(title);
  dialog().find('#save').click();
}

When('I create a project called {string}', (title: string) =>
  submitNew('project', title),
);
When('I submit a project name with only spaces', () =>
  submitNew('project', '   '),
);
When('I create a task called {string}', (title: string) =>
  submitNew('task', title),
);
When('I submit a task title with only spaces', () => submitNew('task', '   '));
Then('{string} is selected and has no tasks', (title: string) => {
  projectList().find('[aria-current=true]').should('have.text', title);
  cy.get('#empty').should('contain.text', 'No tasks yet.');
});
Then('the editor asks for a project name', () => {
  dialog()
    .find('[role=alert]')
    .should('have.text', 'Project name is required.');
});
Then('the editor asks for a task title', () => {
  dialog().find('[role=alert]').should('have.text', 'Task title is required.');
});
Then('{string} is absent from my projects', (title: string) =>
  projectList().should('not.contain.text', title),
);
Then('a request to update its task is rejected', () =>
  cy
    .request({
      method: 'PATCH',
      url: '/api/tasks/4',
      body: { status: 'Done' },
      failOnStatusCode: false,
    })
    .its('status')
    .should('equal', 404),
);
When('I select {string}', (title: string) =>
  projectList().contains('button', title).click(),
);
Then('I see the task {string}', (title: string) =>
  taskRow(title).should('be.visible'),
);
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
