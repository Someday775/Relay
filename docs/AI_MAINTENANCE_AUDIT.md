# Relay AI maintenance audit

## Starting point

The audit baseline is Relay commit `44b8e3a`. The GitHub Actions run
[44927932155](https://github.com/Someday775/Relay/actions/runs/44927932155)
recorded 14 passing Cypress scenarios and a successful report artifact upload.

| Component | Observed at baseline |
| --- | --- |
| Cypress and Gherkin | Four feature files exercise authentication, project access, tasks, and collaboration. The matching TypeScript steps use Cypress commands. The Node plugin runs the real Relay server on an ephemeral loopback port and resets its in-memory state before every scenario. |
| `quality/run.mjs` | Runs the Cypress CLI, records its exit code before reporting, and writes console logs, Cucumber and normalized JSON, two HTML views, PDF, an execution summary, a Teams payload, and failure analysis. Missing scenario output on a failed startup still produces a failed report. |
| `quality/analyze.mjs` | The offline classifier maps error strings to categories and suggested checks. An opt-in executable receives bounded text and returns advisory prose. Neither path proposes or edits code at baseline. |
| `quality/ollama.mjs` | An actual loopback HTTP adapter. Its earlier smoke test used a mock HTTP server. Real inference requires a running Ollama instance and a locally installed model. |
| Screenshots and diagnostics | Cypress captures failed-run screenshots. The baseline report links matching screenshot filenames. The baseline classifier does not read Cypress console logs, DOM structure, Git history, or source. |
| GitHub Actions | Install, lint, types, Node tests and Cypress run on pushes, PRs and manual dispatch. The artifact step can run after Cypress fails. The workflow token has read-only repository contents access. |
| Teams | Payload generation is exercised by Node tests. The checked-in passing and failing cards contain fictional sample data. Live delivery needs a configured Teams Workflows webhook. A successful step can mean delivery was skipped because the secret was absent. |
| SharePoint | Optional Microsoft Graph PDF upload. It needs an Entra application, a scoped site grant, a target drive, and stored credentials. The baseline CI run and this audit establish no live Teams or SharePoint delivery. |

## Maintenance boundary

The implemented workflow is intentionally limited to a single allowlisted test
file and one proven class of selector drift. The project, task, and permission
assertions remain in the normal Cypress suite. See
[the maintenance guide](AI_MAINTENANCE.md) for the evidence format, commands,
approval gate, and validation limits.
