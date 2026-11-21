import { When, Then } from '@badeball/cypress-cucumber-preprocessor';
import {
  byTestId,
  dialog,
  exactText,
  projectList,
  submitNew,
  testId,
} from '../../pages/workspace.js';

When('I create a project called {string}', (title: string) =>
  submitNew('project', title),
);
When('I submit a project name with only spaces', () =>
  submitNew('project', '   '),
);
Then('{string} is selected and has no tasks', (title: string) => {
  projectList()
    .find(testId('project-item') + '[aria-current=true]')
    .should('have.text', title);
  byTestId('empty').should('contain.text', 'No tasks yet.');
});
Then('the editor asks for a project name', () => {
  dialog()
    .find('[role=alert]')
    .should('have.text', 'Project name is required.');
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
  projectList().contains(testId('project-item'), exactText(title)).click(),
);
