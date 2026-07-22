/**
 * Copy branded icons into desktop/build/ before electron-builder runs.
 * Uses the same PWA assets as the web app so the installer matches site branding.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'desktop', 'build');

const copies = [
  [path.join(root, 'public', 'icons', 'pwa-512.png'), path.join(buildDir, 'icon.png')],
];

fs.mkdirSync(buildDir, { recursive: true });

for (const [src, dest] of copies) {
  if (!fs.existsSync(src)) {
    console.error(`Missing icon source: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log(`Prepared ${path.relative(root, dest)}`);
}
