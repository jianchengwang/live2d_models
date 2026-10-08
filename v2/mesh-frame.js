import {validateMeshProject,meshPositions,playbackValues} from './mesh-project.js?ui=3';
import {createMeshRenderer} from './mesh-renderer.js?ui=3';
const boot=document.body.dataset,token=boot.token||new URLSearchParams(location.search).get('token'),origin=boot.parentOrigin||location.origin;
const send=(type,detail={})=>parent.postMessage({token,type,detail},origin);
let project,renderer,canvas,frame,started=false,paused=false,view={zoom:1,x:0,y:0},lip=0,auto={breath:true,blink:true},overrides={},currentValues={},lastState=-Infinity;
const abort=new AbortController();
function tick(time=performance.now()){if(paused||abort.signal.aborted||!renderer)return;currentValues={...playbackValues(project,time/1000,{...auto,mouth:lip}),...overrides};renderer.draw(currentValues,view);if(time-lastState>=125){lastState=time;send('mesh-state',{values:currentValues,paused:false,auto});}frame=requestAnimationFrame(tick);}
function pause(){paused=true;cancelAnimationFrame(frame);send('paused');if(project)send('mesh-state',{values:currentValues,paused:true,auto});}
function dispose(){pause();abort.abort();renderer?.dispose();}
async function load(payload){if(started)return;started=true;project=validateMeshProject(payload.model.project);view={...view,...payload.view};canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(payload.width*payload.dpr));canvas.height=Math.max(1,Math.round(payload.height*payload.dpr));document.querySelector('#canvas').replaceChildren(canvas);renderer=await createMeshRenderer(canvas,project,{signal:abort.signal});
  send('loaded',{parameters:project.parameters.map(p=>({id:p.id,minimum:0,maximum:1,value:p.default})),lipSyncIds:project.parameters.filter(p=>/mouth.*open/i.test(p.id)).map(p=>p.id),unavailableMotions:[],unavailableExpressions:[],diagnostics:[],coreAcceptance:'not-applicable',renderer:'Studio editable mesh2d',note:'网页网格项目已加载；没有转换成 moc3'});tick();canvas.onclick=()=>send('hit');}
addEventListener('message',async event=>{if(event.source!==parent||event.origin!==origin||event.data?.token!==token)return;const {command,payload}=event.data;try{
 if(command==='load')await load(payload);else if(command==='pause')pause();else if(command==='resume'){if(paused){paused=false;tick();send('resumed');}}
 else if(command==='view')view={...view,...payload};else if(command==='resize'&&canvas){canvas.width=Math.max(1,Math.round(payload.width*payload.dpr));canvas.height=Math.max(1,Math.round(payload.height*payload.dpr));if(paused)renderer.draw(currentValues,view);}
 else if(command==='lip-sync')lip=Math.max(0,Math.min(1,Number(payload.value)||0));else if(command==='mesh-parameter'){if(!project.parameters.some(p=>p.id===payload.id))throw new Error('未声明的网格参数');overrides[payload.id]=Math.max(0,Math.min(1,Number(payload.value)||0));if(paused){currentValues={...currentValues,...overrides};renderer.draw(currentValues,view);}}
 else if(command==='mesh-playback'){const next={breath:payload.breath===true,blink:payload.blink===true};for(const p of project?.parameters||[])if(/breath/i.test(p.id)&&next.breath!==auto.breath||/eye.*open/i.test(p.id)&&next.blink!==auto.blink)delete overrides[p.id];auto=next;}
 else if(command==='dispose')dispose();
}catch(error){dispose();send('error',{message:error.message});}});
addEventListener('pagehide',dispose,{once:true});window.meshPlaybackDiagnostics=()=>project?{renderer:'Studio editable mesh2d',values:currentValues,layerCount:project.layers.length,positions:project.layers.map(l=>({id:l.id,positions:meshPositions(l,currentValues)})),paused}:null;send('frame-ready');
