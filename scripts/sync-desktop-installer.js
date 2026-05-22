/**
 * Copy stable-named installers from desktop/release into public/_downloads/
 * after `npm run desktop:dist:win` and/or `npm run desktop:dist:mac`.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const destDir = path.join(root, 'public', '_downloads');

/** @type {{ fileName: string, required: boolean, buildHint: string }[]} */
const installers = [
  {
    fileName: 'digitalis-workspace-setup.exe',
    required: true,
    buildHint: 'npm run desktop:dist:win',
  },
  {
    fileName: 'digitalis-workspace-setup.dmg',
    required: false,
    buildHint: 'npm run desktop:dist:mac (on macOS)',
  },
];

let copied = 0;
let failed = false;

fs.mkdirSync(destDir, { recursive: true });

for (const { fileName, required, buildHint } of installers) {
  const src = path.join(root, 'desktop', 'release', fileName);
  const dest = path.join(destDir, fileName);
  if (!fs.existsSync(src)) {
    if (required) {
      console.error(`Missing ${src}\nRun from repo root: ${buildHint}`);
      failed = true;
    } else {
      console.warn(`Skipped ${fileName} (not built). Run: ${buildHint}`);
    }
    continue;
  }
  fs.copyFileSync(src, dest);
  console.log(`Copied installer to ${path.relative(root, dest)}`);
  copied += 1;
}

if (failed) process.exit(1);
if (copied === 0) {
  console.error('No installers copied.');
  process.exit(1);
}
