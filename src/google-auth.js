// Einmalig ausführen: npm run google-auth  -> gibt den GOOGLE_REFRESH_TOKEN aus
import http from 'node:http';

const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.error('Bitte GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET in .env eintragen.'); process.exit(1); }

const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}/oauth2callback`;
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: id, redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent',
  scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks',
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== '/oauth2callback') { res.writeHead(404).end(); return; }
  const code = u.searchParams.get('code');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const j = await r.json();
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  if (j.refresh_token) {
    res.end('Fertig! Du kannst dieses Fenster schließen und ins Terminal schauen.');
    console.log('\nTrage in .env ein:\nGOOGLE_REFRESH_TOKEN=' + j.refresh_token + '\n');
  } else {
    res.end('Fehler, siehe Terminal.');
    console.error('Kein Refresh Token erhalten:', j);
  }
  server.close();
});
server.listen(PORT, '127.0.0.1', () => console.log('Öffne diese URL im Browser und erlaube den Zugriff:\n\n' + url + '\n'));
