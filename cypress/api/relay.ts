import { accounts, demoPassword } from '../../seed.js';

export type Role = 'member' | 'admin';
export type DemoAccount = Role | 'collaborator';

export function credentials(accountName: DemoAccount) {
  const account = accounts.find(
    (item) => item.email === accountName + '@relay.test',
  );
  if (!account) throw new Error('Unknown demo account: ' + accountName);
  return { email: account.email, password: demoPassword };
}

export function signIn(
  accountName: DemoAccount,
): Cypress.Chainable<Cypress.Response<unknown>> {
  return cy
    .request<unknown>('POST', '/api/login', credentials(accountName))
    .then((response) => {
      expect(response.status, 'sign-in response').to.equal(200);
    });
}

export function createTask(title: string) {
  return cy
    .request<{ task: { id: number } }>('POST', '/api/tasks', {
      projectId: 1,
      title,
    })
    .its('body.task');
}
