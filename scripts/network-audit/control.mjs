import net from 'node:net';
import { spawn } from 'node:child_process';

// A real child-process connection proves strace -f sees descendants. It never
// leaves loopback, and uses no wallets, public services or credentials.
const server = net.createServer(socket => socket.end());
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  console.log(`CONTROL_PORT=${port}`);
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `import net from 'node:net'; const s = net.connect(${port}, '127.0.0.1'); s.on('error', () => process.exit(1)); s.on('end', () => s.end());`], { stdio: 'inherit' });
  child.on('error', () => process.exit(1));
  child.on('exit', code => server.close(() => process.exit(code ?? 1)));
});
setTimeout(() => process.exit(1), 10000).unref();
