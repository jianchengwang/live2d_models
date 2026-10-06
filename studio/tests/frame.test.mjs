// Renderer orchestration test doubles only. Real Core acceptance is audited separately.
import test from 'node:test';import assert from 'node:assert/strict';
const origin='https://fixture.test',entryUrl=origin+'/assets/model/a/a.model3.json';
async function scenario({webgl=true,version=2,missingTexture=false,modern=false}={}){
 const events=[],handlers={},requests=[],scripts=[];let rendered=false;
 globalThis.location=new URL(origin+'/v2/frame.html?token=fixture');
 globalThis.parent={postMessage(message){events.push(message);}};
 globalThis.addEventListener=(name,fn)=>{handlers[name]=fn;};
 const bytes=new Uint8Array(64);bytes.set([77,79,67,51,version]);
 const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);new DataView(png.buffer).setUint32(16,2);new DataView(png.buffer).setUint32(20,2);
 const config={Version:3,FileReferences:{Moc:'a.moc3',Textures:['t.png'],Expressions:[{Name:'absent',File:'absent.exp3.json'}],Motions:{idle:[{File:'absent.motion3.json'}]}}};
 globalThis.window={fetch:async(url)=>{url=String(url);requests.push(url);if(url.endsWith('runtime.json'))return Response.json({available:true,...(modern?{modernCoreURL:'https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js',modernCoreIntegrity:'sha384-test'}:{})});if(url===entryUrl)return Response.json(config);if(url.endsWith('a.moc3'))return new Response(bytes);if(url.endsWith('t.png')&&!missingTexture)return new Response(png);return new Response('missing',{status:404});},requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
 globalThis.HTMLImageElement=class{};Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,get(){return this.value;},set(v){this.value=v;}});
 const gl={MAX_TEXTURE_SIZE:3379,getParameter:()=>8192,getExtension:()=>({loseContext(){}})};
 const canvas={width:300,height:400,addEventListener(){}};
 globalThis.document={body:{dataset:{}},head:{append(script){scripts.push(script);queueMicrotask(()=>script.onload());}},getElementById:()=>({}),createElement:name=>name==='canvas'?{getContext:()=>webgl?gl:null}:{},querySelector:()=>rendered?canvas:null};
 globalThis.Live2DCubismCore={Version:{csmGetVersion:()=>67108864,csmGetLatestMocVersion:()=>modern?5:3}};
 const core={getParameterCount:()=>0,getDrawableCount:()=>0,getCanvasWidth:()=>2,getCanvasHeight:()=>3};
 const model={_model:core,update(){},draw(){},getModelMatrix:()=>({getArray:()=>new Float32Array(16)})};
 globalThis.L2dViewer=class{constructor(options){rendered=true;queueMicrotask(options._finishedLoadModel);}getModel(){return model;}};
 await import('../../v2/frame.js?case='+Math.random());
 const files=[['moc','a.moc3'],['texture','t.png'],['expression','absent.exp3.json'],['motion','absent.motion3.json']].map(([kind,ref])=>({kind,path:ref,url:new URL(ref,entryUrl).href}));
 await handlers.message({source:parent,origin,data:{token:'fixture',command:'load',payload:{model:{entryUrl,files,motions:[{group:'idle',index:0,file:'absent.motion3.json'}],expressions:[{name:'absent',file:'absent.exp3.json'}],previewCompatibility:true},dpr:1,width:300,height:400}}});
 await new Promise(resolve=>setImmediate(resolve));
 return {events,rendered,requests,scripts};
}
test('missing optional resource fetches do not abort renderer or hide failure diagnostics',async()=>{
 const result=await scenario();assert.equal(result.rendered,true);assert.ok(!result.events.some(e=>e.type==='error'));
 const loaded=result.events.find(e=>e.type==='loaded').detail;assert.deepEqual(loaded.unavailableExpressions,['absent']);assert.equal(loaded.unavailableMotions.length,1);assert.match(loaded.diagnostics.join('\n'),/404/);
});
test('WebGL unavailability reports GPU/browser cause before the legacy constructor destroys the page',async()=>{
 const result=await scenario({webgl:false});assert.equal(result.rendered,false);assert.match(result.events.find(e=>e.type==='error').detail.message,/WebGL/);
});
test('unsupported real MOC header version fails with exact supported version',async()=>{
 const result=await scenario({version:5});assert.equal(result.rendered,false);assert.match(result.events.find(e=>e.type==='error').detail.message,/版本 5.*版本 3/);
});
test('missing required texture reports path and HTTP status rather than loading a blank character',async()=>{
 const result=await scenario({missingTexture:true});assert.equal(result.rendered,false);assert.match(result.events.find(e=>e.type==='error').detail.message,/t.png.*404/);
});

test('new-format models use the configured official Core and integrity without replacing legacy assets',async()=>{
 const result=await scenario({version:5,modern:true});assert.equal(result.rendered,true);
 assert.equal(result.scripts[0].src,'https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js');
 assert.equal(result.scripts[0].integrity,'sha384-test');assert.equal(result.scripts[0].crossOrigin,'anonymous');
 assert.ok(result.events.some(e=>e.type==='loaded'));
});
