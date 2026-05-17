const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'package.json');
const dst = path.join(__dirname, '..', 'deploy', 'package.json');

let buf = fs.readFileSync(src);
if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.slice(3);
const pkg = JSON.parse(buf.toString('utf8'));

// Supprimer husky prepare
delete pkg.scripts.prepare;

// Ajouter HUSKY=0 pour être sûr
if (!pkg.scripts.postinstall) {
    // pas de postinstall à modifier
}

fs.writeFileSync(dst, JSON.stringify(pkg, null, 2), 'utf8');
console.log('package.json deploy OK, prepare:', pkg.scripts.prepare || 'SUPPRIME');
