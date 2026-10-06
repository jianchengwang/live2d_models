import test from 'node:test';import assert from 'node:assert/strict';
import {Conversation,validateEndpoint} from '../../v2/conversation.js';import {BehaviorMap} from '../../v2/behavior.js';
const enc=new TextEncoder(),key='synthetic-test-credential';
const streamResponse=parts=>new Response(new ReadableStream({start(c){parts.forEach(p=>c.enqueue(enc.encode(p)));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
const direct=()=>{const c=new Conversation();c.configure({mode:'direct',endpoint:'https://provider.example/v1/chat/completions',model:'fixture',key,trusted:true});return c;};
test('explicit trust, HTTPS and clean endpoint; credential not in exported summary',()=>{
 const c=new Conversation();assert.throws(()=>c.configure({mode:'direct',endpoint:'https://provider.example',model:'x',key,trusted:false}));
 for(const endpoint of ['http://provider.example','https://user:pass@provider.example','https://provider.example?key=x','https://provider.example#x','https://localhost/'])assert.throws(()=>validateEndpoint(endpoint));
 const configured=direct();assert.equal(JSON.stringify(configured.summary).includes(key),false);configured.clear();assert.equal(configured.summary.hasKey,false);
});
test('SSE fragmented CRLF/multibyte and credential echo; exactly chosen endpoint, no proxy/redirect/cookies',async()=>{
 const original=globalThis.fetch;let request;
 globalThis.fetch=async(url,opts)=>{request={url,opts};return streamResponse(['data: {"choices":[{"delta":{"content":"hello 合成 synthetic-test-"}}]}\r','\n\r\n','data: {"choices":[{"delta":{"content":"credential done"}}]}\n\n','data: [DONE]\n\n']);};
 try{const snapshots=[],text=await direct().stream([{role:'user',content:'fixture'}],{onText:t=>snapshots.push(t)});
 assert.equal(text,'hello 合成 [credential redacted] done');assert.ok(snapshots.every(t=>!t.includes(key)));assert.equal(request.url,'https://provider.example/v1/chat/completions');assert.equal(request.opts.redirect,'error');assert.equal(request.opts.credentials,'omit');assert.equal(request.opts.referrerPolicy,'no-referrer');assert.equal(request.opts.headers.Authorization,`Bearer ${key}`);assert.ok(!request.opts.body.includes(key));}finally{globalThis.fetch=original;}
});
test('cancel network stream releases reader without late text',async()=>{
 const original=globalThis.fetch;const controller=new AbortController();let cancelled=false;let close;
 globalThis.fetch=async()=>new Response(new ReadableStream({start(c){close=c;controller.signal.addEventListener('abort',()=>c.error(new DOMException('stop','AbortError')));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}});
 try{const promise=direct().stream([],{signal:controller.signal});await new Promise(r=>setTimeout(r,10));controller.abort();await assert.rejects(promise,{name:'AbortError'});assert.equal(close.desiredSize,null);}finally{globalThis.fetch=original;}
});
test('provider errors, CORS and truncated stream surface safe errors without credentials',async()=>{
 const original=globalThis.fetch;
 try{for(const response of [()=>{throw new TypeError(key);},()=>new Response(key,{status:401}),()=>streamResponse([`data: {"error":{"message":"${key}"}}\n\n`]),()=>streamResponse(['data: {"choices":[]}\n\n'])]){globalThis.fetch=async()=>response();await assert.rejects(direct().stream([]),error=>!error.message.includes(key));}}finally{globalThis.fetch=original;}
});
test('mock cancels and never fetches; behavior requires capabilities and rejects guessed model actions',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('unexpected network');};
 try{const controller=new AbortController(),c=new Conversation(),p=c.stream([],{signal:controller.signal});controller.abort();await assert.rejects(p,{name:'AbortError'});assert.match(await c.stream([]),/mock/);}finally{globalThis.fetch=original;}
 const calls=[],map=new BehaviorMap({listCapabilities:()=>({motions:[{group:'idle',index:0}],expressions:[{name:'smile'}]}),playMotion:m=>calls.push(m),setExpression:e=>calls.push(e)});
 map.configure({complete:{motion:{group:'idle',index:0},expression:'smile'}});map.apply('complete');assert.equal(calls.length,2);map.configure({thinking:{expression:'imagined'}});assert.throws(()=>map.apply('thinking'));assert.throws(()=>map.configure({execute:{shell:'x'}}));
});
