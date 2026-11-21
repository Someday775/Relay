import { Given, Then, When } from '@badeball/cypress-cucumber-preprocessor';
import {
  byTestId,
  dialog,
  openWorkspace,
  taskRow,
  testId,
} from '../../pages/workspace.js';

const jordanId = 3;

Given('Jordan Lee has been added to Website refresh', () => {
  cy.signInAs('member');
  cy.request('PATCH', '/api/projects/1/members', {
    userId: jordanId,
    member: true,
  })
    .its('status')
    .should('equal', 200);
});

Given('{string} is assigned to Jordan Lee', (title: string) => {
  cy.request<{ tasks: { id: number; title: string }[] }>('/api/workspace').then(
    ({ body }) => {
      const task = body.tasks.find((item) => item.title === title);
      if (!task) throw new Error('Missing task fixture: ' + title);
      cy.request('PATCH', '/api/tasks/' + task.id, { assigneeId: jordanId });
    },
  );
});

When('I open the workspace as its owner', openWorkspace);
When('Jordan opens the workspace', () => {
  cy.signInAs('collaborator');
  openWorkspace();
});
When('I open project access', () => byTestId('manage-access').click());
When('I add Jordan Lee as a collaborator', () => {
  byTestId('access-person').select('Jordan Lee');
  byTestId('add-access').click();
  byTestId('access-member').should('contain.text', 'Jordan Lee');
});
When('I remove Jordan Lee', () => {
  cy.contains(testId('access-member'), 'Jordan Lee')
    .find(testId('remove-access'))
    .click();
  byTestId('access-member').should('not.exist');
});
When('I close project access', () => byTestId('close-access').click());
When('I assign {string} to {string}', (title: string, assignee: string) => {
  taskRow(title).find(testId('task-title')).click();
  byTestId('editor-assignee').select(assignee);
  dialog().find(testId('save')).click();
  taskRow(title).find(testId('task-assignee')).should('have.text', assignee);
});
When('I filter tasks by assignee {string}', (assignee: string) =>
  byTestId('assignee-filter').select(assignee),
);
Then(
  '{string} remains assigned to {string} after reload',
  (title: string, assignee: string) => {
    cy.reload();
    taskRow(title).find(testId('task-assignee')).should('have.text', assignee);
  },
);
Then('{string} is unassigned', (title: string) =>
  taskRow(title)
    .find(testId('task-assignee'))
    .should('have.text', 'Unassigned'),
);
Then('Jordan cannot manage project access', () => {
  byTestId('manage-access').should('not.be.visible');
  cy.request({
    method: 'PATCH',
    url: '/api/projects/1/members',
    body: { userId: jordanId, member: false },
    failOnStatusCode: false,
  })
    .its('status')
    .should('equal', 403);
});
