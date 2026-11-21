# Relay

Relay is a small project and task management application for use as a system under test. It uses Node.js 22+, built-in Node modules, plain HTML/CSS/JavaScript, and a local JSON data file. No dependency installation, external services, or secrets are required.

## Run locally

From the directory containing this README:

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The sign-in form can fill either demo account for you.

| Role | Email | Password | Access |
| --- | --- | --- | --- |
| Standard user | member@relay.test | relay-demo | Create projects and work with tasks in projects they own |
| Admin | admin@relay.test | relay-demo | Create projects and work with tasks in any project |

The member starts with **Website refresh** and three tasks, one in each status. The admin sees that project and **Customer onboarding**, which starts with one task. Both roles can create, edit, and change task status within their accessible projects. Search matches the title and description of tasks in the selected project. Search and the status filter can be combined.

## Data and tests

Relay writes changes to `.data/workspace.json`. With the server stopped, remove that file and restart to restore the original seed. Set `RELAY_DATA_FILE` to use an independent file, or set `PORT` to change the port. Sessions are held in memory and expire after eight hours or when the server stops.

```sh
npm test
```

The integration tests use ephemeral ports, deterministic seed data, and isolated temporary storage. They cover sign-in, sign-out, access control, project and task mutations, validation, and persistence. To exercise the browser filters manually, sign in as the member, search for **mobile**, then select **Done** and confirm the empty result. Clear the search and confirm **Inventory existing pages** appears.

To enable GitHub Actions, put the contents of this directory at the repository root, including the hidden `.github` directory. The workflow runs the same tests on pushes and pull requests using Node.js 22.

The demo binds to loopback and uses fixed, public credentials. Keep it in a local or isolated test environment.
