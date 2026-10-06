import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {declaredResource,mocVersion,assertCoreVersion,prepareModelConfig,selectCoreURL,validateOptionalData} from '../../v2/model-compatibility.js';
const base='https://example.test/assets/model/character/';
const model={entryUrl:base+'a.model3.json',files:['a.moc3','tex.png','smile.exp3.json','good.motion3.json','bad.motion3.json'].map(ref=>({url:base+ref,path:'assets/model/character/'+ref})),motions:[{group:'idle',index:0,file:'good.motion3.json'},{group:'idle',index:1,file:'bad.motion3.json'}],previewCompatibility:true};
const config={Version:3,FileReferences:{Moc:'a.moc3',Textures:['tex.png'],Expressions:[{Name:'smile',File:'smile.exp3.json'},{Name:'missing',File:'missing.exp3.json'}],Motions:{idle:[{File:'good.motion3.json'},{File:'bad.motion3.json'}]}}};
const validMotion={Version:3,Meta:{Duration:1,CurveCount:0,TotalSegmentCount:0,TotalPointCount:0},Curves:[]};
test('runtime routing preserves legacy bytes and refuses arbitrary third-party Core hosts',()=>{
 const root='https://example.test/live2d_models/';
 assert.equal(selectCoreURL({},root,2),root+'assets/js/lib/live2dcubismcore.min.js');
 assert.equal(selectCoreURL({modernCoreURL:'v2/licensed-runtime/core.js'},root,4),root+'v2/licensed-runtime/core.js');
 assert.equal(selectCoreURL({modernCoreURL:'https://cubism.live2d.com/verified-version/core.js'},root,5),'https://cubism.live2d.com/verified-version/core.js');
 for(const url of ['https://evil.test/core.js','https://token@cubism.live2d.com/core.js','https://cubism.live2d.com/core.js?key=x'])assert.throws(()=>selectCoreURL({modernCoreURL:url},root,5),/官方/);
});
test('missing optional expressions and invalid motions preserve character; indexes never drift',async()=>{
 const before=JSON.stringify(config);
 const result=await prepareModelConfig(config,model,async file=>file.url.endsWith('smile.exp3.json')?{Parameters:[]}:file.url.endsWith('bad.motion3.json')?{}:validMotion);
 assert.equal(JSON.stringify(config),before);assert.deepEqual(result.config.FileReferences.Expressions,[config.FileReferences.Expressions[0]]);
 assert.deepEqual(result.unavailableExpressions,['missing']);assert.deepEqual(result.unavailableMotions,model.motions);assert.deepEqual(result.config.FileReferences.Motions,{});
 assert.match(result.diagnostics.join('\n'),/missing.exp3.json/);
});
test('mandatory files still fail; no suffix matching, parent traversal or external request',async()=>{
 assert.throws(()=>declaredResource('../other/a.moc3',model),/路径/);
 assert.throws(()=>declaredResource('https://evil.test/a.moc3',model),/路径/);
 assert.throws(()=>declaredResource('missing/a.moc3',model),/声明/);
 await assert.rejects(prepareModelConfig({...config,FileReferences:{Moc:'missing.moc3',Textures:['tex.png']}},model,async()=>({})),/missing.moc3/);
});
test('optional preflight abort remains cancellation',async()=>{
 await assert.rejects(prepareModelConfig(config,model,async()=>{throw new DOMException('cancel','AbortError');}),{name:'AbortError'});
});
test('MOC3 header version is compared against actual Core capability',()=>{
 assert.throws(()=>mocVersion(new Uint8Array(64)),/文件头/);
 const bytes=new Uint8Array(64);bytes.set([77,79,67,51,5]);assert.equal(mocVersion(bytes),5);
 const core={Version:{csmGetLatestMocVersion:()=>3,csmGetVersion:()=>67108864}};
 assert.throws(()=>assertCoreVersion(5,core),/版本 5.*版本 3/);
 assert.equal(assertCoreVersion(2,core).coreVersion,67108864);
});
test('local imports resolve only exact paths inside their supplied package',()=>{
 const local={localImport:true,entryPath:'nested/a.model3.json',files:[{path:'nested/a.moc3',url:'blob:exact'},{path:'other/a.moc3',url:'blob:wrong'}]};
 assert.equal(declaredResource('a.moc3',local).url,'blob:exact');
 assert.throws(()=>declaredResource('../other/a.moc3',local),/路径/);
});
test('malformed optional physics counts and empty motion groups cannot stall a valid character',async()=>{
 const broken={Version:3,Meta:{PhysicsSettingCount:1,TotalInputCount:0,TotalOutputCount:0,VertexCount:0,EffectiveForces:{Gravity:{X:0,Y:-1},Wind:{X:0,Y:0}}},PhysicsSettings:[]};
 const m={...model,files:[...model.files,{path:'physics.json',url:base+'physics.json'}]};
 const input={Version:3,FileReferences:{Moc:'a.moc3',Textures:['tex.png'],Physics:'physics.json',Motions:{Idle:[]}}};
 const result=await prepareModelConfig(input,m,async()=>broken);
 assert.equal(result.config.FileReferences.Physics,undefined);assert.deepEqual(result.config.FileReferences.Motions,{});
 assert.equal(result.diagnostics.length,2);assert.match(result.diagnostics[0],/Physics/);
});
test('real yichui physics shape remains supported; allocation-count corruption is rejected',async()=>{
 const data=JSON.parse(await readFile(new URL('../../assets/model/moc3/yichui_2/yichui_2.physics3.json',import.meta.url)));
 validateOptionalData('Physics',data);data.Meta.VertexCount++;assert.throws(()=>validateOptionalData('Physics',data),/计数/);
});
test('real catalog March 7th preserves missing-expression evidence without blocking declared Moc/textures',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../../catalog/models.json',import.meta.url)));
 const original=catalog.models.find(m=>m.name==='March 7th');assert.equal(original.validation.referencesComplete,false);
 const m={...original,entryUrl:new URL(original.entryUrl,'https://example.test/live2d_models/studio/').href,files:original.files.map(f=>({...f,url:new URL(f.url,'https://example.test/live2d_models/studio/').href}))};
 const input={Version:3,FileReferences:{Moc:'March 7th.moc3',Textures:['March 7th.4096/texture_00.png','March 7th.4096/texture_01.png'],Expressions:m.expressions.map(e=>({Name:e.name,File:e.file}))}};
 const result=await prepareModelConfig(input,m,async()=>{throw Error('Unexpected request');});
 assert.equal(result.unavailableExpressions.length,8);assert.equal(result.textures.length,2);assert.equal(result.config.FileReferences.Expressions.length,0);
});
