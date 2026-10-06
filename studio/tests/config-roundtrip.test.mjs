import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {publicConfig,parsePublicConfig,configJSON,embedCode,bootstrapJS,buildEmbedPackage} from '../../v2/export.js';

const base='https://site.example/studio/',modelUrl='https://models.example/companion.model3.json';
const secret='SYNTHETIC_PRIVATE_CONFIG_CANARY';
const fixture=()=>({schemaVersion:1,title:'测试伙伴',modelUrl,runtimeBase:'https://runtime.example/assets/',compatibility:false,
 models:[{name:'角色一',url:modelUrl},{name:'角色二',url:'https://models.example/second.model3.json'}],
 appearance:{width:620,height:680,side:'left',bottom:95,gutter:12,zoom:1.75,x:-.6,y:.6},
 chat:{mode:'direct',endpoint:'https://provider.example/v1/chat/completions',model:'fixture-model',systemPrompt:'你是安静的网页伙伴。\n请用简短的中文回答。'},
 voice:{enabled:true,mode:'endpoint',endpoint:'https://voice.example/tts',lang:'fr-FR',voiceName:'Voice from another device',volume:.33,rate:1.23,pitch:1.37}});
const privateConfig=()=>{const raw=fixture();Object.assign(raw,{key:secret,apiKey:secret,history:[secret],session:{key:secret},onChatChange:secret,__proto__:null});Object.assign(raw.chat,{key:secret,apiKey:secret,authorization:secret,headers:{Authorization:secret},trusted:true,history:[secret]});Object.assign(raw.voice,{key:secret,headers:{Authorization:secret}});raw.models[0].apiKey=secret;raw.appearance.private=secret;return raw;};

test('public JSON config round-trips multiline prompt, provider, voice and appearance settings',()=>{
 const expected=fixture(),serialized=configJSON(expected,{base});
 assert.deepEqual(parsePublicConfig(serialized,{base}),expected);
 assert.equal(parsePublicConfig(configJSON({...expected,chat:{...expected.chat,mode:'mock'},voice:{...expected.voice,mode:'browser'}},{base}),{base}).chat.endpoint,expected.chat.endpoint);
 assert.equal(parsePublicConfig(configJSON({...expected,voice:{...expected.voice,mode:'browser'}},{base}),{base}).voice.endpoint,expected.voice.endpoint);
 assert.equal(publicConfig({...expected,chat:{...expected.chat,systemPrompt:'line 1\r\nline 2\u0000'}},{base}).chat.systemPrompt,'line 1\nline 2');
});

test('JSON, embed, bootstrap and ZIP ignore credentials, authorization, sessions and history',async()=>{
 const raw=privateConfig(),cfg=publicConfig(raw,{base});
 assert.deepEqual(cfg,fixture());
 for(const key of ['title','modelUrl'])assert.throws(()=>publicConfig({...raw,[key]:key==='modelUrl'?'https://models.example/'+secret+'.model3.json':secret},{base}),/密钥/);
 assert.throws(()=>configJSON({...raw,chat:{...raw.chat,systemPrompt:'Never export '+secret}},{base}),/密钥/);
 const outputs=[configJSON(raw,{base}),embedCode(raw,'https://site.example/v2/widget.js'),bootstrapJS(raw,'https://site.example/v2/widget.js')];
 const packaged=await buildEmbedPackage(raw,{fetchFile:async name=>'// synthetic '+name});
 outputs.push(...[...packaged.files.values()].map(String));
 for(const output of outputs)assert.ok(!output.includes(secret));
 assert.deepEqual(parsePublicConfig(JSON.stringify(raw),{base}),fixture());
 assert.equal(cfg.chat.trusted,undefined);assert.equal(cfg.chat.key,undefined);assert.equal(cfg.history,undefined);
 const injected=JSON.parse(JSON.stringify(raw).replace('"title":"测试伙伴"','"__proto__":{"polluted":true},"title":"测试伙伴"'));
 assert.equal(parsePublicConfig(JSON.stringify(injected),{base}).polluted,undefined);assert.equal({}.polluted,undefined);
 const markup=embedCode({...raw,chat:{...raw.chat,systemPrompt:'</script><img src=x>'}},'https://site.example/</script>');
 assert.equal((markup.match(/<\/script>/g)||[]).length,1);assert.match(markup,/\\u003c\/script>/);
});

test('missing chat is unconfigured and long prompts preserve the widget limit',()=>{
 const raw=fixture();delete raw.chat;assert.equal(publicConfig(raw,{base}).chat.mode,'unconfigured');
 assert.equal(parsePublicConfig(configJSON(raw,{base}),{base}).chat.mode,'unconfigured');
 assert.equal(publicConfig({...raw,chat:{mode:'backend',systemPrompt:'界'.repeat(12001)}},{base}).chat.systemPrompt.length,12000);
});

test('config import rejects malformed, oversized, unknown modes and secret-bearing URLs',()=>{
 for(const source of ['{','null','[]','"config"',' '.repeat(256*1024+1)])assert.throws(()=>parsePublicConfig(source,{base}));
 for(const patch of [{schemaVersion:2},{chat:[]},{voice:'browser'},{models:[null]},{chat:{mode:'typo'}},{voice:{mode:'typo'}}])assert.throws(()=>parsePublicConfig(JSON.stringify({...fixture(),...patch}),{base}));
 for(const endpoint of ['https://user:pass@provider.example/chat','https://provider.example/chat?key='+secret,'https://provider.example/chat#'+secret,'http://provider.example/chat','javascript:alert(1)']){
  assert.throws(()=>parsePublicConfig(JSON.stringify({...fixture(),chat:{...fixture().chat,endpoint}}),{base}));
 }
});

