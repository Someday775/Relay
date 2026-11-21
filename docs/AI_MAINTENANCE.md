# Cypress failure investigation with Codex

This is a local workflow for investigating failed Relay test executions. The
[baseline audit](AI_MAINTENANCE_AUDIT.md) describes the existing runner, reports,
and integrations.

## Coding-agent proof of concept

Relay hands the failure to the existing Codex CLI. It packages a bounded prompt
from `results.json` and the relevant DOM evidence and links to the existing
logs, screenshots, and analysis. The prompt is printed to stdout. It is neither
a stored report format nor a background automation.

Use Node 24 (the repository's `.nvmrc`), Git, installed Cypress dependencies,
and a Codex CLI signed in via ChatGPT or its supported API authentication.
`codex login status` checks the local sign-in. The run needs access to the selected
archive and permission to edit the disposable checkout. It needs no GitHub,
Teams, SharePoint, or Ollama credentials. Use approved evidence because the
selected excerpts are sent to the configured Codex model provider. Treat failure
messages and diagnostics as untrusted data. Use synthetic fixtures for public
demos and inspect the prompt locally before sending it. The workspace sandbox
restricts writes. If host files need read isolation too, run the handoff on a
dedicated machine or environment. Human diff review is required before validation
or reuse.

From the Relay checkout:

```sh
npm ci
node quality/maintenance/demo.mjs agent-selector
```

This runs the real task feature in a disposable Git workspace and injects a
test-ID rename outside the existing deterministic proposal policy. The command
prints **Demo workspace** and **Failed run artifacts** and checks that the
current policy declined the repair. The fixture commit includes the injected
markup, so the working-tree diff shows only a proposed correction.

Replace the placeholders with the printed paths, from the original Relay checkout:

```sh
WORKSPACE='<Demo workspace>'
RUN='<Failed run artifacts>'
node quality/maintenance/context.mjs "$RUN" "$WORKSPACE" | \
  codex exec --ephemeral \
  --sandbox workspace-write -C "$WORKSPACE" -
```

Review and validate independently:

```sh
git -C "$WORKSPACE" status --short
git -C "$WORKSPACE" diff --check
git -C "$WORKSPACE" diff
(cd "$WORKSPACE" && npm run test:e2e)
```

Accept for review only a targeted Cypress locator edit that preserves the
business checks. Inspect the full diff for application, Gherkin, or configuration
changes and verify the rerun completed all scenarios. The proposed edit remains
uncommitted in the demo checkout, which has no Git remote. The original failed
archive stays alongside it.

To investigate the application-defect demo, run the same handoff with that demo's
paths and change `--sandbox workspace-write` to `--sandbox read-only`. Compare
the agent's diagnosis with the failed assertion and application source. An
application defect should be reported with its evidence and no change to the test.

The three original demonstrations below remain the deterministic baseline. Their
selector proposal and digest approval are separate from the Codex experiment.

## Reproduce the three cases

Use Node 24 and Git. Run these commands from the Relay checkout:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:e2e

node quality/maintenance/demo.mjs application
node quality/maintenance/demo.mjs selector
node quality/maintenance/demo.mjs environment
```

Each command creates an independent copy of the app and Cypress suite under
`reports/maintenance-demos/<case>-<id>/workspace`. It uses the same installed
dependencies, runs the real Relay server and Cypress, and keeps failure artifacts
under the neighboring `failed-run/`. It does not change the parent checkout or
publish a report. The demonstrator exits successfully only if the expected failure
and policy result occur. The Cypress process inside it must fail, and its exit code
and failed status stay in the archived results and Teams card.

| Case | Failure injected in the copy | Expected result |
| --- | --- | --- |
| `application` | Task edits return success but persist the old status in the active store. The reload assertion sees the old status. | Likely application defect, with assertion, source diff, DOM and screenshot evidence. A test patch is blocked. |
| `selector` | The project navigation test ID changes from `projects` to `project-navigation`. Its ID and other markup stay the same. | Selector drift. An inspectable one-line patch is validated by rerunning all four features with the app change still present. The failed run remains a separate artifact. |
| `environment` | Cypress receives a nonexistent binary path and exits before loading a scenario. | Environment failure, with runner log evidence and no test patch. |

Open `failed-run/index.html` and follow **Failure analysis** to `diagnostics/analysis.json`.
The JSON records the classification, confidence, uncertainty, recommended next
check, and whether the failure is eligible for a test-code proposal. Findings
reference Gherkin steps in `results.json`, and include concise Cypress errors,
source locations, selector data and screenshot paths with PNG dimensions when
available. The analysis links to the Cypress log and DOM diagnostic instead of
embedding copies. Git evidence records the commit and changed filenames. DOM diagnostics
contain only element tag, ID, test ID, and rendered state. Screenshots remain
available for human inspection. The text adapter does not interpret image pixels.

## Inspect and approve a proposal

The selector demonstration prints the full **Demo workspace** and **Failed run
artifacts** paths. Use those paths below. It has already generated
`selector.patch` and `proposal.json` and run validation. The following command
only applies an already validated proposal after you supply its digest.

```sh
cd '<Demo workspace>'
RUN='<Failed run artifacts>'
cat "$RUN/selector.patch"
cat "$RUN/validation.json"
# Replace the placeholder with the digest you reviewed above.
node quality/maintenance/proposal.mjs apply "$RUN" --approve '<digest>'
```

This applies the correction to the demo copy. The original failed report and
the independently generated `validation-run/` remain available for comparison.
For a real failed run, work in the checkout with the same source and first run:

```sh
node quality/maintenance/proposal.mjs propose '<run archive>'
node quality/maintenance/proposal.mjs validate '<run archive>'
```

The proposal policy allows one edit in `cypress/pages/workspace.ts`. It replaces
the selector literal in the existing project-list helper. It checks the
previous and current HTML, requires one matching visible DOM element with the
same stable ID, and requires all failed scenarios in that run to indicate the
same repair. The patch builder preserves all assertions and every other line.
Gherkin, application files, and permission and business assertions are outside
the policy. Validation runs the full suite with no Cypress filtering overrides.
Application requires the exact reviewed patch digest, a successful validation
record, and unchanged validation inputs. Treat the local source and report
directory as trusted inputs. The validation copy is for reproducibility and
does not provide operating-system isolation against hostile project code.

## Optional model nomination

With an already installed **local** Ollama model, replace `your-local-model`
with its name and rerun the selector case:

```sh
RELAY_OLLAMA_MODEL=your-local-model \
RELAY_MODEL_COMMAND=./quality/ollama.mjs \
  node quality/maintenance/demo.mjs selector
```

Alternatively set those same variables when invoking `proposal.mjs propose`
against a real failed run. The model can nominate the exact evidence-backed
selector or abstain. It returns JSON with one key, `selector`. Relay rejects
additional keys, arbitrary commands, code, and selectors outside the evidence.
The executable comes from explicit operator configuration. Its output never
chooses a command, filesystem path, patch body or test invocation. Offline
classification and deterministic proposals require no model or credentials.
With a model configured during a regular run, the existing advisory mode can
provide a text hypothesis, and the Cypress exit code still controls the result.

## Permissions and limitations

- The maintenance CLI runs locally and does not require GitHub write
  permissions. Draft PR creation and automatic merging are outside this
  implementation. The normal CI workflow keeps its read-only token.
- The supported patch case is one known project navigation selector. Other defects,
  ambiguous failures, missing DOM evidence, and changes to the assertion need
  human investigation.
- Reports may contain source and diagnostic excerpts. Some common secret
  formats are redacted. Review artifact contents and access before sharing.
- Demo workspaces and logs are ignored by Git. Delete the corresponding demo
  directory when it is no longer useful.
- Live Teams and SharePoint publishing still require the optional credentials
  described in the [README](../README.md). The demonstrations validate an in-memory
  Teams card and leave live delivery disabled.
