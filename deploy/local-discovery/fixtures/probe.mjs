// Local acceptance canary only: no external request, credentials or media payload.
import { Buffer } from 'node:buffer';
import dgram from 'node:dgram';
import http from 'node:http';

const counts = { http: 0, dns: 0 };
http
  .createServer((request, response) => {
    if (request.url === '/stats') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(counts));
      return;
    }
    counts.http += 1;
    response.end('local-acceptance-canary');
  })
  .listen(18080, '0.0.0.0');

const dns = dgram.createSocket('udp4');
dns.on('message', (query, remote) => {
  counts.dns += 1;
  if (query.length < 12) return;
  // The controlled client requests one A record for fixture.test.
  const answer = Buffer.concat([
    query.subarray(0, 2),
    Buffer.from([0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0]),
    query.subarray(12),
    Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4, 127, 0, 0, 1]),
  ]);
  dns.send(answer, remote.port, remote.address);
});
dns.bind(5353, '0.0.0.0');
