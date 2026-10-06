import {Live2DViewer} from '../v2/sdk.js';
import {stages,createJob,recordLayers,advanceJob,acceptModel,agentRequest} from '../v2/pipeline.js';
import {importPackage} from '../v2/importer.js';
import {Conversation} from '../v2/conversation.js';
import {BehaviorMap} from '../v2/behavior.js';
const $ = id => document.getElementById(id);
const viewer = new Live2DViewer($('viewer'));
const conversation=new Conversation(),behavior=new BehaviorMap(viewer);let chatController,history=[];
let models = [], current = null, coreAccepted = new Set(), selectedZip, imageMeta, job;
let selection = 0, importController;const importedPackages=new Map();
const label = (node,text) => { node.textContent = text; };
const formatBytes = n => n >= 1048576 ? `${(n/1048576).toFixed(1)} MiB` : `${(n/1024).toFixed(1)} KiB`;
const status = text => label($('global-status'),text);
function tab(name) {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active',b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden',p.id !== `${name}-tab`));
  if (name !== 'models') viewer.pause(); else viewer.resume();
}
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click',()=>tab(b.dataset.tab)));
function renderList() {
  const query = $('search').value.trim().toLowerCase();
  const results = models.filter(m => (!$('format').value || m.format === $('format').value)
    && (!$('license').value || m.license.status === $('license').value)
    && (!$('complete-only').checked || m.validation.referencesComplete)
    && (!query || [m.name,m.entryUrl,...m.motions.map(x => x.label)].join(' ').toLowerCase().includes(query)));
  label($('total-count'),models.length); label($('result-count'),`${results.length} 个结果`);
  $('model-list').replaceChildren();
  for (const model of results) {
    const item = document.createElement('div'); item.setAttribute('role','listitem');
    const button = document.createElement('button'); button.className = `model-item${current?.id === model.id ? ' active' : ''}`;
    button.setAttribute('aria-label',`选择 ${model.name}`);
    const avatar = document.createElement('span'); avatar.className='avatar'; label(avatar,model.name.slice(0,1).toUpperCase());
    const text = document.createElement('span'); text.className='model-text';
    const name = document.createElement('strong'); label(name,model.name);
    const info = document.createElement('small'); label(info,`${model.format.toUpperCase()} · ${model.motions.length} 动作 · ${model.localImport ? '本地导入' : model.license.status === 'restricted' ? '限制声明' : '授权待核实'}`);
    text.append(name,info);
    const dot = document.createElement('span'); dot.className = `status-dot${model.validation.referencesComplete ? '' : ' warn'}`;
    button.append(avatar,text,dot); button.addEventListener('click',()=>selectModel(model)); item.append(button); $('model-list').append(item);
  }
  if (!results.length) { const p=document.createElement('p');p.className='empty';label(p,'没有符合筛选条件的模型');$('model-list').append(p); }
}
['search','format','license','complete-only'].forEach(id => $(id).addEventListener('input',renderList));
function options(select,items,display) {
  select.replaceChildren();
  items.forEach((item,index) => { const option=document.createElement('option');option.value=index;label(option,display(item));select.append(option); });
  if (!items.length) { const option=document.createElement('option');label(option,'此模型未声明');select.append(option); }
  select.disabled = !items.length;
}
async function selectModel(model) {
  const attempt = ++selection; current = model;
  renderList(); label($('model-name'),model.name);label($('model-format'),model.format.toUpperCase());
  label($('motion-count'),model.motions.length);label($('expression-count'),model.expressions.length);
  label($('lip-count'),model.lipSyncIds?.length || 0);label($('dependency-count'),model.files.length);
  $('entry-url').value=new URL(model.entryUrl,location.href).href;
  label($('license-note'),model.license.note || '逐模型许可待核实；仅供本地预览');
  options($('motion'),model.motions,m=>`${m.label} · ${m.group || '(空组)'} / ${m.index}`);
  options($('expression'),model.expressions,e=>e.name);
  $('play-motion').disabled=true; $('play-expression').disabled=true;
  label($('action-status'),'等待模型加载');label($('core-note'),model.validation.note || 'Core 验收待完成');
  $('runtime-issues').replaceChildren();$('runtime-diagnostics').classList.add('hidden');
  $('issues').replaceChildren();
  for(const issue of model.issues) {const li=document.createElement('li');label(li,issue.message);$('issues').append(li);}
  if(!model.issues.length){const li=document.createElement('li');label(li,'声明依赖完整；不代表视觉和公开许可已通过');$('issues').append(li);}
  label($('file-summary'),` · ${model.files.length} 项`);$('file-list').replaceChildren();
  for(const file of model.files){const row=document.createElement('div');row.className='file-row';label(row,`${file.path} · ${formatBytes(file.bytes)}`);const hash=document.createElement('code');label(hash,file.sha256);row.append(hash);$('file-list').append(row);}
  $('preview-status').classList.remove('hidden');label($('preview-status'),'加载本地 Core 与模型依赖…');
  try {
    if(model.previewAvailable===false)throw new Error('此构建仅含目录元信息；未再分发旧模型或 Core');
    const result = await viewer.load({...model,previewCompatibility:$('preview-compatibility').checked});
    if(attempt !== selection)return;
  } catch(error) {
    if(attempt !== selection || error.name === 'AbortError')return;
    label($('preview-status'),error.message);label($('action-status'),'预览未就绪');status('预览问题已记录，旧资源未变');
  }
}
viewer.addEventListener('loading',()=>{if(current)coreAccepted.delete(current.id);renderPipeline();});
viewer.addEventListener('loaded',e=>{
  if(!current || viewer.model?.id !== current.id)return;
  coreAccepted.add(current.id);$('preview-status').classList.add('hidden');
  current.unavailableMotions=e.detail.unavailableMotions || [];
  $('runtime-issues').replaceChildren();const diagnostics=[...new Set(e.detail.diagnostics || [])];
  $('runtime-diagnostics').classList.toggle('hidden',!diagnostics.length);$('runtime-summary').textContent=`动作兼容诊断 · ${diagnostics.length} 项`;
  for(const item of diagnostics){const li=document.createElement('li');li.textContent=item;$('runtime-issues').append(li);}
  $('motion-count').textContent=viewer.listCapabilities().motions.length;
  for(const option of $('motion').options){const m=current.motions[Number(option.value)];option.disabled=current.unavailableMotions.some(x=>x.group===m?.group && x.index===m?.index);}
  const available=[...$('motion').options].find(o=>!o.disabled);if(available)$('motion').value=available.value;
  $('play-motion').disabled=!viewer.listCapabilities().motions.length;$('play-expression').disabled=!current.expressions.length;
  label($('core-note'),`Core 已接受 · ${e.detail.parameters.length} 个真实参数 · 视觉效果需人工确认`);
  label($('action-status'),viewer.listCapabilities().motions.length?'模型就绪，可选择准确动作试播':'Core 已加载；此模型没有可安全试播的动作');renderPipeline();
});
viewer.addEventListener('error',e=>{ if(current)coreAccepted.delete(current.id);renderPipeline();$('preview-status').classList.remove('hidden');label($('preview-status'),e.detail.message);$('play-motion').disabled=true;$('play-expression').disabled=true; });
$('motion').addEventListener('change',()=>{$('play-motion').disabled=!viewer.ready || $('motion').selectedOptions[0]?.disabled;});
viewer.addEventListener('action-error',e=>label($('action-status'),e.detail.message));
viewer.addEventListener('motion-start',e=>label($('action-status'),`已试播 ${e.detail.group || '(空组)'} / ${e.detail.index}`));
viewer.addEventListener('expression-start',e=>label($('action-status'),`已应用表情 ${e.detail.name}`));
viewer.addEventListener('context-lost',()=>{if(current)coreAccepted.delete(current.id);renderPipeline();$('play-motion').disabled=true;$('play-expression').disabled=true;label($('core-note'),'WebGL context 丢失，已暂停，等待恢复');});
viewer.addEventListener('context-restored',()=>label($('core-note'),'WebGL context 恢复，重新加载模型'));
$('preview-compatibility').addEventListener('change',()=>current && selectModel(current));
$('pause').addEventListener('click',()=>{viewer.pause();label($('action-status'),'已暂停帧更新');});
$('resume').addEventListener('click',()=>{viewer.resume();label($('action-status'),'已继续帧更新');});
$('reload').addEventListener('click',()=>current && selectModel(current));
$('play-motion').addEventListener('click',()=>{try{viewer.playMotion(current.motions[Number($('motion').value)]);}catch(e){label($('action-status'),e.message);}});
$('play-expression').addEventListener('click',()=>{try{viewer.setExpression(current.expressions[Number($('expression').value)].name);}catch(e){label($('action-status'),e.message);}});
$('copy-config').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(JSON.stringify({entryUrl:new URL(current.entryUrl,location.href).href,format:current.format,licenseStatus:current.license.status,sessionOnly:!!current.localImport},null,2));status('接入配置已复制');}catch{status('剪贴板不可用，请复制入口字段');}
});
function updateImport(){ $('import-button').disabled=!selectedZip || !$('rights-confirm').checked; }
$('zip-file').addEventListener('change',()=>{selectedZip=$('zip-file').files[0];$('rights-confirm').checked=false;label($('zip-name'),selectedZip ? `${selectedZip.name} · ${formatBytes(selectedZip.size)}` : '未选择 ZIP');updateImport();});
$('rights-confirm').addEventListener('change',updateImport);
$('import-button').addEventListener('click',async()=>{
  $('import-button').disabled=true;label($('import-status'),'校验本地数据包…');
  try {
    if(selectedZip.size>64*1048576)throw new Error('ZIP 超过 64 MiB');
    importController=new AbortController();$('cancel-import').disabled=false;
    const pack=await importPackage(selectedZip,{signal:importController.signal});const result={model:pack.model,note:'已在浏览器内完成包校验；没有上传，等待 Core 与视觉验收'};
    importedPackages.set(pack.model.id,pack);
    models=models.filter(m=>m.id!==result.model.id);models.push(result.model);
    label($('import-status'),result.note);status('导入通过结构检查，等待 Core 验收');tab('models');await selectModel(result.model);
  }catch(e){label($('import-status'),`导入被拒绝：${e.message}`);}finally{importController=null;$('cancel-import').disabled=true;updateImport();}
});
$('cancel-import').addEventListener('click',()=>importController?.abort());
$('forget-imports').addEventListener('click',()=>{importController?.abort();selectedZip=null;$('zip-file').value='';$('zip-name').textContent='未选择 ZIP';updateImport();if(current?.localImport){++selection;viewer.stopFrame();current=null;$('entry-url').value='';$('file-list').replaceChildren();$('issues').replaceChildren();$('runtime-issues').replaceChildren();$('runtime-diagnostics').classList.add('hidden');options($('motion'),[],()=>{});options($('expression'),[],()=>{});for(const id of ['motion-count','expression-count','lip-count','dependency-count'])$(id).textContent='0';$('model-name').textContent='请选择模型';$('preview-status').textContent='本地包已释放';$('preview-status').classList.remove('hidden');$('play-motion').disabled=true;$('play-expression').disabled=true;}for(const [id,pack] of importedPackages){pack.dispose();coreAccepted.delete(id);}importedPackages.clear();models=models.filter(m=>!m.localImport);renderList();renderPipeline();status('已释放所有导入包及 Blob URL');});
async function setImage(file) {
  imageMeta=null;$('create-job').disabled=true;
  try {
    if(!file || file.size>16*1048576)throw new Error('请选择 ≤16 MiB 的 PNG/JPEG');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const png=bytes.length>=24 && [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
    const jpg=bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    if(!png && !jpg)throw new Error('不是 PNG/JPEG 文件头');
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    imageMeta={name:file.name,bytes:file.size,sha256:Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('')};
    label($('source-name'),`${file.name} · ${formatBytes(file.size)} · 图片仅本地读取`);$('create-job').disabled=false;
  }catch(e){label($('source-name'),e.message);}
}
$('source-image').addEventListener('change',()=>setImage($('source-image').files[0]));
$('sample-image').addEventListener('click',()=>{
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const c=canvas.getContext('2d');
  c.fillStyle='#eff3df';c.fillRect(0,0,64,64);c.fillStyle='#75936a';c.beginPath();c.arc(32,32,19,0,Math.PI*2);c.fill();
  canvas.toBlob(blob=>setImage(new File([blob],'synthetic-circle.png',{type:'image/png'})),'image/png');
});
$('create-job').addEventListener('click',()=>{job=createJob(imageMeta);renderPipeline();label($('pipeline-status'),'任务已创建；没有自动分层或外部代理调用');});
$('agent-request').addEventListener('click',()=>{label($('agent-json'),JSON.stringify(agentRequest(job),null,2));$('agent-json').classList.remove('hidden');});
function actionButton(text,fn){const b=document.createElement('button');b.className='primary';label(b,text);b.addEventListener('click',()=>{try{fn();renderPipeline();label($('pipeline-status'),'记录已更新；没有自动执行 Editor 操作');}catch(e){label($('pipeline-status'),e.message);}});return b;}
function renderPipeline(){
  $('agent-request').disabled=!job;label($('job-id'),job ? job.id.slice(0,8) : '尚未创建任务');$('pipeline-stages').replaceChildren();$('pipeline-actions').replaceChildren();
  const index=job ? stages.findIndex(s=>s[0]===job.stage) : -1;
  stages.forEach(([key,title,description],i)=>{const li=document.createElement('li');li.className=i<index?'done':i===index?'current':'';label(li,title);const small=document.createElement('small');label(small,description);li.append(small);$('pipeline-stages').append(li);});
  if(!job)return;
  const actions=$('pipeline-actions');
  if(job.stage==='layering_pending'){
    const p=document.createElement('p');p.className='muted';label(p,'录入实际分层清单 JSON。此步骤不会验证 PSD 像素内容。');actions.append(p);
    const text=document.createElement('textarea');text.setAttribute('aria-label','分层清单 JSON');text.placeholder='{"layers":[{"name":"head","role":"头部"}]}';actions.append(text);
    actions.append(actionButton('记录分层清单',()=>{job=recordLayers(job,JSON.parse(text.value));}));
  } else if(['review_required','rigging_required','export_required'].includes(job.stage)){
    const text=document.createElement('textarea');text.setAttribute('aria-label','人工检查或 Editor 操作记录');text.placeholder=job.stage==='review_required'?'填写层关系、边缘与权利检查记录…':'填写在合法 Editor 中完成操作的人工记录（未自动核验）…';actions.append(text);
    const action={review_required:'review',rigging_required:'rig',export_required:'export'}[job.stage];
    const title={review:'确认人工层检查',rig:'记录已在 Editor 绑定',export:'记录已由 Editor 导出'}[action];
    actions.append(actionButton(title,()=>{job=advanceJob(job,action,text.value);}));
  } else if(job.stage==='validation_required'){
    const p=document.createElement('p');p.className='muted';label(p,'在导入页选择真实 ZIP，并在模型库加载成功。验收使用当前选择的本地导入模型。');actions.append(p);
    const link=document.createElement('button');label(link,'前往导入模型包');link.addEventListener('click',()=>tab('import'));actions.append(link);
    const check=document.createElement('label');check.className='check rights-check';const input=document.createElement('input');input.type='checkbox';check.append(input,document.createTextNode('已检查模型、纹理、动作与视觉效果'));actions.append(check);
    const accept=actionButton('完成本地 moc3 验收',()=>{job=acceptModel(job,current,coreAccepted.has(current?.id),input.checked);});
    accept.disabled=!current?.localImport || !coreAccepted.has(current?.id);actions.append(accept);
  } else {const p=document.createElement('p');p.className='callout';label(p,`本地验收完成 · ${job.modelId}。公开发布许可仍未确认。`);actions.append(p);}
}
addEventListener('pagehide',()=>{viewer.destroy();importController?.abort();chatController?.abort();conversation.clear();for(const pack of importedPackages.values())pack.dispose();},{once:true});

const behaviorEvent=event=>{try{if(coreAccepted.has(current?.id))behavior.apply(event);}catch(error){$('behavior-status').textContent=error.message;}};
$('provider-form').addEventListener('submit',event=>{
 event.preventDefault();chatController?.abort();history=[];
 try{conversation.configure({mode:$('provider-mode').value,endpoint:$('endpoint').value,model:$('chat-model').value,key:$('api-key').value,trusted:$('trust-endpoint').checked});$('chat-status').textContent=conversation.summary.mode==='mock'?'本地 mock 已就绪':'已配置直连 '+new URL(conversation.summary.endpoint).origin+'；key 仅当前内存';}catch(error){$('chat-status').textContent=error.message;}finally{$('api-key').value='';}
});
$('clear-key').addEventListener('click',()=>{chatController?.abort();conversation.clear();history=[];$('api-key').value='';$('provider-mode').value='mock';$('trust-endpoint').checked=false;$('chat-output').textContent='';$('chat-input').value='';$('chat-status').textContent='已清除 key 和会话；恢复 mock';});
$('apply-behavior').addEventListener('click',()=>{try{behavior.configure(JSON.parse($('behavior-profile').value));$('behavior-status').textContent='映射已更新；模型未声明的动作和表情会被拒绝';}catch(error){$('behavior-status').textContent=error.message;}});
$('cancel-chat').addEventListener('click',()=>chatController?.abort());
$('chat-form').addEventListener('submit',async event=>{
 event.preventDefault();if(chatController)return;const text=$('chat-input').value.trim();if(!text)return;
 chatController=new AbortController();const controller=chatController;$('send-chat').disabled=true;$('cancel-chat').disabled=false;$('chat-output').textContent='';$('chat-status').textContent='正在生成…';behaviorEvent('thinking');
 try{const reply=await conversation.stream([...history,{role:'user',content:text}],{signal:controller.signal,onText:output=>{$('chat-output').textContent=output;}});history=[...history,{role:'user',content:text},{role:'assistant',content:reply}].slice(-12);$('chat-status').textContent='回复完成';behaviorEvent('complete');}
 catch(error){$('chat-status').textContent=error.name==='AbortError'?'生成已取消':error.message;if(error.name!=='AbortError')behaviorEvent('error');}
 finally{if(chatController===controller){chatController=null;$('send-chat').disabled=false;$('cancel-chat').disabled=true;}}
});

try {
  const response=await fetch(new URL('../catalog/models.json',import.meta.url));if(!response.ok)throw new Error('静态目录读取失败');const catalog=await response.json();models=catalog.models;renderList();renderPipeline();
  const initial=models.find(m=>m.name==='yichui_2') || models.find(m=>m.format==='moc3' && m.validation.referencesComplete);
  if(initial && initial.previewAvailable!==false)await selectModel(initial);else {$('preview-status').textContent='静态目录就绪；本地导入模型包可检查。预览运行时需发布许可核实。';status('纯静态工作台就绪');}
}catch(e){status(`工作台初始化失败：${e.message}`);}

