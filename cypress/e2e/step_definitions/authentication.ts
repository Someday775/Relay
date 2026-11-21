import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import { credentials } from '../../api/relay.js';
import { byTestId } from '../../pages/workspace.js';

Given('the sign-in page is open', () => {
  cy.visit('/');
  byTestId('login-form').should('be.visible');
});

When(
  /^the member signs in with (valid credentials|an incorrect password)$/,
  (kind: string) => {
    const member = credentials('member');
    byTestId('login-email').type(member.email);
    byTestId('login-password').type(
      kind === 'valid credentials'
        ? member.password
        : 'incorrect-demo-password',
      { log: false },
    );
    byTestId('login-submit').click();
  },
);
Then('the member workspace is visible', () => {
  byTestId('workspace').should('be.visible');
  byTestId('user').should('contain.text', 'Member');
});
When('the member signs out', () => byTestId('logout').click());
Then(
  'the sign-in page is shown and the workspace requires authentication',
  () => {
    byTestId('login-form').should('be.visible');
    cy.request({ url: '/api/workspace', failOnStatusCode: false })
      .its('status')
      .should('equal', 401);
  },
);
Then('the sign-in form explains that the credentials are incorrect', () => {
  byTestId('login-form')
    .find('[role=alert]')
    .should('have.text', 'Email or password is incorrect.');
  byTestId('workspace').should('not.be.visible');
});
