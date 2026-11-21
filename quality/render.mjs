import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  );

function fields(report) {
  const { total, passed, failed, skipped } = report.counts;
  return [
    ['Environment', report.environment],
    ['Run', report.runId],
    ['Started (UTC)', report.startedAt],
    ['Duration', (report.durationMs / 1000).toFixed(1) + ' s'],
    [
      'Scenarios',
      `${total} total / ${passed} passed / ${failed} failed / ${skipped} skipped`,
    ],
  ];
}

export async function renderHtml(report, directory) {
  const byFeature = Map.groupBy(
    report.scenarios,
    (scenario) => scenario.feature,
  );
  const features = [...byFeature]
    .map(
      ([feature, scenarios]) => `
    <section><h2>${escape(feature)}</h2>
    ${scenarios
      .map(
        (item) => `<details ${item.status === 'failed' ? 'open' : ''}>
      <summary><strong>${escape(item.name)}</strong> <span class="${item.status}">${item.status}</span></summary>
      <ol>${item.steps.map((step) => `<li><span>${escape(step.status)}</span> ${escape(step.text)}</li>`).join('')}</ol>
      ${item.error ? `<p><strong>Failed step</strong> ${escape(item.failedStep)}</p><pre>${escape(item.error)}</pre>` : ''}
      ${item.screenshots.map((path) => `<a href="${escape(encodeURI(path))}">Failure screenshot</a>`).join(' ')}
    </details>`,
      )
      .join('')}</section>`,
    )
    .join('');
  const diagnostics =
    report.status === 'FAILED'
      ? '<p>See <a href="cypress.log">Cypress output</a> for browser and runner diagnostics.</p>'
      : '';
  const html = `<!doctype html><html lang="en"><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Relay quality report</title>
  <style>
  *{box-sizing:border-box}body{margin:0;background:#f1f5fa;color:#182844;font:16px/1.55 system-ui}
  main{max-width:900px;margin:auto;padding:2rem 1rem}header,section{background:#fff;border:1px solid #d4dfec;border-radius:12px;padding:1.3rem;margin-bottom:1rem}
  h1,h2{line-height:1.2;margin-block:.3em .8em}dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}dd{margin:0;overflow-wrap:anywhere}dt{font-weight:600}
  details{border-top:1px solid #d4dfec;padding:.75rem 0}summary{cursor:pointer}a{color:#2446ae}span{font-size:.85em}summary span{margin-left:.35rem}
  .passed{color:#14613b}.failed{color:#a02132}.skipped{color:#4a5b72}li span{display:inline-block;min-width:5rem}
  pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5fa;padding:.65rem}
  nav a{display:inline-block;margin-right:.75rem}
  </style>
  <main><header><h1>Relay quality report <span class="${report.status.toLowerCase()}">${report.status}</span></h1>
  <dl>${fields(report)
    .map(([key, value]) => `<dt>${escape(key)}</dt><dd>${escape(value)}</dd>`)
    .join('')}</dl>
  <nav aria-label="Report files"><a href="report.pdf">PDF</a><a href="results.json">JSON</a><a href="teams.json">Teams card</a><a href="analysis.json">Failure analysis</a>
  ${report.scenarios.length ? '<a href="cucumber/index.html">Cucumber report</a>' : ''}</nav>${diagnostics}</header>
  ${features || '<p>No completed scenario results were produced.</p>'}</main></html>`;
  await writeFile(join(directory, 'index.html'), html);
}

export async function renderPdf(report, directory) {
  const pdf = new PDFDocument({
    margin: 52,
    size: 'A4',
    bufferPages: true,
    info: { Title: 'Relay quality report' },
  });
  const stream = createWriteStream(join(directory, 'report.pdf'));
  pdf.pipe(stream);
  pdf
    .fillColor('#182844')
    .font('Helvetica-Bold')
    .fontSize(25)
    .text('Relay quality report');
  pdf
    .fillColor(report.status === 'PASSED' ? '#14613b' : '#a02132')
    .fontSize(14)
    .text(report.status);
  pdf.moveDown(0.7).fillColor('#182844').font('Helvetica').fontSize(11);
  for (const [key, value] of fields(report)) pdf.text(key + ': ' + value);
  if (report.runUrl)
    pdf.moveDown(0.4).text('GitHub Actions run (requires access)', {
      link: report.runUrl,
      underline: true,
    });
  if (!report.scenarios.length)
    pdf
      .moveDown()
      .text('No scenario results. See cypress.log in the run archive.');
  for (const [feature, scenarios] of Map.groupBy(
    report.scenarios,
    (scenario) => scenario.feature,
  )) {
    if (pdf.y > pdf.page.height - 170) pdf.addPage();
    pdf.moveDown(1).fontSize(15).font('Helvetica-Bold').text(feature);
    for (const item of scenarios) {
      if (pdf.y > pdf.page.height - 145) pdf.addPage();
      pdf
        .moveDown(0.6)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(item.name + ' [' + item.status.toUpperCase() + ']');
      pdf.font('Helvetica').fontSize(10);
      for (const step of item.steps)
        pdf.text(step.status.toUpperCase() + '  ' + step.text, { indent: 9 });
      if (item.error) {
        pdf
          .moveDown(0.3)
          .fillColor('#a02132')
          .text('Failed step: ' + item.failedStep);
        pdf.fillColor('#182844').text(item.error);
      }
      for (const screenshot of item.screenshots) {
        if (pdf.y > pdf.page.height - 300) pdf.addPage();
        pdf.moveDown(0.4).text('Failure screenshot');
        pdf.image(join(directory, screenshot), {
          fit: [475, 210],
          align: 'left',
        });
      }
    }
  }
  const { start, count } = pdf.bufferedPageRange();
  for (let page = start; page < start + count; page++) {
    pdf.switchToPage(page);
    const bottom = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    pdf
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#4a5b72')
      .text(`Relay  /  ${page + 1} of ${count}`, 52, pdf.page.height - 36, {
        align: 'right',
        width: pdf.page.width - 104,
      });
    pdf.page.margins.bottom = bottom;
  }
  pdf.end();
  await finished(stream);
}
