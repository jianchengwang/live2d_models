import test from 'node:test';import assert from 'node:assert/strict';
import {createJob,recordLayers,advanceJob,acceptModel,agentRequest} from '../../v2/pipeline.js';
const input={name:'synthetic-circle.png',sha256:'a'.repeat(64),bytes:100};
test('cannot skip rigging/export or call a provider',()=>{
 const job=createJob(input);const request=agentRequest(job);
 assert.equal(request.imagePixelsIncluded,false);assert.equal(request.externalTransmissionApproved,false);
 assert.throws(()=>advanceJob(job,'export','pretend export done'));
 assert.throws(()=>acceptModel(job,{localImport:true,validation:{referencesComplete:true}},true,true));
});
test('requires valid layer names and human evidence',()=>{
 let job=createJob(input);assert.throws(()=>recordLayers(job,{layers:[{name:'../bad'}]}));
 assert.throws(()=>recordLayers(job,{layers:[{name:'Head'},{name:'head'}]}));
 job=recordLayers(job,{layers:[{name:'head',role:'头部'}]});assert.equal(job.stage,'review_required');
 assert.throws(()=>advanceJob(job,'review','ok'));
});
test('only real imported package plus Core and visual confirmation reaches ready',()=>{
 let job=recordLayers(createJob(input),{layers:[{name:'head'}]});
 for(const action of ['review','rig','export'])job=advanceJob(job,action,'manual operation recorded');
 const model={id:'import-demo',localImport:true,validation:{referencesComplete:true},archiveSha256:'b'.repeat(64)};
 assert.throws(()=>acceptModel(job,model,false,true));assert.throws(()=>acceptModel(job,model,true,false));
 assert.throws(()=>acceptModel(job,{...model,localImport:false},true,true));
 job=acceptModel(job,model,true,true);assert.equal(job.stage,'ready');assert.equal(job.history.length,5);
});
