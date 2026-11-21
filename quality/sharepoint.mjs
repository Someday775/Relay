import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const {
  SP_TENANT_ID,
  SP_CLIENT_ID,
  SP_CLIENT_SECRET,
  SP_DRIVE_ID,
  GITHUB_OUTPUT,
} = process.env;
if (!SP_DRIVE_ID) {
  console.log('SharePoint publishing skipped (no drive configured).');
} else {
  if (!SP_TENANT_ID || !SP_CLIENT_ID || !SP_CLIENT_SECRET)
    throw new Error('SharePoint configuration is incomplete.');
  const safeFetch = async (url, options, operation) => {
    let response;
    try {
      response = await fetch(url, {
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
  const directory = process.argv[2];
  const report = JSON.parse(
    await readFile(join(directory, 'results.json'), 'utf8'),
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
      body: await readFile(join(directory, 'report.pdf')),
    },
    'SharePoint PDF upload',
  );
  if (
    typeof file.webUrl !== 'string' ||
    new URL(file.webUrl).protocol !== 'https:' ||
    /[\r\n]/.test(file.webUrl)
  ) {
    throw new Error('SharePoint did not return a valid report URL.');
  }
  if (GITHUB_OUTPUT)
    await appendFile(GITHUB_OUTPUT, `pdf_url=${file.webUrl}\n`);
  else console.log(file.webUrl);
}
