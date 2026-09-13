// Copies dist/index.html to dist/404.html so GitHub Pages serves the SPA for deep links.
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log('dist/404.html and dist/.nojekyll created for GitHub Pages');
