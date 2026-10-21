import { spawn } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Local console: copy only the same allowlisted export, never raw host files. */
export async function refreshLocalMonitor(root: string, home: string, sshKey: string) {
  const projector = await readFile(join(root, 'infra/monitor/dashboard_export.py'), 'utf8');
  const child = spawn('ssh', ['-i', sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5',
    'root@47.108.90.19', 'python3 -'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const chunks: Buffer[] = [];
  let size = 0;
  const timeout = setTimeout(() => child.kill(), 15_000);
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 8 * 1024 * 1024) child.kill(); else chunks.push(chunk); });
      child.once('error', reject);
      child.once('close', code => code === 0 && size <= 8 * 1024 * 1024 ? resolve() : reject(new Error('monitor_bridge_unavailable')));
      child.stdin.on('error', () => {});
      child.stdin.end(projector + '\nprint(json.dumps(dashboard("/var/lib/icao-monitor"), allow_nan=False))\n');
    });
    const data = Buffer.concat(chunks).toString('utf8');
    JSON.parse(data);
    const target = join(home, 'monitor-dashboard.json');
    await writeFile(target + '.tmp', data, { mode: 0o600 });
    await rename(target + '.tmp', target);
  } finally { clearTimeout(timeout); }
}
