export const statuses = ['To do', 'In progress', 'Done'];

export const accounts = [
  { id: 1, name: 'Alex Morgan', email: 'admin@relay.test', role: 'admin' },
  { id: 2, name: 'Sam Rivera', email: 'member@relay.test', role: 'member' },
  { id: 3, name: 'Jordan Lee', email: 'collaborator@relay.test', role: 'member' }
];

export const demoPassword = 'relay-demo';

export function seed() {
  return {
    projects: [
      { id: 1, name: 'Website refresh', description: 'Update the marketing site ahead of the winter launch.', ownerId: 2 },
      { id: 2, name: 'Customer onboarding', description: 'Help new customers get to their first useful result.', ownerId: 1 }
    ],
    tasks: [
      { id: 1, projectId: 1, title: 'Review homepage copy', description: 'Check messaging against the new positioning.', status: 'In progress' },
      { id: 2, projectId: 1, title: 'Audit mobile navigation', description: 'Review the navigation on narrow screens.', status: 'To do' },
      { id: 3, projectId: 1, title: 'Inventory existing pages', description: 'List pages to keep, consolidate, or archive.', status: 'Done' },
      { id: 4, projectId: 2, title: 'Draft welcome checklist', description: 'Outline the first three steps for new teams.', status: 'To do' }
    ]
  };
}
