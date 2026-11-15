// Disposable Torznab fixture: synthetic metadata only, never a media payload.
import http from 'node:http';
import { argv } from 'node:process';
import { URL } from 'node:url';
const instance = argv[2] ?? 'fixture';

let unavailable = false;
let searches = 0;
let attempts = 0;
const caps = `<?xml version="1.0" encoding="UTF-8"?><caps><server version="1.0" title="Local fixture"/><limits max="100" default="100"/><searching><search available="yes" supportedParams="q"/><movie-search available="yes" supportedParams="q,imdbid,tmdbid"/></searching><categories><category id="2000" name="Movies"/></categories></caps>`;
http
  .createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture.invalid');
    if (url.pathname === '/fail' && request.method === 'POST') {
      unavailable = true;
      response.end('fixture unavailable');
      return;
    }
    if (url.pathname === '/stats') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ searches, attempts, unavailable }));
      return;
    }
    if (url.pathname !== '/api') {
      response.writeHead(410);
      response.end('no downloadable payload');
      return;
    }
    attempts += 1;
    if (unavailable) {
      response.writeHead(503);
      response.end('synthetic outage');
      return;
    }
    response.setHeader('Content-Type', 'application/xml');
    if (url.searchParams.get('t') === 'caps') {
      response.end(caps);
      return;
    }
    searches += 1;
    response.end(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:torznab="http://torznab.com/schemas/2015/feed"><channel><title>Local fixture</title><description>Synthetic acceptance only</description><link>http://fixture.invalid/</link><item><title>Fixture.Movie.2000.1080p.WEB-DL.Source${instance}</title><guid isPermaLink="false">local-fixture-release-${instance}</guid><pubDate>Sat, 14 Nov 2026 12:00:00 GMT</pubDate><size>1048576</size><category>2000</category><enclosure url="http://${request.headers.host}/no-payload" length="1048576" type="application/x-bittorrent"/><torznab:attr name="category" value="2000"/><torznab:attr name="seeders" value="5"/><torznab:attr name="peers" value="10"/><torznab:attr name="downloadvolumefactor" value="1"/><torznab:attr name="uploadvolumefactor" value="1"/></item></channel></rss>`,
    );
  })
  .listen(19090, '0.0.0.0');
