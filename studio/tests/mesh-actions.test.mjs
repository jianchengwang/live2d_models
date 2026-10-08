import test from 'node:test';import assert from 'node:assert/strict';
import {gridMesh,meshPositions,bindPreset,playbackValues,validateMeshProject,MESH_FORMAT} from '../../v2/mesh-project.js';
import {defaultActionParameters,applyMaterialManifest,mainAlphaBounds} from '../../v2/material-contract.js';
import {inferProjectRoles,bindAllBasics,actionStatus,actionSignature,ensureActionParameters} from '../mesh-actions.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const layer=name=>({id:name,name,width:1,height:1,texture:png,visible:true,opacity:1,mesh:gridMesh(0,0,10,20,2),bindings:{}});
const make=()=>inferProjectRoles({format:MESH_FORMAT,version:1,name:'fixture',width:10,height:20,layers:['03BodyClothing','leftEye','rightEye','closedMouth'].map(layer),parameters:defaultActionParameters(),sourceAsset:{kind:'psd',sha256:'a'.repeat(64)}});
test('remote alpha islands do not move the main mouth center when generating a stretch key',()=>{const rgba=new Uint8Array(10*20*4);for(let y=3;y<=4;y++)for(let x=4;x<=6;x++)rgba[(y*10+x)*4+3]=255;rgba[(19*10)*4+3]=255;const bounds=mainAlphaBounds(rgba,10,20);assert.deepEqual(bounds,{left:4,top:3,width:3,height:2});const l=layer('closedMouth');l.contentBounds=bounds;bindPreset(l,'ParamMouthOpenY','mouth',.04);const positions=meshPositions(l,{ParamMouthOpenY:1});const index=0;assert.ok(Math.abs(positions[index+1]-(4+(l.mesh.positions[index+1]-4)*1.32))<1e-10);});
test('new eye semantics use closed0/open1 while legacy visual playback remains unchanged',()=>{
  const fresh=make(),old=make();old.parameters=[{id:'ParamEyeLOpen',name:'old',min:0,max:1,default:0}];ensureActionParameters(old);
  bindAllBasics(fresh);bindPreset(old.layers[1],'ParamEyeLOpen','blink');
  assert.deepEqual(meshPositions(fresh.layers[1],{ParamEyeLOpen:1}),fresh.layers[1].mesh.positions);
  assert.deepEqual(meshPositions(old.layers[1],{ParamEyeLOpen:0}),old.layers[1].mesh.positions);
  assert.equal(playbackValues(fresh,1,{blink:true}).ParamEyeLOpen,1);assert.equal(playbackValues(fresh,.05,{blink:true}).ParamEyeLOpen,0);
  assert.equal(playbackValues(old,1,{blink:true}).ParamEyeLOpen,0);assert.equal(playbackValues(old,.05,{blink:true}).ParamEyeLOpen,1);
  const reopened=validateMeshProject(JSON.parse(JSON.stringify(fresh)));assert.equal(reopened.parameters[1].semantics,'eye-open-01');assert.deepEqual(meshPositions(reopened.layers[1],{ParamEyeLOpen:0}),meshPositions(fresh.layers[1],{ParamEyeLOpen:0}));
});
test('role matches and nonmoving bindings do not certify quality; review invalidates after geometry/texture change',()=>{
  const p=make();assert.equal(actionStatus(p,'breath').state,'unbound');assert.equal(actionStatus(p,'wave').state,'missing-materials');bindAllBasics(p);
  assert.equal(actionStatus(p,'blink').state,'approximate');assert.equal(actionStatus(p,'mouth').state,'approximate');assert.equal(actionStatus(p,'breath').state,'approximate');
  p.actionReviews={breath:actionSignature(p,'breath')};assert.equal(actionStatus(p,'breath').state,'usable');p.layers[0].bindings.ParamBreath[1].positions[0]+=1;assert.equal(actionStatus(p,'breath').state,'approximate');
  p.actionReviews.breath=actionSignature(p,'breath');p.layers[0].texture+='changed';assert.equal(actionStatus(p,'breath').state,'approximate');
  const q=make();q.layers=[layer('Unsplit composite')];assert.equal(bindAllBasics(q).every(result=>result.created===0),true);assert.equal(actionStatus(q,'blink').state,'missing-materials');
});
test('starter binding preserves existing authored keys and material manifest validates hash and unique actual layers',()=>{
  const p=make();bindAllBasics(p);p.layers[1].bindings.ParamEyeLOpen[0].positions[0]+=3;const before=JSON.stringify(p.layers[1].bindings);bindAllBasics(p);assert.equal(JSON.stringify(p.layers[1].bindings),before);
  const manifest={format:'character-layer-manifest',version:1,asset:{psd:'fixture.psd',coordinates:'canvas-pixels-x-right-y-down',width:10,height:20,sha256:'a'.repeat(64)},layers:[{id:'body',psdName:'03BodyClothing',role:'torso.clothing',restVisible:true,occlusionComplete:false}],requestedActions:['breath'],review:{visualApproved:false,notes:''}};
  assert.equal(applyMaterialManifest(p,manifest),1);assert.equal(p.layers[0].roleSource,'manifest');assert.throws(()=>applyMaterialManifest(p,{...manifest,asset:{...manifest.asset,sha256:'b'.repeat(64)}}),/SHA/);
  assert.throws(()=>applyMaterialManifest(p,{...manifest,layers:[...manifest.layers,{...manifest.layers[0],id:'duplicate'}]}),/重复/);
});

test('a valid old project at the parameter limit can still load without losing its authored parameters',()=>{const p=make();p.parameters=Array.from({length:16},(_,i)=>({id:'Custom'+i,name:'Custom',min:0,max:1,default:0}));const before=JSON.stringify(p.parameters);assert.equal(ensureActionParameters(p,{allowFull:true}),0);assert.equal(JSON.stringify(p.parameters),before);});

test('a changed occluding layer invalidates the earlier visual review',()=>{const p=make();bindAllBasics(p);p.actionReviews={breath:actionSignature(p,'breath')};assert.equal(actionStatus(p,'breath').state,'usable');p.layers[1].opacity=0;assert.equal(actionStatus(p,'breath').state,'approximate');});