class Element {
 constructor(id='',tag='div'){this.id=id;this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.files=[];this._value='';this.checked=false;this.disabled=false;}
 set value(value){this._value=String(value);}
 get value(){return this._value;}
 get options(){return this.children;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 addEventListener(type,listener){this.listeners[type]=listener;}
 input(value){this.value=value;return this.listeners.input?.({target:this});}
}
async function generatorHarness(){
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),elements=new Map();
 for(const match of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
  const element=new Element(match[3],match[1]);element.value=match[2].match(/\bvalue="([^"]*)"/)?.[1]||'';element.checked=/\bchecked\b/.test(match[2]);elements.set(element.id,element);
 }
 for(const [id,value] of Object.entries({side:'right','chat-mode':'mock','voice-mode':'browser','voice-lang':'zh-CN'}))elements.get(id).value=value;
 const widgets=[],downloads=[],loads=[],catalog={models:[{id:'fixture',name:'lafei',format:'moc3',entryUrl:modelUrl,files:[]}]};
 const context=vm.createContext({URL,Blob,AbortController,TextEncoder,location:{href:base},document:{getElementById:id=>{assert.ok(elements.has(id),'Known DOM id: '+id);return elements.get(id);},createElement:tag=>new Element('',tag)},
 addEventListener(){},fetch:async()=>({ok:true,json:async()=>catalog}),publicConfig,parsePublicConfig:source=>parsePublicConfig(source,{base}),configJSON,embedCode,bootstrapJS,buildEmbedPackage,
 downloadBlob:(blob,name)=>downloads.push({blob,name}),importPackage:async()=>{throw new Error('No model ZIP needed');},
 loadModelSource:async(url,options)=>{loads.push({url,options});return {id:url,name:'imported-model',entryUrl:url,files:[]};},
 createLive2DWidget:async options=>{const instance={options,changes:[],disposed:false,ready:Promise.resolve(),viewer:{ready:true,diagnostics:[],listCapabilities:()=>({motions:[],expressions:[],lipSyncIds:[]})},configure(next){this.changes.push(next);},setModel:async()=>{},dispose(){this.disposed=true;},open(){}};widgets.push(instance);return instance;}});
 const original=await readFile(new URL('../generator.js',import.meta.url),'utf8');
 const source=original.replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(base+'generator.js')).replace(/start\(\);\s*$/,'globalThis.started=start();')+'\nglobalThis.harness={settings,voices};';
 vm.runInContext(source,context);await context.started;
 return {elements,widgets,downloads,loads,context};
}

test('generator syncs runtime Apply into export and appearance/voice edits do not reset chat',async()=>{
 const {elements,widgets,downloads}=await generatorHarness(),widget=widgets[0];
 assert.equal(widget.options.chat.mode,'mock');
 const applied=fixture().chat;widget.options.onChatChange(applied);
 assert.equal(elements.get('chat-system-prompt').value,applied.systemPrompt);
 assert.equal(elements.get('chat-mode').value,'direct');
 widget.options.onVoiceChange(fixture().voice);assert.equal(elements.get('voice-name').value,fixture().voice.voiceName);assert.equal(elements.get('voice-lang').value,'fr-FR');
 widget.changes=[];elements.get('width').input('310');assert.equal(widget.changes.at(-1).chat,undefined);assert.equal(widget.changes.at(-1).voice,undefined);
 elements.get('voice-rate').input('1.4');assert.equal(widget.changes.at(-1).chat,undefined);assert.equal(widget.changes.at(-1).voice.rate,1.4);
 elements.get('chat-system-prompt').input('新的角色设定\n第二行');assert.equal(widget.changes.at(-1).chat.systemPrompt,'新的角色设定\n第二行');assert.equal(widget.changes.at(-1).chat.mode,'direct');
 elements.get('download-config').onclick();const exported=JSON.parse(await downloads.at(-1).blob.text());assert.equal(exported.chat.endpoint,applied.endpoint);assert.equal(exported.chat.systemPrompt,'新的角色设定\n第二行');assert.deepEqual(exported.voice,{...fixture().voice,rate:1.4});
});

test('generator import restores public fields, recreates credential-free preview and round-trips export',async()=>{
 const {elements,widgets,downloads,context}=await generatorHarness(),raw=privateConfig();
 elements.get('config-file').files=[new Blob([JSON.stringify(raw)],{type:'application/json'})];
 await elements.get('import-config').onclick();
 assert.equal(elements.get('import-config').disabled,false);assert.equal(widgets.length,2);assert.equal(widgets[0].disposed,true);
 assert.equal(widgets[1].options.chat.key,undefined);assert.equal(widgets[1].options.chat.trusted,undefined);
 assert.equal(widgets[1].options.runtimeBase,raw.runtimeBase);assert.equal(widgets[1].options.compatibility,false);
 assert.equal(elements.get('voice-lang').value,'fr-FR');assert.equal(elements.get('voice-name').value,raw.voice.voiceName);
 context.harness.voices();assert.equal(elements.get('voice-name').value,raw.voice.voiceName);
 elements.get('download-config').onclick();const exported=JSON.parse(await downloads.at(-1).blob.text());assert.deepEqual(exported,fixture());
 elements.get('width').input('650');elements.get('download-config').onclick();const edited=JSON.parse(await downloads.at(-1).blob.text());assert.equal(edited.appearance.width,650);assert.deepEqual(edited.chat,fixture().chat);assert.deepEqual(edited.voice,fixture().voice);
 const previous=widgets.length;elements.get('config-file').files=[new Blob(['{"schemaVersion":99}'])];await elements.get('import-config').onclick();assert.equal(widgets.length,previous);assert.match(elements.get('config-status').textContent,/不支持/);assert.equal(elements.get('import-config').disabled,false);
});
