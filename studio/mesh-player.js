import {createLive2DWidget} from '../v2/widget.js';
import {validateMeshProject,meshModel} from '../v2/mesh-project.js';
import {makeMeshDemo} from './mesh-demo.js';
const $=id=>document.getElementById(id);let widget,url,turn=0,paused=false;
const say=text=>$('status').textContent=text;
async function open(raw){const token=++turn,project=validateMeshProject(raw),nextURL=URL.createObjectURL(new Blob([JSON.stringify(project)],{type:'application/json'}));const previous=widget;previous?.dispose();if(url)URL.revokeObjectURL(url);url=nextURL;
  widget=await createLive2DWidget({container:$('preview'),manifest:meshModel(project,url,{localImport:true}),title:project.name,appearance:{width:330,height:500,side:'right',bottom:24,gutter:20},chat:{mode:'unconfigured'},voice:{enabled:false}});await widget.ready;if(token!==turn)return;if(!widget.viewer.ready)throw new Error(widget.viewer.lastError||'网格项目加载失败');
  paused=false;$('pause').textContent='暂停角色';$('project-name').textContent=project.name;$('parameters').replaceChildren();for(const p of project.parameters){const label=document.createElement('label'),range=document.createElement('input'),output=document.createElement('output');label.textContent=p.name+' · '+p.id;range.type='range';range.min=0;range.max=1;range.step=.01;range.value=p.default;range.dataset.parameter=p.id;range.setAttribute('aria-label',p.name);output.value=p.default.toFixed(2);range.oninput=()=>{output.value=Number(range.value).toFixed(2);widget.viewer.setMeshParameter(p.id,Number(range.value));};label.append(output,range);$('parameters').append(label);}auto();say('项目已加载。网页播放器正在使用保存的网格端点。');}
function auto(){widget?.viewer.command('mesh-playback',{breath:$('auto-breath').checked,blink:$('auto-blink').checked});}
$('auto-breath').onchange=auto;$('auto-blink').onchange=auto;
$('project-file').onchange=async()=>{const file=$('project-file').files[0];if(!file)return;try{if(file.size>64*1024*1024)throw new Error('项目超过 64 MiB');await open(JSON.parse(await file.text()));}catch(e){say(e.message);}finally{$('project-file').value='';}};
$('demo').onclick=()=>open(makeMeshDemo()).catch(e=>say(e.message));$('pause').onclick=()=>{if(!widget)return;paused=!paused;paused?widget.viewer.pause():widget.viewer.resume();$('pause').textContent=paused?'继续播放':'暂停角色';};
addEventListener('pagehide',()=>{widget?.dispose();if(url)URL.revokeObjectURL(url);});window.meshPlayerDiagnostics=()=>({ready:widget?.viewer.ready,error:widget?.viewer.lastError,manifest:widget?.viewer.model,capabilities:widget?.viewer.listCapabilities()});
