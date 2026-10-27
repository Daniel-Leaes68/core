# Runtime network audit

Issue #98 asks for the network inspection demonstrated by Clams with Little
Snitch, integrated into CI. The [Clams FAQ](https://clams.tech/faq/) describes the
same inspection principle as applicable with any traffic inspection tool.
Little Snitch is a macOS desktop tool; this workflow uses Linux `strace` to make
the inspection repeatable on GitHub's hosted Linux runners, without a desktop
license or interactive firewall prompts.

## Run and review

1. Open **Actions → Runtime network audit → Run workflow**, or submit a PR to
   `main`/`develop`. No secrets or wallet setup are required.
2. Read the run's destination table and download **branta-network-audit**.
3. Review `destinations.json`/`.md` (destination IP, port, syscall and count),
   `trace.log` (raw process IDs and syscall results), `application.log` and
   `scenario.json` (proof the application scenario completed).

The runner installs dependencies and builds the production Angular/Electron app
**before** tracing, so package downloads/build traffic are not confused with
application runtime traffic. `strace -f -e trace=network` observes the real main
entry and its descendants, including Electron's separate network-service process.
The script does not trace other runner processes. The X server uses Unix sockets.

The scenario boots the production UI from disk with an empty profile, waits for
Angular to render, puts the public Bitcoin genesis address into a fresh virtual
clipboard, requires Branta's genesis-address label to appear and its history to
round-trip through storage, then observes for five more seconds. Existing user
data is never copied. It does not create,
connect to or use a real wallet. It does not follow external links or submit
transactions. Fresh XDG and Electron user-data directories isolate application
storage; autostart writes remain on the disposable runner. HOME is not changed.
The wrapper refuses to run outside Linux GitHub Actions; do not
run the Electron harness in your personal desktop session.

Hosted CI has no system keyring. The harness selects Electron's documented
`basic_text` storage fallback and explicitly enables it for the disposable
profile containing only the public fixture. This does **not** change production
storage settings and does not test OS-keyring encryption. `scenario.json`
records the selected backend. Never use this test profile for private data.

## Capture validation

Before starting Branta, a separately traced control starts a loopback listener
and connects from a child process. The workflow fails if the parser does not
find that exact destination/port, proving the observer follows descendants.
Parser tests cover IPv4/IPv6, UDP destinations, failed and unfinished calls,
aggregation, Unix IPC exclusion and unknown Internet-address formats. Runtime
timeouts, renderer load failures and missing scenario evidence fail the job.
Reports and logs are uploaded even when the scenario fails.

For local parser-only verification (no Electron, capture or credentials):

```sh
node --test scripts/network-audit/report.test.mjs
```

## Interpretation and limits

This is an observation/review job, **not an egress firewall or allowlist**.
Unexpected destinations are visible for review but do not automatically fail
the job. The table records attempted socket destinations, including calls that
fail, not confirmed HTTP requests or byte counts. It makes no reverse DNS calls.
Unix-domain sockets remain in the raw trace but are omitted from the Internet
destination table. Connected UDP sends may have no destination in a send call;
their initial `connect` identifies the destination. String buffers are truncated
with `-s 0`; this is not a packet-payload archive.

An empty table only means this bounded scenario observed no Internet socket
destinations. It does not prove absence of all network activity, exfiltration,
traffic on other platforms or behavior in untested features. Add distinct
scenarios for future network-dependent features rather than treating this
startup/clipboard scenario as full application coverage.
