import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreRoles,saveRoles,roleStorageKey} from '../role-store.js';

test('persistent role settings use the public whitelist and never restore key, trust, history or callbacks',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)},secret='PRIVATE_MEMORY_CANARY';
 const cfg={modelUrl:'https://model.example/a.model3.json',runtimeBase:'https://runtime.example/',title:'角色甲',allowSwitch:false,models:[{name:'角色甲',url:'https://model.example/a.model3.json',systemPrompt:'甲的设定'},{name:'角色乙',url:'https://model.example/b.model3.json',systemPrompt:'乙的设定'}],chat:{mode:'direct',endpoint:'https://provider.example/chat',model:'fixture',key:secret,trusted:true},key:secret,history:[secret],onChatChange:secret};
 assert.equal(saveRoles(storage,cfg).saved,true);assert.ok(!data.get(roleStorageKey).includes(secret));const read=restoreRoles(storage).config;
 assert.equal(read.allowSwitch,false);assert.equal(read.models[1].systemPrompt,'乙的设定');assert.equal(read.chat.key,undefined);assert.equal(read.chat.trusted,undefined);assert.equal(read.history,undefined);
});
test('corrupt, oversized or blocked storage leaves the current page usable without losing an existing snapshot',()=>{
 const data=new Map([[roleStorageKey,'{broken']]),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert.equal(restoreRoles(storage).config,null);assert.match(restoreRoles(storage).message,/无法读取/);
 assert.equal(saveRoles(storage,{modelUrl:'blob:https://example.test/local'}).saved,false);assert.equal(data.get(roleStorageKey),'{broken');
 const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};assert.equal(restoreRoles(blocked).config,null);
 assert.equal(saveRoles(blocked,{modelUrl:'https://model.example/a.model3.json'}).saved,false);
});
