import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
export const root=import.meta.dirname;
export const dataDir=path.resolve(root,process.env.A2B_DATA_DIR||'data');
if(dataDir===path.join(root,'frontend')||dataDir.startsWith(path.join(root,'frontend')+path.sep))throw Error('The data directory must be outside frontend.');
export function openDatabase(){
 fs.mkdirSync(dataDir,{recursive:true});
 const sqlite=new DatabaseSync(path.join(dataDir,'a2b.sqlite'));
 sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 sqlite.exec('CREATE TABLE IF NOT EXISTS _a2b_migrations (name TEXT PRIMARY KEY NOT NULL)');
 for(const name of fs.readdirSync(path.join(root,'drizzle')).filter(n=>n.endsWith('.sql')).sort()){
  if(sqlite.prepare('SELECT name FROM _a2b_migrations WHERE name=?').get(name))continue;
  sqlite.exec('BEGIN');
  try{sqlite.exec(fs.readFileSync(path.join(root,'drizzle',name),'utf8'));sqlite.prepare('INSERT INTO _a2b_migrations(name) VALUES (?)').run(name);sqlite.exec('COMMIT');}
  catch(e){sqlite.exec('ROLLBACK');throw e;}
 }
 return sqlite;
}
export function databaseBinding(sqlite){return {
 prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(column){const row=sqlite.prepare(sql).get(...this.args);return row?(column?row[column]:row):null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){const result=sqlite.prepare(sql).run(...this.args);return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}};},
 async batch(items){sqlite.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
};}
export function bucketBinding(){
 const dir=path.join(dataDir,'uploads');fs.mkdirSync(dir,{recursive:true});
 function file(key){if(!/^[a-f0-9-]+\.(jpg|png|webp|pdf)$/.test(key))throw Error('Invalid storage key');return path.join(dir,key);}
 return {
  async put(key,bytes,options={}){const p=file(key),body=Buffer.from(bytes);fs.writeFileSync(p,body);fs.writeFileSync(p+'.json',JSON.stringify({contentType:options.httpMetadata?.contentType||'application/octet-stream',etag:createHash('sha256').update(body).digest('hex')}));},
  async get(key){const p=file(key);if(!fs.existsSync(p))return null;const metadata=JSON.parse(fs.readFileSync(p+'.json','utf8'));return {body:Readable.toWeb(fs.createReadStream(p)),httpEtag:'"'+metadata.etag+'"',writeHttpMetadata(headers){headers.set('Content-Type',metadata.contentType);}};}
 };
}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.pdf':'application/pdf'};
export const ASSETS={async fetch(request){
 const url=new URL(request.url);let pathname;
 try{pathname=decodeURIComponent(url.pathname);}catch{return new Response('Invalid path',{status:400});}
 const routes={'/':'index.html','/careers':'careers.html','/start-project':'start-project.html','/account':'account.html','/admin':'admin.html','/admin-login':'admin-login.html'};
 let relative=routes[pathname.replace(/\/$/,'')||'/']||pathname.replace(/^\/+/, '');
 if(relative.includes('\0')||relative.includes('\\')||relative.split('/').includes('..'))return new Response('Not found',{status:404});
 const publicRoot=path.join(root,'frontend'),p=path.resolve(publicRoot,relative);
 if(!p.startsWith(publicRoot+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile())return new Response('Not found',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const headers={'Content-Type':types[path.extname(p)]||'application/octet-stream','Content-Length':String(fs.statSync(p).size),'Cache-Control':path.extname(p)==='.html'?'no-cache':'public,max-age=3600'};
 return new Response(request.method==='HEAD'?null:Readable.toWeb(fs.createReadStream(p)),{headers});
}};
