import test from 'node:test';
import assert from 'node:assert/strict';
import {containTransform,drawableBounds} from '../../v2/fit.js';
import {publicConfig,embedCode,bootstrapJS,buildEmbedPackage,zipFiles} from '../../v2/export.js';
import {loadModelSource,publicUrl,responseBytes} from '../../v2/model-source.js';
import {Conversation} from '../../v2/conversation.js';

const base='https://site.example/nested/',modelUrl=base+'model/model.model3.json',runtimeBase=base;
const raw={modelUrl,runtimeBase,chat:{mode:'direct',endpoint:'https://provider.example/v1/chat/completions',model:'fixture',key:'FAKE_PRIVATE_CANARY'},apiKey:'FAKE_PRIVATE_CANARY',voice:{enabled:false}};
test('contain fits offset mesh bounds in landscape, portrait and resized canvases',()=>{
 const bounds=[-4.81,-6.5,5.14,6.63];
 for(const [w,h] of [[1180,390],[240,400],[140,440],[390,500]]){
  const {scale,tx,ty}=containTransform(bounds,w,h);
  for(const x of [bounds[0],bounds[2]])assert.ok(Math.abs(x*scale+tx)<=.881);
  for(const y of [bounds[1],bounds[3]])assert.ok(Math.abs((y*scale+ty)*w/h)<=.881);
  assert.ok(Math.abs((bounds[0]+bounds[2])/2*scale+tx)<1e-8);
 }
 const a=containTransform(bounds,240,400),b=containTransform(bounds,240,400,{zoom:1.5,x:.1,y:.1});assert.equal(b.scale,a.scale*1.5);assert.ok(b.tx>a.tx);assert.ok(b.ty<a.ty);
 assert.throws(()=>containTransform([0,0,0,0],100,100));
});
test('bounds ignore hidden meshes and use actual vertices rather than canvas guesses',()=>{
 assert.deepEqual(drawableBounds({getDrawableCount:()=>2,getDrawableOpacity:i=>i?0:1,getDrawableVertices:i=>i?[-100,-100,100,100]:[-2,-3,4,5]}),[-2,-3,4,5]);
});
test('exports whitelist public configuration and escape inline script injection',async()=>{
 const config=publicConfig({...raw,title:'</script><img src=x>'},{base});
 assert.ok(!JSON.stringify(config).includes(raw.apiKey));assert.match(embedCode(config,'https://site.example/v2/widget.js'),/\\u003c\/script>/);
 assert.ok(!bootstrapJS(config,'./widget.js').includes(raw.apiKey));
 const packaged=await buildEmbedPackage(raw,{fetchFile:async name=>'// '+name});
 assert.equal(packaged.files.size,20);for(const [path,data] of packaged.files){assert.ok(!path.endsWith('.moc3'));assert.ok(!path.includes('cubismcore'));assert.ok(!String(data).includes(raw.apiKey));}
 assert.equal(JSON.parse(packaged.files.get('config.json')).modelUrl,modelUrl);
 const bytes=new Uint8Array(await packaged.blob.arrayBuffer());assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);assert.equal(new DataView(bytes.buffer).getUint16(12,true),0x21);
 assert.throws(()=>publicConfig({...raw,modelUrl:base+'single.moc3'},{base}));assert.throws(()=>publicConfig({...raw,runtimeBase:base+'runtime.js'},{base}));
 assert.throws(()=>zipFiles(new Map([['../bad.js','x']])));
 await assert.rejects(buildEmbedPackage(raw,{includeLocalModel:true}),/没有本地/);
});
test('source reader requires complete entry and rejects traversal, credentials and oversized transport',async()=>{
 const original=globalThis.fetch;
 const config={Version:3,FileReferences:{Moc:'model.moc3',Textures:['textures/a.png'],Motions:{idle:[{File:'motion/idle.motion3.json'}]},Expressions:[{Name:'smile',File:'smile.exp3.json'}]},Groups:[{Name:'LipSync',Ids:['ParamMouthOpenY']}]};
 try{
  let options;globalThis.fetch=async(url,opts)=>{options=opts;return new Response(JSON.stringify(config));};
  const model=await loadModelSource(modelUrl,{base});assert.equal(model.files.length,4);assert.equal(model.motions[0].group,'idle');assert.equal(model.lipSyncIds[0],'ParamMouthOpenY');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
  config.FileReferences.Textures=['../outside.png'];await assert.rejects(loadModelSource(modelUrl,{base}),/相对路径/);
  globalThis.fetch=async()=>{throw new TypeError('CORS');};await assert.rejects(loadModelSource(modelUrl,{base}),/CORS/);
  globalThis.fetch=async()=>{throw new DOMException('cancel','AbortError');};await assert.rejects(loadModelSource(modelUrl,{base}),{name:'AbortError'});
 }finally{globalThis.fetch=original;}
 for(const url of ['https://secret@site.example/model.model3.json',modelUrl+'?key=x','blob:https://site.example/x','http://127.0.0.1/a'])assert.throws(()=>publicUrl(url,base));
 assert.equal(publicUrl('http://127.0.0.1:8797/a','http://127.0.0.1:8798/b'),'http://127.0.0.1:8797/a');
 await assert.rejects(responseBytes(new Response('12345'),4),/读取上限/);
});
test('own backend transport never receives an Authorization header or supplied key',async()=>{
 const original=globalThis.fetch;let request;
 globalThis.fetch=async(url,opts)=>{request=opts;return new Response('data: {"choices":[{"delta":{"content":"完整回复"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});};
 try{const c=new Conversation();c.configure({mode:'backend',endpoint:'https://own.example/chat',key:raw.apiKey,trusted:true});assert.equal(c.summary.hasKey,false);assert.equal(await c.stream([]),'完整回复');assert.ok(!request.headers.Authorization);assert.ok(!JSON.stringify(request).includes(raw.apiKey));}finally{globalThis.fetch=original;}
});
test('visitor supplied export preserves paths, requires opt-in, and cancels without including repo assets',async()=>{
 const supplied=new Uint8Array([1,2,3,4]),url=URL.createObjectURL(new Blob([supplied]));
 const localPackage={model:{name:'synthetic-export-fixture',entryPath:'nested/test.model3.json',entryUrl:url,files:[{path:'nested/test.bin',url}]}};
 try{
  const packaged=await buildEmbedPackage(raw,{localPackage,includeLocalModel:true,fetchFile:async()=>''});
  assert.equal(packaged.config.modelUrl,'./model/nested/test.model3.json');assert.deepEqual(packaged.files.get('model/nested/test.bin'),supplied);
  assert.deepEqual([...packaged.files.keys()].filter(p=>p.startsWith('model/')),['model/nested/test.model3.json','model/nested/test.bin']);
  const controller=new AbortController();controller.abort();await assert.rejects(buildEmbedPackage(raw,{signal:controller.signal,fetchFile:async()=>''}),{name:'AbortError'});
 }finally{URL.revokeObjectURL(url);}
});
