import { signIn, type DemoAccount } from '../api/relay.js';

declare global {
  // Cypress exposes its extension points through this global namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      signInAs(account: DemoAccount): Chainable<Response<unknown>>;
    }
  }
}

Cypress.Commands.add('signInAs', signIn);
