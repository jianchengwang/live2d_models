import test from 'node:test';import assert from 'node:assert/strict';
globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;
globalThis.location=new URL(import.meta.url);globalThis.devicePixelRatio=1;
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
document.createElement=()=>({contentWindow:{postMessage(){}},setAttribute(){},remove(){this.removed=true;}});
const {Live2DViewer}=await import('../../v2/sdk.js');
const model={id:'m',format:'moc3',entryUrl:new URL('../../assets/model/moc3/a/a.model3.json',import.meta.url).href,validation:{referencesComplete:true},motions:[{group:'',index:0}],expressions:[]};
const make=()=>new Live2DViewer({replaceChildren(){}});
test('load signal abort rejects and removes renderer frame',async()=>{
 const viewer=make(),controller=new AbortController(),promise=viewer.load(model,{signal:controller.signal});
 const frame=viewer.frame;controller.abort();await assert.rejects(promise,{name:'AbortError'});assert.equal(frame.removed,true);assert.equal(viewer.frame,null);viewer.destroy();
});
test('stale or foreign messages cannot resolve a load',async()=>{
 const viewer=make(),promise=viewer.load(model);
 viewer.receive({origin:'https://evil.example',source:viewer.frame.contentWindow,data:{token:viewer.token,type:'loaded',detail:{}}});
 assert.ok(viewer.pending);
 viewer.receive({origin:location.origin,source:{},data:{token:viewer.token,type:'loaded',detail:{}}});assert.ok(viewer.pending);
 viewer.receive({origin:location.origin,source:viewer.frame.contentWindow,data:{token:viewer.token,type:'loaded',detail:{coreAcceptance:'accepted'}}});
 assert.equal((await promise).coreAcceptance,'accepted');viewer.destroy();
});
test('switching cancels pending model and destroy is idempotent',async()=>{
 const viewer=make(),first=viewer.load(model);const failed=assert.rejects(first,{name:'AbortError'});
 const second=viewer.load({...model,id:'b'});viewer.destroy();await failed;await assert.rejects(second,{name:'AbortError'});viewer.destroy();
 await assert.rejects(viewer.load(model),/destroyed/);
});
test('rejects external or incomplete models and unknown actions',async()=>{
 const viewer=make();await assert.rejects(viewer.load({...model,entryUrl:'https://evil.example/model.model3.json'}),/本地/);
 await assert.rejects(viewer.load({...model,validation:{referencesComplete:false}}),/依赖/);
 assert.throws(()=>viewer.playMotion({group:'unknown',index:0}));viewer.destroy();
});

test('timeout releases frame and all observers are destroyed',async()=>{const viewer=make(),p=viewer.load(model,{timeoutMs:1}),frame=viewer.frame;await assert.rejects(p,/超时/);assert.equal(frame.removed,true);assert.equal(viewer.pending,null);viewer.destroy();assert.equal(viewer.model,null);});
