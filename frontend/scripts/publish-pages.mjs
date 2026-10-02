import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(frontend, '..');
const build = spawnSync('npm', ['run', 'build'], {
  cwd: frontend, stdio: 'inherit', env: { ...process.env, VITE_PAGES: 'true' },
});
if (build.status !== 0) process.exit(build.status ?? 1);
const html = await readFile(resolve(frontend, 'dist/index.html'), 'utf8');
if (!html.includes('/sankofa/assets/') || html.includes('/src/main.tsx')) {
  throw new Error('Expected compiled GitHub Pages assets');
}
await mkdir(resolve(repository, 'assets'), { recursive: true });
await cp(resolve(frontend, 'dist/assets'), resolve(repository, 'assets'), { recursive: true });
await writeFile(resolve(repository, 'index.html'), html);
await writeFile(resolve(repository, '.nojekyll'), '');
console.log('Prepared repository root index.html and assets for branch-based GitHub Pages.');
