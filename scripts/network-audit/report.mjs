import fs from 'node:fs';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

// strace follows the complete Electron process tree, including Chromium's
// network service. No reverse DNS lookups are made while producing the report.
export function summarize(trace) {
  const destinations = new Map();
  for (const line of trace.split('\n')) {
    if (!/\b(connect|sendto|sendmsg|sendmmsg)\(/.test(line)) continue;
    if (!/\bAF_INET6?\b/.test(line)) continue;
    const address = line.match(/inet_addr\("([^"]+)"\)/)?.[1]
      ?? line.match(/inet_pton\(AF_INET6, "([^"]+)"/)?.[1];
    const port = line.match(/sin6?_port=htons\((\d+)\)/)?.[1];
    if (!address || !net.isIP(address) || !port) {
      throw new Error(`Unrecognized Internet destination: ${line}`);
    }
    const operation = line.match(/\b(connect|sendto|sendmsg|sendmmsg)\(/)[1];
    const family = net.isIP(address) === 6 ? 'IPv6' : 'IPv4';
    const key = `${family}|${address}|${port}|${operation}`;
    const entry = destinations.get(key) ?? { family, address, port: Number(port), operation, attempts: 0 };
    entry.attempts++;
    destinations.set(key, entry);
  }
  return [...destinations.values()].sort((a, b) =>
    a.address.localeCompare(b.address) || a.port - b.port || a.operation.localeCompare(b.operation));
}

export function markdown(destinations) {
  return [
    '# Branta runtime network observations',
    '',
    'These are socket destination attempts, including failed attempts, from the traced process tree.',
    'This is an observation report, not an allowlist or a claim that Branta never uses the network.',
    '',
    '| Family | Destination IP | Port | Operation | Attempts |',
    '| --- | --- | --- | --- | --- |',
    ...destinations.map(d => `| ${d.family} | ${d.address} | ${d.port} | ${d.operation} | ${d.attempts} |`),
    ...(destinations.length ? [] : ['| — | No Internet socket destinations observed in this scenario | — | — | — |']),
    '',
    'Review trace.log for process IDs, syscall results and Unix-domain socket activity.',
    'An empty report covers only the exercised scenario and bounded observation window.',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tracePath, outputPath] = process.argv.slice(2);
  if (!tracePath || !outputPath) throw new Error('Usage: node report.mjs TRACE OUTPUT_PREFIX');
  const destinations = summarize(fs.readFileSync(tracePath, 'utf8'));
  fs.writeFileSync(`${outputPath}.json`, `${JSON.stringify(destinations, null, 2)}\n`);
  fs.writeFileSync(`${outputPath}.md`, markdown(destinations));
}
