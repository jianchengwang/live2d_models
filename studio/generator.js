import {createLive2DWidget} from '../v2/widget.js';
import {loadModelSource} from '../v2/model-source.js';
import {importPackage} from '../v2/importer.js';
import {publicConfig,embedCode,bootstrapJS,buildEmbedPackage,downloadBlob} from '../v2/export.js';
const $=id=>document.getElementById(id),runtimeBase=new URL('../',import.meta.url).href,moduleURL=new URL('../v2/widget.js',import.meta.url).href;
let models=[],current,widget,localPackage,sourceController,exportController,selectedSequence=0,paused=false;
const say=(id,message)=>{$(id).textContent=message;};
const appearance=()=>({width:Number($('width').value),height:Number($('height').value),side:$('side').value,bottom:Number($('bottom').value),gutter:16,zoom:Number($('zoom').value)/100,x:Number($('offset-x').value)/100,y:Number($('offset-y').value)/100});
function settings(){
 if(!current)throw new Error('请先选择模型');
 const modelUrl=current.localImport?$('own-url').value.trim()||current.entryUrl:current.entryUrl;
 return {title:$('companion-title').value,modelUrl,models:$('allow-switch').checked&&!current.localImport?[current,...models.filter(m=>m.id!==current.id)].map(m=>({name:m.name,url:m.entryUrl})):[{name:current.name,url:modelUrl}],runtimeBase,compatibility:true,appearance:appearance(),chat:{mode:$('chat-mode').value,endpoint:$('chat-endpoint').value.trim(),model:$('chat-model').value.trim()},voice:{enabled:$('voice-enabled').checked,mode:$('voice-mode').value,endpoint:$('voice-endpoint').value.trim(),lang:$('voice-lang').value,voiceName:$('voice-name').value,volume:Number($('voice-volume').value),rate:Number($('voice-rate').value),pitch:Number($('voice-pitch').value)}};
}
function updateCode(){try{const cfg=publicConfig(settings());$('embed-code').textContent=embedCode(cfg,moduleURL);say('export-status','导出只含公开配置；运行时会话 key 不在代码中。');}catch(e){$('embed-code').textContent='';say('export-status',current?.localImport?'本地 Blob URL 不能带到其他网站。填写部署后的入口，或确认部署权后下载包含本地文件的 ZIP。':e.message);}}
function refresh(){
 for(const id of ['width','height','bottom'])$(id+'-label').textContent=$(id).value+'px';$('zoom-label').textContent=$('zoom').value+'%';
 if(widget&&current){try{const cfg=settings();widget.configure({title:cfg.title,appearance:cfg.appearance,chat:cfg.chat,voice:cfg.voice,models:cfg.models});}catch(e){say('preview-status',e.message);}}
 updateCode();
}
function renderModels(){const query=$('search-model').value.trim().toLowerCase();$('model-list').replaceChildren();for(const m of models.filter(m=>m.name.toLowerCase().includes(query))){const button=document.createElement('button');button.className=m.id===current?.id?'active':'';const title=document.createElement('span');title.textContent=m.name;const tag=document.createElement('small');tag.textContent='MOC3';button.append(title,tag);button.onclick=()=>choose(m);$('model-list').append(button);}say('model-count',models.length+' 个模型');}
function options(id,items,label){const select=$(id);select.replaceChildren();for(const [index,item] of items.entries()){const o=document.createElement('option');o.value=index;o.textContent=label(item);select.append(o);}select.disabled=!items.length;}
function capabilities(){const caps=widget.viewer.listCapabilities();options('motion',caps.motions,m=>(m.group||'默认动作')+' / '+m.index);options('expression',caps.expressions,e=>e.name);$('play-motion').disabled=!caps.motions.length;$('play-expression').disabled=!caps.expressions.length;say('capabilities',`${caps.motions.length} 动作 · ${caps.expressions.length} 表情`);say('voice-note',caps.lipSyncIds.length?'模型已找到口型参数。系统朗读口型按发音事件近似；音频 TTS 按波形驱动。':'当前模型未发现口型参数，仍可朗读。语音与麦克风识别依浏览器而定。');}
async function choose(model){
 const attempt=++selectedSequence;current=model;renderModels();say('selected-model','已选 · '+model.name);say('preview-title',model.name+'，来到你的网页。');say('preview-status','正在加载角色…');say('model-license',model.license?.note||'模型使用范围以原声明和你的权限为准；不自动捆绑仓库资源。');
 try{
  if(!widget){widget=await createLive2DWidget({...settings(),container:$('scene'),manifest:model});await widget.ready;}
  else{refresh();await widget.setModel(model);}
  if(attempt!==selectedSequence)return;if(!widget.viewer.ready)throw new Error('角色未加载，请检查入口、Core 版本或资源 CORS');capabilities();say('preview-status','默认完整角色适配 · 点开角色或“预览聊天”体验嵌入效果');
 }catch(e){if(e.name!=='AbortError'&&attempt===selectedSequence)say('preview-status',e.message);}updateCode();
}
$('search-model').oninput=renderModels;
for(const id of ['companion-title','side','bottom','width','height','zoom','offset-x','offset-y','chat-mode','chat-endpoint','chat-model','voice-enabled','voice-mode','voice-lang','voice-name','voice-endpoint','voice-volume','voice-rate','voice-pitch','allow-switch'])$(id).addEventListener('input',refresh);
$('reset-fit').onclick=()=>{$('zoom').value=100;$('offset-x').value=0;$('offset-y').value=0;refresh();};
$('open-chat').onclick=()=>widget?.open();$('reload-preview').onclick=()=>current&&choose(current);$('pause-preview').onclick=()=>{if(!widget)return;paused=!paused;if(paused)widget.viewer.pause();else widget.viewer.resume();$('pause-preview').textContent=paused?'继续角色':'暂停角色';};
$('use-url').onclick=async()=>{sourceController?.abort();sourceController=new AbortController();say('source-status','读取你的模型入口…');try{const model=await loadModelSource($('own-url').value,{signal:sourceController.signal});await choose(model);say('source-status','入口已读取，文件由你的资源服务器提供。');}catch(e){say('source-status',e.message);}};
$('model-zip').onchange=()=>{$('local-rights').checked=false;$('include-local').checked=false;};
$('import-model').onclick=async()=>{const file=$('model-zip').files[0];if(!file||!$('local-rights').checked){say('source-status','请先选择 ZIP 并确认本地使用权');return;}sourceController?.abort();sourceController=new AbortController();say('source-status','浏览器内校验，没有上传…');try{const pack=await importPackage(file,{signal:sourceController.signal});const previous=localPackage;localPackage=pack;await choose(pack.model);previous?.dispose();say('source-status','已本地预览；文件只在本标签页内存中。');}catch(e){say('source-status',e.message);}};
$('clear-local').onclick=()=>{sourceController?.abort();if(current?.localImport){widget?.viewer.stopFrame();current=null;choose(models.find(m=>m.name==='lafei')||models[0]);}localPackage?.dispose();localPackage=null;$('model-zip').value='';$('local-rights').checked=false;$('include-local').checked=false;say('source-status','已释放本地文件');};
$('own-url').oninput=updateCode;
$('include-local').onchange=updateCode;
$('play-motion').onclick=()=>{try{const m=widget.viewer.listCapabilities().motions[Number($('motion').value)];widget.viewer.playMotion(m);say('preview-status','正在试播动作');}catch(e){say('preview-status',e.message);}};
$('play-expression').onclick=()=>{try{const e=widget.viewer.listCapabilities().expressions[Number($('expression').value)];widget.viewer.setExpression(e.name);say('preview-status','已应用表情');}catch(e){say('preview-status',e.message);}};
$('test-voice').onclick=async()=>{if(!$('voice-enabled').checked){say('preview-status','先开启“朗读回复”，再试听');return;}try{await widget.speak('你好，我会陪你在网页上聊天。');say('preview-status','已请求试听，实际声音取决于浏览器或你的 TTS 服务。');}catch(e){say('preview-status',e.message);}};
function voices(){const old=$('voice-name').value;$('voice-name').replaceChildren();const d=document.createElement('option');d.value='';d.textContent='设备默认声音';$('voice-name').append(d);for(const voice of globalThis.speechSynthesis?.getVoices()||[]){const o=document.createElement('option');o.value=voice.name;o.textContent=voice.name+' · '+voice.lang;$('voice-name').append(o);}$('voice-name').value=old;}
globalThis.speechSynthesis?.addEventListener('voiceschanged',voices);voices();
$('copy-embed').onclick=async()=>{try{const code=embedCode(publicConfig(settings()),moduleURL);$('embed-code').textContent=code;await navigator.clipboard.writeText(code);say('export-status','已复制；粘贴到自己的页面即可。');}catch(e){say('export-status',e.message||'剪贴板不可用，请从代码框手动复制');}};
$('download-js').onclick=()=>{try{const cfg=publicConfig(settings());downloadBlob(new Blob([bootstrapJS(cfg,moduleURL)],{type:'text/javascript'}),'live2d-widget.js');say('export-status','已下载引导 JS；依赖此站组件和完整模型资源 URL，未包含 key。');}catch(e){say('export-status',e.message);}};
$('download-package').onclick=async()=>{exportController?.abort();const controller=new AbortController();exportController=controller;$('download-package').disabled=true;$('cancel-export').hidden=false;say('export-status','正在打包组件代码和公开配置…');try{const result=await buildEmbedPackage(settings(),{localPackage:current.localImport?localPackage:null,includeLocalModel:!!current.localImport&&$('include-local').checked,signal:controller.signal});if(controller.signal.aborted)return;downloadBlob(result.blob,'live2d-widget-package.zip');say('export-status',current.localImport&&$('include-local').checked?'已下载：代码、配置和你确认部署权的本地模型；没有会话 key。':'已下载：代码、配置和示例页面；仓库模型、Core 和会话 key 均未打包。');}catch(e){say('export-status',e.name==='AbortError'?'导出已取消':e.message);}finally{if(exportController===controller){exportController=null;$('download-package').disabled=false;$('cancel-export').hidden=true;}}};
$('cancel-export').onclick=()=>exportController?.abort();
addEventListener('pagehide',()=>{++selectedSequence;sourceController?.abort();exportController?.abort();widget?.dispose();localPackage?.dispose();globalThis.speechSynthesis?.removeEventListener('voiceschanged',voices);},{once:true});
async function start(){try{const response=await fetch(new URL('../catalog/models.json',import.meta.url));if(!response.ok)throw new Error('模型目录不可用');const catalog=await response.json();models=catalog.models.filter(m=>m.format==='moc3').map(m=>({...m,entryUrl:new URL(m.entryUrl,location.href).href,files:m.files.map(f=>({...f,url:new URL(f.url,location.href).href}))}));renderModels();await choose(models.find(m=>m.name==='lafei')||models.find(m=>m.name==='6xb')||models[0]);refresh();}catch(e){say('preview-status',e.message);}}start();
