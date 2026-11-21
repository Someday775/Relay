import { accounts, demoPassword } from '../../seed.js';

export type Role = 'member' | 'admin';

export function credentials(role: Role) {
  const account = accounts.find((item) => item.role === role);
  if (!account) throw new Error('Unknown demo role: ' + role);
  return { email: account.email, password: demoPassword };
}

export function signIn(
  role: Role,
): Cypress.Chainable<Cypress.Response<unknown>> {
  return cy
    .request<unknown>('POST', '/api/login', credentials(role))
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
