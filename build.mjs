import fs from 'node:fs';
import path from 'node:path';
const root=import.meta.dirname;
fs.mkdirSync(path.join(root,'compiled'),{recursive:true});
const content=fs.readFileSync(path.join(root,'frontend','content.json'),'utf8');
const files=['client-ip.js','auth-worker.js','admin-worker.js','cms-validation.js','worker.js'];
fs.writeFileSync(path.join(root,'compiled','worker.mjs'),'const SEED='+content+';\n'+files.map(f=>fs.readFileSync(path.join(root,'backend',f),'utf8')).join('\n'));
console.log('A2B backend built.');
