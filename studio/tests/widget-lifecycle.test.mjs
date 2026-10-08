import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Behavioral widget tests: the actual Conversation handles synthetic SSE fetches.
// Only rendering, speech, and a small DOM surface are replaced; no browser,
// Live2D binary, credentials, server, or external API is needed.
class Element {
  constructor(tag, document) {
    this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.parentNode=null;
    this.attributes=new Map();this.listeners=new Map();this.hidden=false;this.disabled=false;
    this.checked=false;this.value='';this._text='';this.clientWidth=420;
    this.style={setProperty:(key,value)=>this.style[key]=value};
    this.classList={contains:name=>this.className.split(/\s+/).includes(name),toggle:(name,force)=>{
      const names=new Set(this.className.split(/\s+/).filter(Boolean));const add=force??!names.has(name);
      if(add)names.add(name);else names.delete(name);this.className=[...names].join(' ');return add;
    },add:(...names)=>names.forEach(name=>this.classList.toggle(name,true)),remove:(...names)=>names.forEach(name=>this.classList.toggle(name,false))};
  }
  get className(){return this.attributes.get('class')||'';}
  set className(value){this.attributes.set('class',value);}
  setAttribute(name,value){this.attributes.set(name,String(value));if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;if(name==='value')this.value=String(value);}
  getAttribute(name){return this.attributes.get(name)??null;}
  toggleAttribute(name,force){const present=force??!this.attributes.has(name);if(present)this.setAttribute(name,'');else this.removeAttribute(name);return present;}
  requestSubmit(){return this.fire('submit').done;}
  removeAttribute(name){this.attributes.delete(name);if(name==='hidden')this.hidden=false;if(name==='disabled')this.disabled=false;}
  append(...nodes){for(const node of nodes){node.parentNode=this;this.children.push(node);}}
  appendChild(node){this.append(node);return node;}
  replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this._text='';this.append(...nodes);}
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}}
  attachShadow(){this.shadowRoot=new Element('#shadow-root',this.ownerDocument);this.shadowRoot.host=this;return this.shadowRoot;}
  getRootNode(){let root=this;while(root.parentNode)root=root.parentNode;return root;}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  focus(){const root=this.getRootNode();root.activeElement=this;this.ownerDocument.activeElement=root.host||this;}
  set textContent(value){this.replaceChildren();this._text=String(value);}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  get scrollHeight(){return this.children.length;}
  set innerHTML(html){
    this.replaceChildren();const stack=[this],voidTags=new Set(['INPUT','LINK','BR','HR','IMG','META']);
    for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){
      if(token.startsWith('</')){stack.pop();continue;}
      if(token.startsWith('<')){
        const [,tag,attrs]=token.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/)||[];if(!tag)continue;
        const node=new Element(tag,this.ownerDocument);
        for(const match of attrs.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))node.setAttribute(match[1],match[2]??match[3]??match[4]??'');
        stack.at(-1).append(node);if(!voidTags.has(node.tagName))stack.push(node);
      }else stack.at(-1)._text+=token;
    }
  }
  matches(selector){
    if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));
    if(selector.startsWith('#'))return this.getAttribute('id')===selector.slice(1);
    return this.tagName===selector.toUpperCase();
  }
  querySelectorAll(selector){
    const parts=selector.trim().split(/\s+/),result=[];
    const matches=node=>{if(!node.matches(parts.at(-1)))return false;let ancestor=node.parentNode;for(let i=parts.length-2;i>=0;i--){while(ancestor&&!ancestor.matches(parts[i]))ancestor=ancestor.parentNode;if(!ancestor)return false;ancestor=ancestor.parentNode;}return true;};
    const visit=node=>{for(const child of node.children){if(matches(child))result.push(child);visit(child);}};visit(this);return result;
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(type,handler){const entries=this.listeners.get(type)||[];entries.push(handler);this.listeners.set(type,entries);}
  removeEventListener(type,handler){this.listeners.set(type,(this.listeners.get(type)||[]).filter(entry=>entry!==handler));}
  fire(type,init={}){
    const pending=[],event={type,target:this,bubbles:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...init};
    let node=this;
    while(node){event.currentTarget=node;for(const handler of [node['on'+type],...(node.listeners.get(type)||[])].filter(Boolean))pending.push(handler.call(node,event));if(event.stopped||!event.bubbles)break;node=node.parentNode||node.host;}
    return {event,done:Promise.all(pending)};
  }
}
const stubs=`
export class Live2DViewer extends EventTarget {
  constructor(){super();this.ready=false;this.model=null;this.views=[];}
  setView(view){this.views.push(view);}
  async load(model,{signal}={}){if(signal?.aborted)throw new DOMException('aborted','AbortError');this.model=model;this.ready=true;return model;}
  stopFrame(){this.ready=false;} pause(){} resume(){} destroy(){this.destroyed=true;this.ready=false;}
  listCapabilities(){return {motions:[],expressions:[]};} setLipSync(){}
}
export class VoicePlayback {
  constructor(viewer){viewer.voice=this;this.spoken=[];this.config={};}
  configure(config){this.config={...this.config,...config};}
  voices(){return [];}
  async prepare(){await this.prepareGate;}
  async speak(text){this.spoken.push(text);await this.speakGate;}
  stop(){this.stopped=(this.stopped||0)+1;}
  async dispose(){this.stop();this.disposed=true;}
}`;
const widgetURL=new URL('../../v2/widget.js',import.meta.url),stubURL='data:text/javascript;base64,'+Buffer.from(stubs).toString('base64');
const source=(await readFile(widgetURL,'utf8')).replace(/from '\.\/(sdk|speech)\.js(?:\?[^']*)?'/g,`from '${stubURL}'`).replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,widgetURL).href}'`).replaceAll('import.meta.url',JSON.stringify(widgetURL.href));
const {createLive2DWidget}=await import('data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL=widget-under-test.mjs').toString('base64'));
const key='synthetic-widget-session-key',endpoint='https://provider.example/v1/chat/completions';
const manifest={id:'fixture-a',entryUrl:'https://models.example/a.model3.json',motions:[],expressions:[]};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const sse=text=>new Response(`data: ${JSON.stringify({choices:[{delta:{content:text}}]})}\n\ndata: [DONE]\n\n`,{headers:{'Content-Type':'text/event-stream'}});
async function fixture(t,options={}){
  const originals=new Map();const set=(name,value)=>{originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});};
  const document=new Element('#document',null);document.ownerDocument=document;document.body=new Element('body',document);document.append(document.body);document.createElement=tag=>new Element(tag,document);
  const windowEvents=new EventTarget();
  set('document',document);set('location',new URL('https://studio.example/'));set('addEventListener',windowEvents.addEventListener.bind(windowEvents));set('removeEventListener',windowEvents.removeEventListener.bind(windowEvents));set('ResizeObserver',class{observe(){}disconnect(){}});
  const calls=[];let fetcher=async()=>sse('synthetic reply');
  set('fetch',async(url,options)=>{const request={url,options,body:JSON.parse(options.body)};calls.push(request);return fetcher(request);});
  let widget;
  t.after(async()=>{try{await widget?.dispose();}finally{for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}});
  const changes=[];widget=await createLive2DWidget({manifest,chat:{mode:'mock'},onChatChange:chat=>changes.push(chat),...options});await widget.ready;
  const $=selector=>{const node=widget.element.shadowRoot.querySelector(selector);assert.ok(node,`widget node ${selector} exists`);return node;};
  const click=selector=>$(selector).fire('click').done;
  const submit=text=>{$('.input').value=text;return $('.chat-form').fire('submit').done;};
  const apply=async(settings={})=>{const values={mode:'direct',endpoint,model:'fixture-chat',key,trusted:true,...settings};for(const [name,selector] of [['mode','.mode'],['endpoint','.endpoint'],['model','.chat-model'],['key','.key']])$(selector).value=values[name];$('.trust').checked=values.trusted;await click('.apply');};
  return {widget,$,click,submit,apply,calls,changes,document,setFetch:fn=>fetcher=fn};
}

test('widget retains applied direct session through appearance, voice, and equivalent public chat updates',async t=>{
  const f=await fixture(t,{chat:{mode:'mock',systemPrompt:'Follow the synthetic system instruction.'}});
  await f.apply();assert.equal(f.$('.key').value,'');
  assert.ok(f.changes.length>0,'applying chat settings notifies the host');
  const applied=f.changes.at(-1);assert.equal(applied.mode,'direct');assert.equal(applied.endpoint,endpoint);assert.equal(applied.model,'fixture-chat');
  assert.ok(!JSON.stringify(f.changes).includes(key),'host callbacks do not disclose session credentials');assert.ok(!('key' in applied));assert.ok(!('trusted' in applied));
  f.widget.configure({appearance:{side:'left',width:280}});f.widget.configure({voice:{enabled:true,volume:.5}});
  f.widget.configure({chat:{...applied}});
  assert.equal(f.$('.mode').value,'direct');assert.equal(f.$('.endpoint').value,endpoint);
  await f.submit('first question');assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,endpoint);assert.equal(f.calls[0].options.headers.Authorization,`Bearer ${key}`);
  assert.deepEqual(f.calls[0].body.messages,[{role:'system',content:'Follow the synthetic system instruction.'},{role:'user',content:'first question'}]);
  await f.submit('second question');assert.deepEqual(f.calls[1].body.messages.map(message=>message.role),['system','user','assistant','user']);
});

test('direct initialization, HTTP 401, and invalid settings never silently fall back to mock',async t=>{
  const f=await fixture(t,{chat:{mode:'direct',endpoint,model:'fixture-chat'}});
  await f.submit('missing credential');assert.equal(f.calls.length,0);assert.doesNotMatch(f.$('.messages').textContent,/本地 mock 回复/);
  await f.apply();f.setFetch(async()=>new Response('synthetic unauthorized',{status:401}));
  await f.submit('provider fails');assert.equal(f.calls.length,1);assert.match(f.$('.status').textContent,/401/);assert.doesNotMatch(f.$('.messages').textContent,/本地 mock 回复/);
  await f.apply({endpoint:'http://invalid.example/v1/chat',key:''});
  await f.submit('invalid config stays blocked');assert.equal(f.calls.length,1);assert.doesNotMatch(f.$('.messages').textContent,/本地 mock 回复/);assert.equal(f.$('.mode').value,'direct');
  await f.click('.clear');await f.submit('cleared key stays blocked');assert.equal(f.calls.length,1);assert.doesNotMatch(f.$('.messages').textContent,/本地 mock 回复/);
});

test('only an explicit mock selection generates a local demo reply',async t=>{
  const f=await fixture(t,{chat:{mode:'direct',endpoint,model:'fixture-chat'}});
  await f.apply({mode:'mock',endpoint:'',model:'',key:'',trusted:false});await f.submit('local demo');
  assert.equal(f.calls.length,0);assert.match(f.$('.messages').textContent,/本地 mock 回复/);assert.equal(f.changes.at(-1).mode,'mock');
});

test('duplicate form submits share no second request while a turn is pending',async t=>{
  const f=await fixture(t);await f.apply();const pending=deferred();f.setFetch(()=>pending.promise);
  const first=f.submit('first only');await turn();assert.equal(f.calls.length,1);assert.equal(f.$('.send').disabled,true);
  await f.submit('duplicate');assert.equal(f.calls.length,1);
  pending.resolve(sse('first response'));await first;assert.equal(f.$('.send').disabled,false);assert.equal(f.$('.stop').disabled,true);
  assert.equal(f.$('.messages').querySelectorAll('.user').length,1);
});

for(const action of ['stop','clear','model'])test(`${action} invalidates an in-flight turn and excludes its late result from future history`,async t=>{
  const f=await fixture(t);await f.apply();await f.submit('prior question');
  const pending=deferred();f.setFetch(()=>pending.promise);const abandoned=f.submit('abandoned question');await turn();
  const staleRequest=f.calls.at(-1);
  if(action==='stop')await f.click('.stop');else if(action==='clear')await f.click('.clear-chat');else await f.widget.setModel({...manifest,id:'fixture-b',entryUrl:'https://models.example/b.model3.json'});
  assert.equal(staleRequest.options.signal.aborted,true);assert.equal(f.$('.send').disabled,false,'cancellation releases the input without waiting for a transport');
  f.setFetch(async()=>sse('fresh response'));await f.submit('fresh question');const currentMessages=f.calls.at(-1).body.messages;
  const expected=action==='stop'?['prior question','synthetic reply','fresh question']:['fresh question'];assert.deepEqual(currentMessages.map(message=>message.content),expected);
  const status=f.$('.status').textContent,visible=f.$('.messages').textContent;
  pending.resolve(sse('STALE ANSWER MUST NOT APPEAR'));await abandoned;
  assert.equal(f.$('.status').textContent,status,'stale completion cannot replace status');assert.equal(f.$('.messages').textContent,visible,'stale completion cannot change visible messages');
  await f.submit('final question');const all=f.calls.at(-1).body.messages.map(message=>message.content);assert.ok(!all.includes('abandoned question'));assert.ok(!all.includes('STALE ANSWER MUST NOT APPEAR'));
});

test('stopping during voice preparation cannot start a late request or overwrite a newer turn',async t=>{
  const f=await fixture(t);await f.apply();const preparation=deferred();f.widget.viewer.voice.prepareGate=preparation.promise;
  const abandoned=f.submit('stopped before fetch');await turn();assert.equal(f.calls.length,0);await f.click('.stop');
  f.widget.viewer.voice.prepareGate=null;await f.submit('new request');assert.equal(f.calls.length,1);const status=f.$('.status').textContent;
  preparation.resolve();await abandoned;assert.equal(f.calls.length,1);assert.equal(f.$('.status').textContent,status);
  assert.deepEqual(f.calls[0].body.messages,[{role:'user',content:'new request'}]);
});

test('changing provider identity invalidates credentials while system-prompt-only changes preserve them',async t=>{
  const f=await fixture(t);await f.apply();const publicChat=f.changes.at(-1);
  f.widget.configure({chat:{...publicChat,systemPrompt:'updated instruction'}});await f.submit('uses new prompt');
  assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].body.messages[0],{role:'system',content:'updated instruction'});
  f.widget.configure({chat:{...publicChat,model:'different-chat-model'}});await f.submit('needs new key');
  assert.equal(f.calls.length,1);assert.doesNotMatch(f.$('.messages').textContent,/本地 mock 回复/);
});

test('Close and Escape hide the panel and return keyboard focus to its launcher',async t=>{
  const f=await fixture(t);f.widget.open();assert.equal(f.$('.panel').hidden,false);assert.equal(f.widget.element.shadowRoot.activeElement,f.$('.input'));
  await f.click('.close');assert.equal(f.$('.panel').hidden,true);assert.equal(f.$('.toggle').getAttribute('aria-expanded'),'false');assert.equal(f.widget.element.shadowRoot.activeElement,f.$('.toggle'));
  f.widget.open();const {event,done}=f.$('.input').fire('keydown',{key:'Escape'});await done;
  assert.equal(f.$('.panel').hidden,true);assert.equal(f.$('.toggle').getAttribute('aria-expanded'),'false');assert.equal(f.widget.element.shadowRoot.activeElement,f.$('.toggle'));assert.equal(event.defaultPrevented,true);
});

test('appearance, voice, and equivalent settings edits leave an in-flight provider request alive',async t=>{
  const f=await fixture(t);await f.apply();const pending=deferred();f.setFetch(()=>pending.promise);
  const response=f.submit('continue while styling');await turn();const request=f.calls[0];
  f.widget.configure({appearance:{width:320,height:400}});f.widget.configure({voice:{enabled:false,rate:1.3}});f.widget.configure({chat:{...f.changes.at(-1)}});
  assert.equal(request.options.signal.aborted,false);assert.equal(f.$('.send').disabled,true);
  pending.resolve(sse('uninterrupted answer'));await response;assert.match(f.$('.messages').textContent,/uninterrupted answer/);
  f.setFetch(async()=>sse('follow-up answer'));await f.submit('follow-up');
  assert.deepEqual(f.calls[1].body.messages.map(message=>message.content),['continue while styling','uninterrupted answer','follow-up']);
});

test('editable system prompt is transmitted and emitted in the public configuration without a key',async t=>{
  const f=await fixture(t);f.$('.system-prompt').value='You are a concise synthetic companion. 请用中文回答。';await f.apply();
  assert.equal(f.changes.at(-1).systemPrompt,f.$('.system-prompt').value);await f.submit('hello');
  assert.deepEqual(f.calls[0].body.messages[0],{role:'system',content:f.$('.system-prompt').value});
  assert.equal(f.$('.key').value,'');assert.ok(!JSON.stringify(f.changes).includes(key));
});

test('canceling unapplied settings restores the previous trusted provider and prompt',async t=>{
 const f=await fixture(t);await f.apply();f.widget.open();await f.click('.settings-toggle');
 f.$('.endpoint').value='https://different-provider.example/v1/chat';await f.$('.endpoint').fire('input').done;f.$('.system-prompt').value='Discard this draft';f.$('.key').value='discarded-draft-key';
 await f.click('.settings-done');assert.equal(f.$('.key').value,'');assert.equal(f.$('.endpoint').value,endpoint);assert.equal(f.$('.system-prompt').value,'');
 await f.submit('continue previous session');assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,endpoint);assert.equal(f.calls[0].options.headers.Authorization,'Bearer '+key);
 await f.click('.settings-toggle');await f.apply({endpoint:'https://different-provider.example/v1/chat',key:'',trusted:true});await f.click('.settings-done');await f.submit('failed Apply must revoke old session');assert.equal(f.calls.length,1);
});

test('missing chat settings are unconfigured until the visitor explicitly chooses a mode',async t=>{
  const f=await fixture(t,{chat:undefined});await f.submit('no implicit demo');assert.equal(f.calls.length,0);
  assert.doesNotMatch(f.$('.messages').textContent,/本地 mock 回复/);assert.equal(f.$('.mode').value,'unconfigured');
  assert.equal(f.$('.settings').hidden,true);assert.equal(f.$('.input').value,'no implicit demo');assert.match(f.$('.status').textContent,/尚未配置/);
});

test('late speech failure from a canceled turn cannot stop newer speech or change status',async t=>{
  const f=await fixture(t);await f.apply();const speech=deferred();f.widget.viewer.voice.speakGate=speech.promise;
  const previous=f.submit('old speech');await turn();assert.equal(f.widget.viewer.voice.spoken.length,1);await f.click('.stop');
  f.widget.viewer.voice.speakGate=null;await f.submit('new speech');const status=f.$('.status').textContent,stops=f.widget.viewer.voice.stopped;
  speech.reject(new Error('old synthetic voice failure'));await previous;
  assert.equal(f.$('.status').textContent,status);assert.equal(f.widget.viewer.voice.stopped,stops);
});

test('disposing cancels the request, removes the widget, and ignores late transport completion',async t=>{
  const f=await fixture(t);await f.apply();const pending=deferred();f.setFetch(()=>pending.promise);
  const response=f.submit('dispose before answer');await turn();const request=f.calls[0];await f.widget.dispose();
  assert.equal(request.options.signal.aborted,true);assert.equal(f.widget.element.parentNode,null);assert.equal(f.widget.viewer.destroyed,true);assert.equal(f.widget.viewer.voice.disposed,true);
  const status=f.$('.status').textContent,visible=f.$('.messages').textContent;pending.resolve(sse('AFTER DISPOSE'));await response;
  assert.equal(f.$('.status').textContent,status);assert.equal(f.$('.messages').textContent,visible);
  await f.submit('cannot send after disposal');assert.equal(f.calls.length,1);
});

test('Enter submits once while Shift+Enter and IME composition do not submit',async t=>{
  const f=await fixture(t);await f.apply();f.$('.input').value='keyboard input';
  const newline=f.$('.input').fire('keydown',{key:'Enter',shiftKey:true});await newline.done;assert.equal(newline.event.defaultPrevented,false);
  const composition=f.$('.input').fire('keydown',{key:'Enter',isComposing:true});await composition.done;assert.equal(composition.event.defaultPrevented,false);assert.equal(f.calls.length,0);
  const send=f.$('.input').fire('keydown',{key:'Enter'});await send.done;await turn();assert.equal(send.event.defaultPrevented,true);assert.equal(f.calls.length,1);assert.equal(f.$('.input').value,'');
});

test('Escape first dismisses settings, then the chat panel, with matching focus and ARIA state',async t=>{
  const f=await fixture(t);f.widget.open();await f.click('.settings-toggle');assert.equal(f.$('.settings').hidden,false);
  assert.equal(f.$('.settings-toggle').getAttribute('aria-expanded'),'true');assert.equal(f.widget.element.shadowRoot.activeElement,f.$('.mode'));
  await f.$('.mode').fire('keydown',{key:'Escape'}).done;assert.equal(f.$('.settings').hidden,true);assert.equal(f.$('.panel').hidden,false);
  assert.equal(f.$('.settings-toggle').getAttribute('aria-expanded'),'false');assert.equal(f.widget.element.shadowRoot.activeElement,f.$('.input'));
  await f.$('.input').fire('keydown',{key:'Escape'}).done;assert.equal(f.$('.panel').hidden,true);assert.equal(f.widget.element.shadowRoot.activeElement,f.$('.toggle'));
});

test('a stale completion cannot release the send button or abort a newer pending turn',async t=>{
  const f=await fixture(t);await f.apply();const old=deferred(),current=deferred();f.setFetch(()=>old.promise);
  const oldSubmit=f.submit('old pending turn');await turn();await f.click('.stop');f.setFetch(()=>current.promise);
  const currentSubmit=f.submit('current pending turn');await turn();assert.equal(f.calls.length,2);const status=f.$('.status').textContent;
  old.resolve(sse('stale response'));await oldSubmit;
  assert.equal(f.$('.send').disabled,true);assert.equal(f.$('.stop').disabled,false);assert.equal(f.calls[1].options.signal.aborted,false);assert.equal(f.$('.status').textContent,status);
  await f.submit('still a duplicate');assert.equal(f.calls.length,2);
  current.resolve(sse('current response'));await currentSubmit;assert.equal(f.$('.send').disabled,false);assert.match(f.$('.messages').textContent,/current response/);
});

test('prompt-only Apply retains the configured session key without re-entry',async t=>{
 const f=await fixture(t);await f.apply();await f.submit('before prompt update');
 f.$('.system-prompt').value='New system prompt';assert.equal(f.$('.key').value,'');await f.click('.apply');await f.submit('after prompt update');
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].options.headers.Authorization,'Bearer '+key);
 assert.deepEqual(f.calls[1].body.messages,[{role:'system',content:'New system prompt'},{role:'user',content:'after prompt update'}]);
});

test('runtime voice callback whitelists public settings and does not expose unknown private fields',async t=>{
 const changes=[],f=await fixture(t,{voice:{enabled:true,mode:'browser',lang:'zh-CN',key:'PRIVATE_VOICE_CANARY'},onVoiceChange:value=>changes.push(value)});
 f.$('.volume').value='.4';await f.$('.volume').fire('change').done;
 assert.equal(changes.length,1);assert.equal(changes[0].volume,.4);assert.equal(changes[0].mode,'browser');assert.ok(!JSON.stringify(changes).includes('PRIVATE_VOICE_CANARY'));assert.equal(changes[0].key,undefined);
});

test('responsive sizing clamps workspace to viewport and switches narrow layout without duplicating the renderer',async t=>{
 const width=Object.getOwnPropertyDescriptor(globalThis,'innerWidth'),height=Object.getOwnPropertyDescriptor(globalThis,'innerHeight');
 t.after(()=>{for(const [key,descriptor] of [['innerWidth',width],['innerHeight',height]])if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 globalThis.innerWidth=375;globalThis.innerHeight=667;const f=await fixture(t);f.widget.open();
 assert.equal(f.widget.element.style['--workspace-width'],'343px');assert.equal(f.widget.element.style['--workspace-height'],'580px');assert.equal(f.widget.element.getAttribute('compact'),'');
 globalThis.innerWidth=1440;globalThis.innerHeight=900;f.widget.configure({appearance:{gutter:16,bottom:20}});
 assert.equal(f.widget.element.style['--workspace-width'],'840px');assert.equal(f.widget.element.getAttribute('compact'),null);assert.equal(f.widget.element.getAttribute('expanded'),'');
});


test('role switching cancels previous stream and uses only each role name and system prompt',async t=>{
 const a={name:'阅读伙伴',url:manifest.entryUrl,systemPrompt:'只回答阅读问题。'},b={name:'运动伙伴',url:'https://models.example/b.model3.json',systemPrompt:'只回答运动问题。'};
 const changes=[],f=await fixture(t,{models:[a,b],onModelChange:role=>changes.push(role)});await f.apply();await f.submit('role A history');assert.deepEqual(f.calls.at(-1).body.messages[0],{role:'system',content:a.systemPrompt});
 const pending=deferred();f.setFetch(()=>pending.promise);const old=f.submit('abandoned A');await turn();const request=f.calls.at(-1);
 await f.widget.setModel({...manifest,entryUrl:b.url});assert.equal(request.options.signal.aborted,true);assert.equal(f.$('.character-name').textContent,b.name);assert.equal(f.$('.system-prompt').value,b.systemPrompt);
 f.setFetch(async()=>sse('role B answer'));await f.submit('question for B');assert.deepEqual(f.calls.at(-1).body.messages,[{role:'system',content:b.systemPrompt},{role:'user',content:'question for B'}]);assert.equal(f.calls.at(-1).options.headers.Authorization,'Bearer '+key);
 pending.resolve(sse('STALE ROLE A'));await old;assert.doesNotMatch(f.$('.messages').textContent,/STALE ROLE A/);
 await f.widget.setModel(manifest);assert.equal(f.$('.character-name').textContent,a.name);assert.equal(f.$('.system-prompt').value,a.systemPrompt);assert.equal(changes.at(-1).url,a.url);
 f.widget.configure({models:[a,b],allowSwitch:false});assert.equal(f.$('.model-select').hidden,true);f.widget.configure({allowSwitch:true});assert.equal(f.$('.model-select').hidden,false);assert.equal(f.$('.model-select').value,0);
});


test('standalone role Apply keeps its edited prompt across switches and closing settings cancels drafts',async t=>{
 const a={name:'A',url:manifest.entryUrl,systemPrompt:'Prompt A'},b={name:'B',url:'https://models.example/b.model3.json',systemPrompt:'Prompt B'},f=await fixture(t,{models:[a,b]});await f.apply();
 f.$('.system-prompt').value='Updated A';await f.click('.apply');await f.widget.setModel({...manifest,entryUrl:b.url});assert.equal(f.$('.system-prompt').value,'Prompt B');await f.widget.setModel(manifest);assert.equal(f.$('.system-prompt').value,'Updated A');
 f.widget.open();await f.click('.settings-toggle');f.$('.system-prompt').value='Unapplied draft';f.$('.key').value='Discarded';await f.click('.close');f.widget.open();assert.equal(f.$('.settings').hidden,true);assert.equal(f.$('.system-prompt').value,'Updated A');assert.equal(f.$('.key').value,'');await f.submit('still authorized');assert.equal(f.calls.at(-1).options.headers.Authorization,'Bearer '+key);
});
