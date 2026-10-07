import {createLive2DWidget} from '../v2/widget.js';
import {loadModelSource} from '../v2/model-source.js';
import {importPackage} from '../v2/importer.js';
import {publicConfig,parsePublicConfig,configJSON,embedCode,bootstrapJS,buildEmbedPackage,downloadBlob} from '../v2/export.js';
import {restoreRoles,saveRoles} from './role-store.js';
const $=id=>document.getElementById(id),runtimeBase=new URL('../',import.meta.url).href,moduleURL=new URL('../v2/widget.js',import.meta.url).href;
let models=[],current,widget,localPackage,sourceController,exportController,selectedSequence=0,paused=false;
let configuredRuntimeBase=runtimeBase,compatibility=true,configuredModels=[],gutter=16,draftRoles=new Map();
const say=(id,message)=>{$(id).textContent=message;};
const appearance=()=>({width:Number($('width').value),height:Number($('height').value),side:$('side').value,bottom:Number($('bottom').value),gutter,zoom:Number($('zoom').value)/100,x:Number($('offset-x').value)/100,y:Number($('offset-y').value)/100});
function settings(){
 if(!current)throw new Error('请先选择模型');
 const modelUrl=current.localImport?$('own-url').value.trim()||current.entryUrl:current.entryUrl;
 return {title:$('companion-title').value,modelUrl,allowSwitch:$('allow-switch').checked,models:!current.localImport?configuredModels:[{name:$('companion-title').value,url:modelUrl,systemPrompt:$('chat-system-prompt').value}],runtimeBase:configuredRuntimeBase,compatibility,appearance:appearance(),chat:{mode:$('chat-mode').value,endpoint:$('chat-endpoint').value.trim(),model:$('chat-model').value.trim(),systemPrompt:$('chat-system-prompt').value},voice:{enabled:$('voice-enabled').checked,mode:$('voice-mode').value,endpoint:$('voice-endpoint').value.trim(),lang:$('voice-lang').value,voiceName:$('voice-name').value,volume:Number($('voice-volume').value),rate:Number($('voice-rate').value),pitch:Number($('voice-pitch').value)}};
}
function updateCode(){try{const cfg=publicConfig(settings());$('embed-code').textContent=embedCode(cfg,moduleURL);say('export-status','导出只含公开配置；运行时会话 key 不在代码中。');}catch(e){$('embed-code').textContent='';say('export-status',current?.localImport?'本地 Blob URL 不能带到其他网站。填写部署后的入口，或确认部署权后下载包含本地文件的 ZIP。':e.message);}}
function refresh(event){
 const id=event?.target?.id||'';
 if(['companion-title','chat-system-prompt'].includes(id))updateRole();
 for(const id of ['width','height','bottom'])$(id+'-label').textContent=$(id).value+'px';$('zoom-label').textContent=$('zoom').value+'%';
 if(widget&&current){try{const cfg=settings();const next={title:cfg.title,appearance:cfg.appearance,models:cfg.models,allowSwitch:cfg.allowSwitch};if(event?.includeChat||id.startsWith('chat-'))next.chat=cfg.chat;if(event?.includeVoice||id.startsWith('voice-'))next.voice=cfg.voice;widget.configure(next);}catch(e){say('preview-status',e.message);}}
 updateCode();persist();
}
function profile(url=current?.entryUrl){return configuredModels.find(m=>m.url===url);}
function updateRole(){const role=profile();if(role){role.name=$('companion-title').value.trim()||'我的角色';role.systemPrompt=$('chat-system-prompt').value;renderModels();}}
function persist(){if(!current||current.localImport)return;try{const saved=saveRoles(globalThis.localStorage,settings());say('roles-status',saved.message);}catch{say('roles-status','当前配置未保存，可下载配置 JSON。');}}
function renderModels(){
 $('model-list').replaceChildren();for(const role of configuredModels){const button=document.createElement('button');button.className=role.url===current?.entryUrl?'active':'';const title=document.createElement('span');title.textContent=role.name;button.append(title);button.onclick=()=>selectRole(role);$('model-list').append(button);}say('model-count',configuredModels.length+' 个常用角色');
}
async function selectRole(role){sourceController?.abort();const controller=new AbortController();sourceController=controller;try{const model=models.find(m=>m.entryUrl===role.url)||await loadModelSource(role.url,{signal:controller.signal});if(controller.signal.aborted)return;await choose(model,{preserveConfig:true});}catch(e){if(e.name!=='AbortError'&&!controller.signal.aborted)say('preview-status',e.message);}}
function manageRoles(){
 draftRoles=new Map(configuredModels.map(m=>[m.url,true]));$('roles-options').replaceChildren();
 const entries=[...models.map(m=>({name:m.name,url:m.entryUrl})),...configuredModels.filter(m=>!models.some(source=>source.entryUrl===m.url))];
 for(const role of entries){const label=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span');label.className='role-choice';input.type='checkbox';input.value=role.url;input.checked=!!draftRoles.get(role.url);input.onchange=()=>draftRoles.set(role.url,input.checked);const saved=profile(role.url);name.textContent=saved&&saved.name!==role.name?role.name+' · '+saved.name:role.name;label.append(input,name);$('roles-options').append(label);}
}
$('manage-roles').ontoggle=()=>{if($('manage-roles').open)manageRoles();};
$('roles-cancel').onclick=()=>{$('manage-roles').open=false;manageRoles();say('roles-status','已取消选择，保留原来的角色。');};
$('roles-save').onclick=async()=>{
 const sources=[...models.map(m=>({name:m.name,url:m.entryUrl})),...configuredModels.filter(m=>!models.some(source=>source.entryUrl===m.url))];
 const next=sources.filter(m=>draftRoles.get(m.url)).map(m=>({...m,systemPrompt:'',...profile(m.url)}));if(!next.length||next.length>64){say('roles-status',!next.length?'请至少保留一个角色，原来的选择尚未更改。':'最多保存 64 个常用角色，原来的选择尚未更改。');return;}
 configuredModels=next;$('manage-roles').open=false;renderModels();if(!profile())await selectRole(next[0]);else refresh();persist();
};
$('save-role').onclick=()=>{$('companion-title').value=$('companion-title').value.trim()||'我的角色';updateRole();refresh({includeChat:true});persist();};
function syncModel(role){
 const source=models.find(m=>m.entryUrl===role.url);if(source)current=source;else if(current?.entryUrl!==role.url)current={...current,entryUrl:role.url};
 $('companion-title').value=role.name;$('chat-system-prompt').value=role.systemPrompt;renderModels();say('selected-model','已选 · '+role.name);say('preview-title',role.name+'，来到你的网页。');if(widget?.viewer.ready)capabilities();updateCode();persist();
}
function options(id,items,label){const select=$(id);select.replaceChildren();for(const [index,item] of items.entries()){const o=document.createElement('option');o.value=index;o.textContent=label(item);select.append(o);}select.disabled=!items.length;}
function capabilities(){const caps=widget.viewer.listCapabilities();options('motion',caps.motions,m=>(m.group||'默认动作')+' / '+m.index);options('expression',caps.expressions,e=>e.name);$('play-motion').disabled=!caps.motions.length;$('play-expression').disabled=!caps.expressions.length;say('capabilities',`${caps.motions.length} 动作 · ${caps.expressions.length} 表情`);say('voice-note',caps.lipSyncIds.length?'模型已找到口型参数。系统朗读口型按发音事件近似；音频 TTS 按波形驱动。':'当前模型未发现口型参数，仍可朗读。语音与麦克风识别依浏览器而定。');}
function syncChat(chat){
 for(const [id,key] of [['chat-mode','mode'],['chat-endpoint','endpoint'],['chat-model','model'],['chat-system-prompt','systemPrompt']])$(id).value=chat[key]||'';
 updateRole();updateCode();persist();
}
function syncVoice(voice){
 $('voice-enabled').checked=!!voice.enabled;
 for(const [id,key] of [['voice-mode','mode'],['voice-endpoint','endpoint'],['voice-volume','volume'],['voice-rate','rate'],['voice-pitch','pitch']])if(voice[key]!==undefined)$(id).value=voice[key];
 selectValue('voice-lang',voice.lang||'zh-CN');selectValue('voice-name',voice.voiceName||'',(voice.voiceName||'')+' · 当前设备可能不可用');updateCode();persist();
}
async function choose(model,{preserveConfig=false}={}){
 if(!preserveConfig)sourceController?.abort();
 const saved=profile(model.entryUrl);if(saved){$('companion-title').value=saved.name;$('chat-system-prompt').value=saved.systemPrompt||'';}else{if(!model.localImport)configuredModels.push({name:model.name,url:model.entryUrl,systemPrompt:''});$('companion-title').value=model.name;$('chat-system-prompt').value='';}
 const attempt=++selectedSequence;current=model;$('play-motion').disabled=true;$('play-expression').disabled=true;say('capabilities','载入后显示可用动作与表情');$('preview-diagnostics').hidden=true;say('preview-diagnostic-list','');renderModels();say('selected-model','已选 · '+model.name);say('preview-title',model.name+'，来到你的网页。');say('preview-status','正在加载角色…');say('model-license',model.license?.note||'模型使用范围以原声明和你的权限为准；不自动捆绑仓库资源。');
 try{
  if(!widget){widget=await createLive2DWidget({...settings(),container:$('scene'),manifest:model,onChatChange:syncChat,onVoiceChange:syncVoice,onModelChange:syncModel});await widget.ready;}
  else{refresh({includeChat:true});await widget.setModel(model);}
  if(attempt!==selectedSequence)return;if(!widget.viewer.ready)throw new Error(widget.viewer.lastError||'角色未加载，请检查入口、Core 版本或资源 CORS');capabilities();const notes=widget.viewer.diagnostics||[];if(notes.length){$('preview-diagnostics').hidden=false;say('preview-diagnostic-list',notes.join('\n'));}say('preview-status',notes.length?`角色已加载；${notes.length} 项兼容处理，请查看加载诊断`:'默认完整角色适配 · 点开角色或“预览聊天”体验嵌入效果');
 }catch(e){if(e.name!=='AbortError'&&attempt===selectedSequence)say('preview-status',e.message);}updateCode();
}
for(const id of ['companion-title','side','bottom','width','height','zoom','offset-x','offset-y','chat-mode','chat-endpoint','chat-model','chat-system-prompt','voice-enabled','voice-mode','voice-lang','voice-name','voice-endpoint','voice-volume','voice-rate','voice-pitch','allow-switch'])$(id).addEventListener('input',refresh);
$('reset-fit').onclick=()=>{$('zoom').value=100;$('offset-x').value=0;$('offset-y').value=0;refresh();};
$('open-chat').onclick=()=>widget?.open();$('reload-preview').onclick=()=>{sourceController?.abort();if(current)choose(current,{preserveConfig:true});};$('pause-preview').onclick=()=>{if(!widget)return;paused=!paused;if(paused)widget.viewer.pause();else widget.viewer.resume();$('pause-preview').textContent=paused?'继续角色':'暂停角色';};
$('use-url').onclick=async()=>{sourceController?.abort();sourceController=new AbortController();say('source-status','读取你的模型入口…');try{const model=await loadModelSource($('own-url').value,{signal:sourceController.signal});await choose(model);say('source-status','入口已读取，文件由你的资源服务器提供。');}catch(e){say('source-status',e.message);}};
$('model-zip').onchange=()=>{$('local-rights').checked=false;$('include-local').checked=false;};
$('import-model').onclick=async()=>{const file=$('model-zip').files[0];if(!file||!$('local-rights').checked){say('source-status','请先选择 ZIP 并确认本地使用权');return;}sourceController?.abort();sourceController=new AbortController();say('source-status','浏览器内校验，没有上传…');try{const pack=await importPackage(file,{signal:sourceController.signal});const previous=localPackage;localPackage=pack;await choose(pack.model);previous?.dispose();say('source-status','已本地预览；文件只在本标签页内存中。');}catch(e){say('source-status',e.message);}};
$('clear-local').onclick=()=>{sourceController?.abort();if(current?.localImport){widget?.viewer.stopFrame();current=null;choose(models.find(m=>m.name==='lafei')||models[0]);}localPackage?.dispose();localPackage=null;$('model-zip').value='';$('local-rights').checked=false;$('include-local').checked=false;say('source-status','已释放本地文件');};
$('own-url').oninput=updateCode;
$('include-local').onchange=updateCode;
$('play-motion').onclick=()=>{try{const m=widget.viewer.listCapabilities().motions[Number($('motion').value)];widget.viewer.playMotion(m);say('preview-status','正在试播动作');}catch(e){say('preview-status',e.message);}};
$('play-expression').onclick=()=>{try{const e=widget.viewer.listCapabilities().expressions[Number($('expression').value)];widget.viewer.setExpression(e.name);say('preview-status','已应用表情');}catch(e){say('preview-status',e.message);}};
$('test-voice').onclick=async()=>{if(!$('voice-enabled').checked){say('preview-status','先开启“朗读回复”，再试听');return;}try{await widget.speak('你好，我会陪你在网页上聊天。');say('preview-status','已请求试听，实际声音取决于浏览器或你的 TTS 服务。');}catch(e){say('preview-status',e.message);}};
function selectValue(id,value,label=value){const select=$(id);if(value&&![...select.options].some(o=>o.value===value)){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.value=value;}
function voices(){const old=$('voice-name').value;$('voice-name').replaceChildren();const d=document.createElement('option');d.value='';d.textContent='设备默认声音';$('voice-name').append(d);for(const voice of globalThis.speechSynthesis?.getVoices()||[]){const o=document.createElement('option');o.value=voice.name;o.textContent=voice.name+' · '+voice.lang;$('voice-name').append(o);}selectValue('voice-name',old,old+' · 当前设备可能不可用');}
globalThis.speechSynthesis?.addEventListener('voiceschanged',voices);voices();
function applyConfigFields(cfg){
 configuredRuntimeBase=cfg.runtimeBase;compatibility=cfg.compatibility;configuredModels=cfg.models.map(m=>({...m,systemPrompt:m.systemPrompt??(m.url===cfg.modelUrl?cfg.chat.systemPrompt:'')}));if(!configuredModels.some(m=>m.url===cfg.modelUrl))configuredModels.unshift({name:cfg.title,url:cfg.modelUrl,systemPrompt:cfg.chat.systemPrompt});const active=configuredModels.find(m=>m.url===cfg.modelUrl);active.name=cfg.title;active.systemPrompt=cfg.chat.systemPrompt;gutter=cfg.appearance.gutter;
 for(const [id,value] of Object.entries({'companion-title':cfg.title,side:cfg.appearance.side,bottom:cfg.appearance.bottom,width:cfg.appearance.width,height:cfg.appearance.height,zoom:cfg.appearance.zoom*100,'offset-x':cfg.appearance.x*100,'offset-y':cfg.appearance.y*100,'chat-mode':cfg.chat.mode,'chat-endpoint':cfg.chat.endpoint,'chat-model':cfg.chat.model,'chat-system-prompt':cfg.chat.systemPrompt,'voice-mode':cfg.voice.mode,'voice-endpoint':cfg.voice.endpoint,'voice-volume':cfg.voice.volume,'voice-rate':cfg.voice.rate,'voice-pitch':cfg.voice.pitch}))$(id).value=value;
 $('voice-enabled').checked=cfg.voice.enabled;selectValue('voice-lang',cfg.voice.lang);selectValue('voice-name',cfg.voice.voiceName,cfg.voice.voiceName+' · 当前设备可能不可用');$('allow-switch').checked=cfg.allowSwitch??cfg.models.length>1;
 $('own-url').value=cfg.modelUrl;
}
$('download-config').onclick=()=>{try{downloadBlob(new Blob([configJSON(settings())],{type:'application/json'}),'live2d-config.json');say('config-status','已下载公开配置，可在这里重新导入；不含会话 key、信任授权或聊天记录。');}catch(e){say('config-status',e.message);}};
$('import-config').onclick=async()=>{
 const file=$('config-file').files[0];if(!file){say('config-status','请先选择公开配置 JSON');return;}
 if(file.size>256*1024){say('config-status','请选择不超过 256 KiB 的公开配置 JSON');return;}
 sourceController?.abort();const controller=new AbortController();sourceController=controller;$('import-config').disabled=true;say('config-status','正在校验公开配置…');
 try{
  const cfg=parsePublicConfig(await file.text());if(controller.signal.aborted)return;
  // Resolve the model before replacing a working preview. Import never restores credentials or trust.
  const source=models.find(m=>m.entryUrl===cfg.modelUrl)||await loadModelSource(cfg.modelUrl,{signal:controller.signal});if(controller.signal.aborted)return;
  const model={...source,name:cfg.models.find(m=>m.url===cfg.modelUrl)?.name||source.name};
  const previousWidget=widget;widget=null;previousWidget?.dispose();
  applyConfigFields(cfg);await choose(model,{preserveConfig:true});if(controller.signal.aborted)return;
  localPackage?.dispose();localPackage=null;$('model-zip').value='';$('local-rights').checked=false;$('include-local').checked=false;paused=false;$('pause-preview').textContent='暂停角色';refresh();
  say('config-status','已导入公开配置。私密字段已忽略；直连模式需在聊天设置重新授权并输入会话 key。');
 }catch(e){if(e.name!=='AbortError')say('config-status',e.message);}finally{$('import-config').disabled=false;}
};
$('copy-embed').onclick=async()=>{try{const code=embedCode(publicConfig(settings()),moduleURL);$('embed-code').textContent=code;await navigator.clipboard.writeText(code);say('export-status','已复制；粘贴到自己的页面即可。');}catch(e){say('export-status',e.message||'剪贴板不可用，请从代码框手动复制');}};
$('download-js').onclick=()=>{try{const cfg=publicConfig(settings());downloadBlob(new Blob([bootstrapJS(cfg,moduleURL)],{type:'text/javascript'}),'live2d-widget.js');say('export-status','已下载引导 JS；依赖此站组件和完整模型资源 URL，未包含 key。');}catch(e){say('export-status',e.message);}};
$('download-package').onclick=async()=>{exportController?.abort();const controller=new AbortController();exportController=controller;$('download-package').disabled=true;$('cancel-export').hidden=false;say('export-status','正在打包组件代码和公开配置…');try{const result=await buildEmbedPackage(settings(),{localPackage:current.localImport?localPackage:null,includeLocalModel:!!current.localImport&&$('include-local').checked,signal:controller.signal});if(controller.signal.aborted)return;downloadBlob(result.blob,'live2d-widget-package.zip');say('export-status',current.localImport&&$('include-local').checked?'已下载：代码、配置和你确认部署权的本地模型；没有会话 key。':'已下载：代码、配置和示例页面；仓库模型、Core 和会话 key 均未打包。');}catch(e){say('export-status',e.name==='AbortError'?'导出已取消':e.message);}finally{if(exportController===controller){exportController=null;$('download-package').disabled=false;$('cancel-export').hidden=true;}}};
$('cancel-export').onclick=()=>exportController?.abort();
addEventListener('pagehide',()=>{++selectedSequence;sourceController?.abort();exportController?.abort();widget?.dispose();localPackage?.dispose();globalThis.speechSynthesis?.removeEventListener('voiceschanged',voices);},{once:true});
async function start(){try{const response=await fetch(new URL('../catalog/models.json',import.meta.url));if(!response.ok)throw new Error('模型目录不可用');const catalog=await response.json();models=catalog.models.filter(m=>m.format==='moc3').map(m=>({...m,entryUrl:new URL(m.entryUrl,location.href).href,files:m.files.map(f=>({...f,url:new URL(f.url,location.href).href}))}));let stored;try{stored=restoreRoles(globalThis.localStorage);}catch{stored={config:null,message:'此浏览器不允许保存配置。'};}
 if(stored.config){applyConfigFields(stored.config);const role=profile(stored.config.modelUrl);await selectRole(role);}
 else{configuredModels=models.filter(m=>['lafei','March 7th','Gloria'].includes(m.name)).map(m=>({name:m.name,url:m.entryUrl,systemPrompt:''}));if(!configuredModels.length)configuredModels=[{name:models[0].name,url:models[0].entryUrl,systemPrompt:''}];await selectRole(configuredModels.find(m=>m.name==='lafei')||configuredModels[0]);}
 renderModels();refresh();if(stored.message)say('roles-status',stored.message);}catch(e){say('preview-status',e.message);}}start();
