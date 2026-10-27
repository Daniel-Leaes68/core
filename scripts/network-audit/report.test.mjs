import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdown, summarize } from './report.mjs';

test('collects IPv4, IPv6, UDP and failed attempts from parent and child processes', () => {
  const trace = `
101 connect(3, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("203.0.113.7")}, 16) = -1 EINPROGRESS
102 connect(4, {sa_family=AF_INET6, sin6_port=htons(80), inet_pton(AF_INET6, "2001:db8::1", &sin6_addr)}, 28) = -1 ENETUNREACH
103 sendto(5, ""..., 30, 0, {sa_family=AF_INET, sin_port=htons(53), sin_addr=inet_addr("192.0.2.53")}, 16) = 30
101 connect(3, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("203.0.113.7")}, 16) = 0
104 sendmsg(5, {msg_name={sa_family=AF_INET6, sin6_port=htons(53), inet_pton(AF_INET6, "::1", &sin6_addr)}}, 0) = 20
`;
  const report = summarize(trace);
  assert.equal(report.length, 4);
  assert.equal(report.find(d => d.address === '203.0.113.7').attempts, 2);
  assert.equal(report.find(d => d.address === '192.0.2.53').operation, 'sendto');
  assert.equal(report.find(d => d.address === '2001:db8::1').family, 'IPv6');
  assert.equal(report.find(d => d.address === '::1').operation, 'sendmsg');
});

test('retains destination from an unfinished syscall without double counting its resume', () => {
  assert.deepEqual(summarize(`
123 connect(3, {sa_family=AF_INET, sin_port=htons(1234), sin_addr=inet_addr("127.0.0.1")}, 16 <unfinished ...>
123 <... connect resumed>) = 0
`), [{ family: 'IPv4', address: '127.0.0.1', port: 1234, operation: 'connect', attempts: 1 }]);
});

test('does not mistake local IPC, socket creation or receive calls for destinations', () => {
  assert.deepEqual(summarize(`
1 socket(AF_INET, SOCK_STREAM, IPPROTO_TCP) = 3
1 connect(3, {sa_family=AF_UNIX, sun_path="/tmp/socket"}, 30) = 0
1 recvfrom(3, "data", 4, 0, {sa_family=AF_INET, sin_port=htons(80), sin_addr=inet_addr("192.0.2.1")}, [16]) = 4
`), []);
});

test('fails closed on unrecognized Internet destinations instead of silently omitting them', () => {
  assert.throws(() => summarize('1 connect(3, {sa_family=AF_INET, sin_port=htons(443), sin_addr=NEW_FORMAT}, 16) = 0'), /Unrecognized/);
});

test('empty observation report explicitly limits the privacy claim', () => {
  assert.match(markdown([]), /only the exercised scenario/);
  assert.match(markdown([]), /not an allowlist/);
  assert.match(markdown(summarize('1 connect(3, {sa_family=AF_INET, sin_port=htons(80), sin_addr=inet_addr("192.0.2.1")}, 16) = 0')), /192.0.2.1/);
});
