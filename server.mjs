import './build.mjs';
import http from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {openDatabase,databaseBinding,bucketBinding,ASSETS} from './storage.mjs';
const {default:worker}=await import('./compiled/worker.mjs');
export const runtimeDatabase=openDatabase();
const sqlite=runtimeDatabase;
const env={...process.env,DB:databaseBinding(sqlite),BUCKET:bucketBinding(),ASSETS};
const port=Number(process.env.PORT||3000),host=process.env.HOST||'0.0.0.0';
const configured=process.env.PUBLIC_URL?new URL(process.env.PUBLIC_URL):null;
if(configured&&!['https:','http:'].includes(configured.protocol))throw Error('PUBLIC_URL must be an HTTP(S) URL.');
export const server=http.createServer(async(req,res)=>{
 try{
  const base=configured?.origin||'http://'+(req.headers.host||'localhost:'+port);
  const url=new URL(req.url,base);
  if(url.origin!==base){res.writeHead(400);res.end('Invalid request');return;}
  let canonical=url.pathname;
  for(let i=0;i<4&&canonical.includes('%');i++){const decoded=decodeURIComponent(canonical);if(decoded===canonical)break;canonical=decoded;}
  if(canonical.includes('%')||canonical.includes('\\')||canonical.includes('\0')||canonical.split('/').includes('..')){res.writeHead(400);res.end('Invalid path');return;}
  url.pathname=canonical.replace(/\/{2,}/g,'/').replace(/\/$/,'')||'/';
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
  headers.set('CF-Connecting-IP',req.socket.remoteAddress||'unknown');
  for(const key of ['oai-authenticated-user-id','oai-authenticated-user-email','x-a2b-relay-ip','x-a2b-relay-signature'])headers.delete(key);
  let body;
  if(!['GET','HEAD'].includes(req.method)){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>27*1024*1024){res.writeHead(413);res.end('Upload too large');return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
  const response=await worker.fetch(new Request(url,{method:req.method,headers,...(body?{body}: {})}),env);
  for(const [key,value]of response.headers)res.setHeader(key,value);
  res.statusCode=response.status;
  if(req.method==='HEAD'||!response.body){res.end();return;}
  await pipeline(Readable.fromWeb(response.body),res);
 }catch(e){console.error('A2B server:',e.message);if(!res.headersSent)res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});res.end('تعذّر إتمام الطلب.');}
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(port,host,()=>console.log('A2B running on port '+server.address().port));
function shutdown(){server.close(()=>{sqlite.close();process.exit(0);});}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
