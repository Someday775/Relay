import './commands.js';

let applicationDocument: Document | undefined;

Cypress.on('window:before:load', (window) => {
  applicationDocument = window.document;
});

beforeEach(() => {
  applicationDocument = undefined;
  cy.task('resetRelay');
});

// Record only selector structure. Keep text, input values, cookies and page HTML out.
afterEach(function () {
  if (this.currentTest?.state !== 'failed' || !applicationDocument) return;
  const elements = [...applicationDocument.querySelectorAll('[data-testid]')]
    .slice(0, 120)
    .map((element) => ({
      id: element.id || null,
      tag: element.tagName.toLowerCase(),
      testId: element.getAttribute('data-testid'),
      visible: element.getClientRects().length > 0,
    }));
  cy.task(
    'recordFailureDom',
    {
      spec: Cypress.spec.name,
      scenario: this.currentTest.title,
      elements,
    },
    { log: false },
  );
});
