import { appendFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function publishPdf(directory, env = process.env, send = fetch) {
  const { SP_TENANT_ID, SP_CLIENT_ID, SP_CLIENT_SECRET, SP_DRIVE_ID } = env;
  if (!SP_DRIVE_ID) return null;

  const report = JSON.parse(
    await readFile(join(directory, 'results.json'), 'utf8'),
  );
  if (report.artifacts && report.artifacts.pdf !== 'report.pdf') return null;
  const pdf = await readFile(join(directory, 'report.pdf'));
  if (!SP_TENANT_ID || !SP_CLIENT_ID || !SP_CLIENT_SECRET)
    throw new Error('SharePoint configuration is incomplete.');

  const safeFetch = async (url, options, operation) => {
    let response;
    try {
      response = await send(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error(operation + ' did not complete.');
    }
    if (!response.ok)
      throw new Error(operation + ' returned HTTP ' + response.status);
    return response.json();
  };

  const credentials = new URLSearchParams({
    client_id: SP_CLIENT_ID,
    client_secret: SP_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const token = await safeFetch(
    `https://login.microsoftonline.com/${encodeURIComponent(SP_TENANT_ID)}/oauth2/v2.0/token`,
    { method: 'POST', body: credentials },
    'SharePoint token request',
  );
  const name = encodeURIComponent(
    `Relay-${report.startedAt.slice(0, 10)}-${report.runId}.pdf`,
  );
  const file = await safeFetch(
    `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(SP_DRIVE_ID)}/root:/${name}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token.access_token,
        'Content-Type': 'application/pdf',
      },
      body: pdf,
    },
    'SharePoint PDF upload',
  );
  if (
    typeof file.webUrl !== 'string' ||
    new URL(file.webUrl).protocol !== 'https:' ||
    /[\r\n]/.test(file.webUrl)
  )
    throw new Error('SharePoint did not return a valid report URL.');
  return file.webUrl;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const url = await publishPdf(process.argv[2]);
  if (!url)
    console.log('SharePoint publishing skipped (drive or PDF unavailable).');
  else if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `pdf_url=${url}\n`);
  else console.log(url);
}
