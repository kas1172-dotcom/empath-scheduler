const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
test('public host serves only app assets and blocks private APIs by default',async()=>{
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'18765',ENABLE_PRIVATE_API:'',APP_ACCESS_TOKEN:''},stdio:['ignore','pipe','pipe']});
 try {
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Server did not start')),8000);
   child.stdout.once('data',()=>{clearTimeout(timer);resolve();});
   child.once('error',e=>{clearTimeout(timer);reject(e);});
   child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited: '+code));});
  });
  const base='http://127.0.0.1:18765';
  for(const route of ['/','/analytics.js','/operations.js']) assert.equal((await fetch(base+route)).status,200);
  for(const route of ['/server.js','/package.json','/README.md']) assert.equal((await fetch(base+route)).status,404);
  for(const route of ['/api/state','/api/chat','/api/parse-schedule-image']) assert.equal((await fetch(base+route)).status,403);
 } finally {child.kill();}
});
