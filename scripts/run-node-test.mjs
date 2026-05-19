import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length === 0) {
  process.exit(0);
}

const candidates = [
  process.env.NODE_TEST_BINARY,
  process.execPath,
  '/opt/homebrew/bin/node',
  '/usr/local/bin/node',
  '/usr/bin/node',
].filter(Boolean);

for (const candidate of candidates) {
  if (!existsSync(candidate)) continue;

  const version = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
  if (version.error || /bun/i.test(`${candidate}\n${version.stdout}${version.stderr}`)) continue;

  const result = spawnSync(candidate, ['--test', ...args], { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

console.error('Could not find a real Node.js binary for node:test. Set NODE_TEST_BINARY to one explicitly.');
process.exit(1);
