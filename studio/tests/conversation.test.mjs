import test from 'node:test';
import assert from 'node:assert/strict';
import {Conversation,validateEndpoint} from '../../v2/conversation.js';
import {BehaviorMap} from '../../v2/behavior.js';

const enc=new TextEncoder(),key='synthetic-test-credential';
const settings={mode:'direct',endpoint:'https://provider.example/v1/chat/completions',model:'fixture',key,trusted:true};
const streamResponse=parts=>new Response(new ReadableStream({start(c){parts.forEach(p=>c.enqueue(typeof p==='string'?enc.encode(p):p));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
const textResponse=text=>streamResponse([`data: ${JSON.stringify({choices:[{delta:{content:text}}]})}\n\ndata: [DONE]\n\n`]);
const configured=(mode='direct')=>{const c=new Conversation();c.configure({...settings,mode});return c;};
async function withFetch(fetch,run){const original=globalThis.fetch;globalThis.fetch=fetch;try{return await run();}finally{globalThis.fetch=original;}}
async function rejectsUnconfigured(c){
 const snapshots=[];
 await assert.rejects(c.stream([],{onText:t=>snapshots.push(t)}),/会话尚未配置/);
 assert.deepEqual(snapshots,[]);
 assert.equal(c.summary.configured,false);
 assert.equal(c.summary.hasKey,false);
 assert.notEqual(c.summary.mode,'mock');
 assert.ok(!JSON.stringify(c.summary).includes(key));
}

test('new conversations are unconfigured; mock is an explicit choice only',async()=>{
 let requests=0;
 await withFetch(()=>{requests++;throw new Error('unexpected network');},async()=>{
  const c=new Conversation();assert.equal(c.summary.mode,'unconfigured');await rejectsUnconfigured(c);
  for(const options of [undefined,null,{}, {mode:''},{mode:'unknown'}]){
   c.configure({mode:'mock'});
   assert.throws(()=>c.configure(options));
   await rejectsUnconfigured(c);
  }
  c.configure({mode:'mock'});
  assert.equal(c.summary.configured,true);
  assert.match(await c.stream([]),/本地 mock 回复/);
 });
 assert.equal(requests,0);
});

test('explicit trust, HTTPS and clean endpoint; credential not in exported summary',()=>{
 for(const endpoint of ['http://provider.example','https://user:pass@provider.example','https://provider.example?key=x','https://provider.example#x','https://localhost/'])assert.throws(()=>validateEndpoint(endpoint));
 const c=configured();assert.equal(JSON.stringify(c.summary).includes(key),false);
 assert.equal(c.summary.mode,'direct');assert.equal(c.summary.configured,true);assert.equal(c.summary.hasKey,true);
});

test('invalid real-provider configuration never keeps old credentials or falls back to mock',async()=>{
 const invalid=[
  {trusted:false},{trusted:'true'},{key:''},{key:'  '},{model:''},{model:'  '},
  {endpoint:''},{endpoint:'http://provider.example/chat'},{endpoint:'not a URL'},
  {endpoint:'https://provider.example/chat?token=x'},{endpoint:'https://provider.example/chat#x'},
  {endpoint:'https://user:pass@provider.example/chat'},
  {model:'x'.repeat(201)},{model:'fixture\n'},{model:key},
  {endpoint:`https://provider.example/${key}`},
  {key:42},{endpoint:null},{model:null},
  {mode:'backend',trusted:false},{mode:'backend',endpoint:'http://own.example/chat'}
 ];
 let requests=0;
 await withFetch(()=>{requests++;throw new Error('unexpected network');},async()=>{
  for(const previous of ['unconfigured','mock','direct','backend']){
   for(const change of invalid){
    const c=new Conversation();
    if(previous==='mock')c.configure({mode:'mock'});
    else if(previous!=='unconfigured')c.configure({...settings,mode:previous});
    assert.throws(()=>c.configure({...settings,...change}),`${previous}: ${JSON.stringify(change)}`);
    assert.equal(c.summary.mode,change.mode || 'direct');
    await rejectsUnconfigured(c);
   }
  }
 });
 assert.equal(requests,0);
});

test('clear revokes readiness and credentials, retaining real settings without enabling mock',async()=>{
 let requests=0;
 await withFetch(()=>{requests++;return textResponse('provider reply');},async()=>{
  for(const mode of ['direct','backend']){
   const c=configured(mode);c.clear();
   assert.deepEqual(c.summary,{mode,endpoint:settings.endpoint,model:settings.model,hasKey:false,configured:false});
   await rejectsUnconfigured(c);
  }
  const c=new Conversation();c.configure({mode:'mock'});c.clear();await rejectsUnconfigured(c);
  c.clear({mode:'direct',endpoint:settings.endpoint,model:settings.model});
  assert.equal(c.summary.mode,'direct');await rejectsUnconfigured(c);
  c.clear({mode:'mock'});await rejectsUnconfigured(c);
  c.clear({mode:'direct',endpoint:'http://invalid.example',model:'fixture'});await rejectsUnconfigured(c);
  c.configure(settings);
  c.clear({mode:'direct',endpoint:`https://provider.example/${key}`,model:key});await rejectsUnconfigured(c);
  assert.equal(requests,0);
  c.configure(settings);assert.equal(await c.stream([]),'provider reply');
 });
 assert.equal(requests,1);
});

test('SSE fragmented CRLF/multibyte and credential echo; exactly chosen endpoint, no proxy/redirect/cookies',async()=>{
 let request;
 const content=['data: {"choices":[{"delta":{"content":"hello 合成 synthetic-test-"}}]}\r\n\r\n','data: {"choices":[{"delta":{"content":"credential done"}}]}\n\n','data: [DONE]\n\n'].join('');
 const bytes=Array.from(enc.encode(content),byte=>new Uint8Array([byte]));
 await withFetch(async(url,opts)=>{request={url,opts};return streamResponse(bytes);},async()=>{
  const snapshots=[],text=await configured().stream([{role:'user',content:'fixture'}],{onText:t=>snapshots.push(t)});
  assert.equal(text,'hello 合成 [credential redacted] done');assert.ok(snapshots.every(t=>!t.includes(key)));
  assert.equal(request.url,settings.endpoint);assert.equal(request.opts.redirect,'error');assert.equal(request.opts.credentials,'omit');assert.equal(request.opts.referrerPolicy,'no-referrer');
  assert.equal(request.opts.headers.Authorization,`Bearer ${key}`);assert.ok(!request.opts.body.includes(key));
 });
});

test('provider, HTTP, CORS and truncated-stream failures stay in real mode with no fallback request or mock text',async()=>{
 const failures=[
  {response:()=>{throw new TypeError(key);},message:/无法直连供应商/},
  {response:()=>new Response(key,{status:401}),message:/供应商 HTTP 401/},
  {response:()=>new Response(key,{status:429}),message:/供应商 HTTP 429/},
  {response:()=>new Response(key,{status:500}),message:/供应商 HTTP 500/},
  {response:()=>new Response(key),message:/需要 text\/event-stream/},
  {response:()=>streamResponse([`data: {"error":{"message":"${key}"}}\n\n`]),message:/供应商返回错误事件/},
  {response:()=>streamResponse(['data: not JSON\n\n']),message:/供应商 SSE JSON 无效/},
  {response:()=>streamResponse(['data: {"choices":[]}\n\n']),message:/供应商流提前结束/},
  {response:()=>{throw new Error(`private failure ${key}`);},message:/供应商连接失败/},
  {response:()=>{throw new Error(`供应商 HTTP leaked https://private.example/${key}`);},message:/供应商连接失败/},
  {response:()=>{throw null;},message:/供应商连接失败/}
 ];
 for(const mode of ['direct','backend']){
  for(const {response,message} of failures){
   const c=configured(mode),snapshots=[],requests=[];
   await withFetch(async(url,opts)=>{requests.push({url,opts});return response();},async()=>{
    for(let attempt=0;attempt<2;attempt++){
     await assert.rejects(c.stream([],{onText:t=>snapshots.push(t)}),error=>message.test(error.message)&&!error.message.includes(key));
     assert.equal(c.summary.mode,mode);assert.equal(c.summary.configured,true);assert.equal(c.summary.hasKey,mode==='direct');
    }
   });
   assert.deepEqual(snapshots,[]);assert.equal(requests.length,2);
   assert.ok(requests.every(r=>r.url===settings.endpoint));
   if(mode==='backend')assert.ok(requests.every(r=>!r.opts.headers.Authorization&&!JSON.stringify(r).includes(key)));
  }
 }
});

test('HTTP 401 can be retried only against the configured provider without switching mode',async()=>{
 const c=configured();let requests=0;
 await withFetch(async()=>++requests===1?new Response('unauthorized',{status:401}):textResponse('real retry reply'),async()=>{
  await assert.rejects(c.stream([]),/供应商 HTTP 401/);
  assert.equal(c.summary.mode,'direct');assert.equal(c.summary.hasKey,true);
  assert.equal(await c.stream([]),'real retry reply');
 });
 assert.equal(requests,2);
});

test('aborting a real request releases the reader, emits no late text, and preserves real configuration',async()=>{
 const c=configured(),controller=new AbortController(),snapshots=[];let body,requests=0,started;
 const ready=new Promise(resolve=>{started=resolve;});
 await withFetch(async()=>{
  requests++;
  body=new ReadableStream({start(stream){controller.signal.addEventListener('abort',()=>stream.error(new DOMException('stop','AbortError')),{once:true});started();}});
  return new Response(body,{headers:{'Content-Type':'text/event-stream'}});
 },async()=>{
  const promise=c.stream([],{signal:controller.signal,onText:t=>snapshots.push(t)});
  await ready;controller.abort();await assert.rejects(promise,{name:'AbortError'});
  assert.equal(body.locked,false);assert.deepEqual(snapshots,[]);
  assert.equal(c.summary.mode,'direct');assert.equal(c.summary.configured,true);assert.equal(c.summary.hasKey,true);
  await assert.rejects(c.stream([],{signal:controller.signal,onText:t=>snapshots.push(t)}),{name:'AbortError'});
  assert.deepEqual(snapshots,[]);
 });
 assert.equal(requests,1);
});

test('clearing during an in-flight request keeps its credential redacted and blocks the next send',async()=>{
 const c=configured();let respond,started;
 const ready=new Promise(resolve=>{started=resolve;});
 await withFetch(()=>new Promise(resolve=>{respond=resolve;started();}),async()=>{
  const snapshots=[],pending=c.stream([],{onText:t=>snapshots.push(t)});
  await ready;c.clear();respond(textResponse(`provider echoed ${key}`));
  assert.equal(await pending,'provider echoed [credential redacted]');
  assert.ok(snapshots.every(t=>!t.includes(key)));
  await rejectsUnconfigured(c);
 });
});

test('explicit mock cancels and never fetches',async()=>{
 let requests=0;
 await withFetch(()=>{requests++;throw new Error('unexpected network');},async()=>{
  const controller=new AbortController(),c=new Conversation();c.configure({mode:'mock'});
  const p=c.stream([],{signal:controller.signal});controller.abort();await assert.rejects(p,{name:'AbortError'});
  assert.equal(c.summary.mode,'mock');assert.match(await c.stream([]),/本地 mock 回复/);
 });
 assert.equal(requests,0);
});

test('behavior requires capabilities and rejects guessed model actions',()=>{
 const calls=[],map=new BehaviorMap({listCapabilities:()=>({motions:[{group:'idle',index:0}],expressions:[{name:'smile'}]}),playMotion:m=>calls.push(m),setExpression:e=>calls.push(e)});
 map.configure({complete:{motion:{group:'idle',index:0},expression:'smile'}});map.apply('complete');assert.equal(calls.length,2);
 map.configure({thinking:{expression:'imagined'}});assert.throws(()=>map.apply('thinking'));assert.throws(()=>map.configure({execute:{shell:'x'}}));
});
