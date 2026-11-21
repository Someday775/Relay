# Relay

Relay is a small project and task management application for use as a system under test. It uses Node.js 22+, built-in Node modules, plain HTML/CSS/JavaScript, and a local JSON data file. No dependency installation, external services, or secrets are required.

## Run locally

From the directory containing this README:

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The sign-in form can fill a demo account for you.

| Role | Email | Password | Access |
| --- | --- | --- | --- |
| Standard user | member@relay.test | relay-demo | Create projects and work with tasks in owned or shared projects |
| Collaborator demo | collaborator@relay.test | relay-demo | Starts with no projects and can work in projects shared with them |
| Admin | admin@relay.test | relay-demo | Create projects and work with tasks in any project |

The member starts with **Website refresh** and three tasks, one in each status. The admin sees that project and **Customer onboarding**, which starts with one task. Both roles can create, edit, and change task status within their accessible projects. Owners and admins can manage access. Task assignees must be the project owner or an added collaborator. Removing a collaborator revokes their project access and clears their assignments. Search matches the title and description of tasks in the selected project. Search, status, and assignee filters can be combined.

## Data and tests

Relay writes changes to `.data/workspace.json`. With the server stopped, remove that file and restart to restore the original seed. Set `RELAY_DATA_FILE` to use an independent file, or set `PORT` to change the port. Sessions are held in memory and expire after eight hours or when the server stops.

```sh
npm test
```

The integration tests use ephemeral ports, deterministic seed data, and isolated temporary storage. They cover sign-in, sign-out, access control, project and task mutations, validation, and persistence. To exercise the browser filters manually, sign in as the member, search for **mobile**, then select **Done** and confirm the empty result. Clear the search and confirm **Inventory existing pages** appears.

To enable GitHub Actions, put the contents of this directory at the repository root, including the hidden `.github` directory. The workflow runs the same tests on pushes and pull requests using Node.js 24.

The demo binds to loopback and uses fixed, public credentials. Keep it in a local or isolated test environment.

## Quality engineering demo

Use Node.js 24 LTS for the quality checks. If you have nvm, run `nvm install` and `nvm use` to select the version in `.nvmrc`. If you use another installer, check that `node --version` reports 24.x before running `npm ci`.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

Run a single feature with `npm run test:e2e -- --spec cypress/e2e/features/projects.feature`.
Use `npx cypress open` for interactive debugging. The report-producing command is
`npm run test:e2e`.

### Architecture and coverage

Relay keeps its existing Node HTTP server, plain browser JavaScript and optional JSON file.
The API exposes sign-in, sign-out, a workspace read, project creation, membership changes, and task creation and editing.
HTTP-only session cookies identify users. The server checks project access on reads and
writes, and restricts membership changes to owners and admins. The seeded credentials are public demo fixtures. Use a local or
isolated environment.

Cypress starts the same application on an ephemeral loopback port and confirms readiness.
Before each scenario a Cypress Node task replaces the in-memory store and session map.
Each parallel process gets its own server and data. There is no delete API, so test cleanup
discards the entire store. API setup uses the same login and task endpoints as the UI and
never touches the persistent local file.

Fourteen Gherkin scenarios cover login and logout, invalid credentials, project creation,
member/admin permissions, required fields, task creation and editing, status persistence
after reload, combined filtering, project sharing, assignment, and access revocation. `cypress/api` holds API setup, `cypress/pages` holds
selectors and UI entry points, and step definitions translate feature text into assertions.
Cucumber uses the Badeball preprocessor with esbuild. The lockfile pins the compatible versions.

### Reports and GitHub Actions

Open `reports/<UTC date>/<run ID>/index.html` after a run. It shows the run
summary, features, scenarios, Gherkin steps, and linked failure evidence.
`results.json` is the normalized source for the HTML, optional PDF, CI summary,
Teams notifications, and maintenance tools.

```text
<run>/
  index.html
  results.json
  diagnostics/             # failed or incomplete runs, or verbose capture
    analysis.json          # failed or incomplete runs only
    cypress.log
    failure-dom.ndjson     # when Cypress captures failed UI state
    screenshots/           # when Cypress captures images
```

The default passing archive contains exactly two files. Cucumber JSON is consumed
from temporary storage. The GitHub Actions summary is written directly to the job
summary and Teams cards are generated from results when publishing.

| Setting | Effect |
| --- | --- |
| `RELAY_REPORT_PDF=1` | Generates `report.pdf` and links it from HTML. Required for the optional SharePoint PDF upload. |
| `RELAY_REPORT_VERBOSE=1` | Keeps raw Cucumber JSON under `diagnostics/` when available, and retains logs and any browser evidence even on a successful run. |
| `RELAY_ARCHIVE_TEAMS_CARD=1` | Saves the generated payload as `teams.json` for inspection. The normal publisher works without it. |
| `RELAY_ARTIFACT_RETENTION_DAYS` | Sets GitHub Actions artifact retention to an integer from 1–90 (default 30), subject to the repository or organization limit. Local runs are kept until you remove them. |

