/**
 * Copy the stable-named Windows installer from desktop/release into public/_downloads/
 * after `npm run desktop:dist:win`.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fileName = 'digitalis-workspace-setup.exe';
const src = path.join(root, 'desktop', 'release', fileName);
// IMPORTANT: do NOT copy into public/downloads/ because that conflicts with the App Router
// download endpoint at /downloads/digitalis-workspace-setup.exe.
const destDir = path.join(root, 'public', '_downloads');
const dest = path.join(destDir, fileName);

if (!fs.existsSync(src)) {
  console.error(`Missing ${src}\nRun from repo root: npm run desktop:dist:win`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied installer to ${path.relative(root, dest)}`);
