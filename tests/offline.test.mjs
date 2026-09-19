import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../app/sw.js',import.meta.url),'utf8');
function harness({failInstall=false}={}) {
  const listeners={},cached=new Map(),removed=[],requests=[];
  let claimed=false,activated=false;
  const scope='https://example.github.io/chumlog/';
  const prefix=`chumlog:${scope}:`;
  const self={registration:{scope},location:new URL(scope+'sw.js'),clients:{claim:async()=>{claimed=true;}},skipWaiting:()=>{activated=true;},addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const cache={addAll:async urls=>{if(failInstall)throw Error('NETWORK');for(const url of urls)cached.set(url.url,new Response('cached'));},match:async url=>cached.get(url)?.clone()};
  const caches={open:async()=>cache,keys:async()=>[prefix+'old',prefix+'__RELEASE__','other-site-cache'],delete:async key=>removed.push(key)};
  vm.runInNewContext(source,{self,caches,URL,Request,fetch:async request=>{requests.push(request);return new Response('network');}});
  return {listeners,cached,removed,requests,scope,status:()=>({claimed,activated})};
}
async function lifecycle(h,name){let promise;h.listeners[name]({waitUntil:p=>{promise=p;}});await promise;}
async function fetchThrough(h,url,mode='cors'){let response;h.listeners.fetch({request:{url,method:'GET',mode},respondWith:p=>{response=p;}});return response;}
test('service worker installs a complete app under a GitHub Pages subpath',async()=>{
 const h=harness();await lifecycle(h,'install');
 assert.equal(h.cached.size,12);
 assert.ok(h.cached.has(h.scope+'index.html'));
 assert.equal(h.status().activated,false);
 await lifecycle(h,'activate');assert.equal(h.status().claimed,true);
 assert.deepEqual(h.removed,[`chumlog:${h.scope}:old`]);
});
test('cached navigations and modules work without network access',async()=>{
 const h=harness();await lifecycle(h,'install');
 for(const url of [h.scope,h.scope+'?source=homescreen',h.scope+'index.html']) assert.equal(await(await fetchThrough(h,url,'navigate')).text(),'cached');
 assert.equal(await(await fetchThrough(h,h.scope+'app.js')).text(),'cached');
 assert.equal(h.requests.length,0);
 assert.equal(await fetchThrough(h,'https://third-party.example/x'),undefined);
 assert.equal(await fetchThrough(h,'https://example.github.io/other/'),undefined);
});
test('failed installation cannot activate a partial release',async()=>{
 const h=harness({failInstall:true});await assert.rejects(lifecycle(h,'install'),/NETWORK/);
 assert.equal(h.status().activated,false);
 assert.equal(h.removed.length,0);
});
test('updates activate only on the explicit activation message',()=>{
 const h=harness();h.listeners.message({data:{type:'OTHER'}});assert.equal(h.status().activated,false);
 h.listeners.message({data:{type:'ACTIVATE'}});assert.equal(h.status().activated,true);
});
