import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const output = new URL('../.next/standalone/apps/web/', import.meta.url);
await mkdir(new URL('.next/', output), { recursive: true });
await cp(new URL('../.next/static', import.meta.url), new URL('.next/static', output), {
  recursive: true,
});
const publicDirectory = new URL('../public', import.meta.url);
if (existsSync(publicDirectory))
  await cp(publicDirectory, new URL('public', output), { recursive: true });
