// Build step: checks that each page's stylesheet lists, in @source, every file
// with class names that the page imports.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { FindTailwindSourceProblems } from './lib/check-tailwind-sources.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const LOG_PREFIX = '[check-tailwind-sources]';
// Each page's stylesheet and the entry points whose imports it styles; paths
// are relative to the project root.
const PAGES = [
  {
    name: 'content',
    css_path: 'src/content/content.css',
    entry_paths: ['src/content/index.tsx']
  },
  {
    name: 'popup',
    css_path: 'src/app.css',
    entry_paths: ['src/main.tsx', 'src/theme-init.ts']
  },
  {
    name: 'options',
    css_path: 'src/options/options.css',
    entry_paths: ['src/options/index.tsx', 'src/theme-init.ts']
  }
];

async function IsFile(file_path) {
  try {
    return (await stat(file_path)).isFile();
  } catch {
    return false;
  }
}

const problems = await FindTailwindSourceProblems({
  pages: PAGES,
  root_dir: ROOT_DIR,
  ReadText: file_path => readFile(file_path, 'utf8'),
  IsFile
});

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`${LOG_PREFIX} ${problem}`);
  }

  process.exitCode = 1;
} else {
  console.log(
    `${LOG_PREFIX} Every styled file each page imports is listed in its @source paths.`
  );
}
