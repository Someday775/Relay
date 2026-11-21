import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';
import { credentials } from '../../api/relay.js';

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