Set these as environment variables locally, or as GitHub Actions repository
variables for CI. For example, `RELAY_REPORT_PDF=1 npm run test:e2e` enables
PDF export for one local run.

The workflow archives successful and failed runs. A startup failure can have zero
completed scenarios and still retain the Cypress log and analysis. The runner
preserves Cypress's nonzero exit code. An exit code of zero with missing or invalid
Cucumber results is treated as a reporting failure. Incomplete runs with skipped
scenarios are marked separately in JSON and include diagnostics. Downloading
private GitHub artifacts requires repository access.

**Migration:** Read Gherkin steps from `results.json` or open `index.html`.
`summary.md` and the secondary Cucumber HTML report have been removed.
Use `results.json.artifacts` and scenario screenshot paths to find optional
files. Paths are relative to the archive root. New diagnostic files live under
`diagnostics/`. The maintenance tools also read diagnostics from older archives
that stored those files at the root. SharePoint users should set
`RELAY_REPORT_PDF=1` in GitHub to continue publishing PDFs.

To compare two downloaded or local runs:

```sh
npm run report:compare -- path/to/first/results.json path/to/second/results.json
```

The Cypress runner and report scripts are independent of GitHub Actions. Another CI system
can run the same npm scripts and archive the dated directory printed by the runner.

### Microsoft Teams and report access

The checked-in [passing](examples/sample-passed.json) and [failing](examples/sample-failed.json)
cards use fictional results and example report links. Paste either JSON file into the
[Adaptive Cards Designer](https://adaptivecards.io/designer/) and use Preview mode to try
the failure toggle. The first five failure summaries are always visible, so they remain
available in a client that cannot render the toggle.

To publish, create a Teams **Workflows** webhook that posts an Adaptive Card to a channel
or chat. Set its URL as the GitHub Actions secret `TEAMS_WEBHOOK_URL`. The adapter sends
the Teams message envelope over HTTPS only on trusted main-branch runs. Without a webhook
the publisher skips delivery. Use the sample cards or enable card archiving for local inspection. This configuration uses the Workflows
trigger mode that accepts requests through the secret URL. For tenant-authenticated
triggers use an adapter with the auth method required by your tenant.
See [Teams Workflows webhooks](https://learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook)
and [ToggleVisibility](https://learn.microsoft.com/en-us/adaptive-cards/schema-explorer/action-toggle-visibility).

The default Teams link points at the permissioned GitHub archive. To expose the PDF to
stakeholders who have no GitHub account, configure one of these destinations:

- Set `REPORT_PDF_URL` to an HTTPS PDF URL hosted in storage your intended readers can
  access. A fixed URL refers to the report served by that location.
- Enable PDF export with `RELAY_REPORT_PDF=1`, then configure GitHub variables `SP_TENANT_ID`, `SP_CLIENT_ID`,
  `SP_DRIVE_ID` and secret `SP_CLIENT_SECRET`. Give the Entra application Microsoft
  Graph application permission `Sites.Selected`, obtain admin consent, and grant that
  application write access on the target SharePoint site. Set the drive ID to the target
  document library. Each run uploads a dated PDF and the card links to the returned
  SharePoint URL. Existing SharePoint reader permissions determine who can open it.
  See [selected permissions](https://learn.microsoft.com/en-us/graph/permissions-selected-overview)
  and [Graph file upload](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content).

Teams and SharePoint are optional. No live tenant credentials are needed for local and
CI test runs. The sample cards do not send messages.

### Failure triage

The [controlled maintenance guide](docs/AI_MAINTENANCE.md) explains how to
reproduce three real Cypress failures, inspect an evidence-backed selector patch,
validate it, and approve it explicitly. See the [baseline audit](docs/AI_MAINTENANCE_AUDIT.md)
for the existing tool and integration behavior.

`diagnostics/analysis.json` records failed steps, concise findings, and relative references
to screenshots, logs, DOM evidence, and scenario details in `results.json`. The default classification is
deterministic and works offline. To add model assistance, set `RELAY_MODEL_COMMAND` to an
executable adapter you trust. The adapter reads the triage prompt and evidence on stdin and
writes analysis as plain text on stdout. Run it with the report pipeline or separately:

```sh
node quality/analyze.mjs path/to/results.json
```

The model is optional and advisory. The analyzer neither executes its output nor changes
tests. Use an approved local model or review the diagnostic data before connecting an
external provider. In the absence of an adapter, or if it times out, rules-based findings
remain available.

For an example using a locally running [Ollama](https://docs.ollama.com/api/generate)
server, set `RELAY_OLLAMA_MODEL` to the name of an already installed local model and run:

```sh
RELAY_OLLAMA_MODEL=your-local-model RELAY_MODEL_COMMAND=./quality/ollama.mjs \
  node quality/analyze.mjs path/to/results.json
```

The adapter sends its request to loopback. The core demo and GitHub Actions workflow use
the offline rules unless you configure an adapter.
