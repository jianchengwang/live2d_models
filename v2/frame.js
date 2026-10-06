import {prepareMotion} from './motion-validation.js';
import {containTransform,drawableBounds} from './fit.js';
import {responseBytes} from './model-source.js';
import {textureDimensions} from './importer.js';
const boot=document.body.dataset;
const token = boot.token || new URLSearchParams(location.search).get('token');
const hostOrigin=boot.parentOrigin||location.origin;
const send = (type, detail = {}) => parent.postMessage({token,type,detail}, hostOrigin);
let view={zoom:1,x:0,y:0},bounds,lip=0;
let fetchedBytes=0,decodedTextureBytes=0;const textureURLs=new Map();
let unsupportedGroups=new Set();
let viewer, manifest, config, paused = false, started = false, failed = false;
const abort = new AbortController();
const nativeFetch = window.fetch.bind(window);
const nativeRaf = window.requestAnimationFrame.bind(window);
const nativeCancel = window.cancelAnimationFrame.bind(window);
const queued = new Map(), active = new Map(); let frameId = 0;
const schedule = id => active.set(id, nativeRaf(time => {
  active.delete(id); const cb = queued.get(id); queued.delete(id); if (cb) cb(time);
}));
window.requestAnimationFrame = cb => { const id = ++frameId; queued.set(id,cb); if (!paused) schedule(id); return id; };
window.cancelAnimationFrame = id => { nativeCancel(active.get(id)); active.delete(id); queued.delete(id); };
function pause() { paused = true; for (const id of active.values()) nativeCancel(id); active.clear(); send('paused'); }
function resume() { if (!paused) return; paused = false; for (const id of queued.keys()) schedule(id); send('resumed'); }
function fail(error) { if (failed) return; failed = true; pause(); abort.abort(); send('error',{message:/createModel/.test(error?.message || '')?'当前旧 Core 无法接受此 moc3，可能版本不兼容或二进制无效；未自动替换 Core':error?.message || String(error)}); }
addEventListener('error', e => fail(e.error || new Error(e.message)));
addEventListener('unhandledrejection', e => fail(e.reason));

const virtualRoot=new URL(`./virtual/${token}/`,import.meta.url);
const virtualPrefix=new URL('model/',virtualRoot).pathname;
let allowed = new Set();
function mapUrl(raw) {
  const url = new URL(raw, import.meta.url);
  if (url.search || url.hash) throw new Error('拒绝带查询参数的模型依赖');
  if (url.pathname.startsWith(virtualPrefix)) {
    const tail = url.pathname.slice(virtualPrefix.length).replace(/^\/+/, '');
    if (tail === 'model.model3.json') return manifest.entryUrl;
    if(manifest.localImport){const base=manifest.entryPath.includes('/')?manifest.entryPath.slice(0,manifest.entryPath.lastIndexOf('/')+1):'';const file=manifest.files.find(f=>f.path===base+decodeURIComponent(tail));if(!file)throw new Error('本地包没有声明此依赖');return file.url;}
    return new URL(tail,new URL('.',manifest.entryUrl)).href;
  }
  return url.href;
}
function authorized(raw) {
  const url = mapUrl(raw);
  if (!allowed.has(url)) throw new Error('拒绝未声明的依赖路径');
  return url;
}
const cache = new Map(),motionBodies=new Map();
window.fetch = async raw => {
  try {
    const url = authorized(typeof raw === 'string' || raw instanceof URL ? raw : raw.url);
    if(motionBodies.has(url))return new Response(JSON.stringify(motionBodies.get(url)),{headers:{'Content-Type':'application/json'}});
    if (url === manifest.entryUrl) return new Response(JSON.stringify(config), {headers:{'Content-Type':'application/json'}});
    if (!cache.has(url)) cache.set(url, readResource(url));
    const item = await cache.get(url); return new Response(item.buffer.slice(0),{headers:{'Content-Type':item.type || 'application/octet-stream'}});
  } catch(error) { fail(error); throw error; }
};
// The frozen renderer loads textures via Image, not fetch. Validate that transport too.
const imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
async function readResource(url){const response=await nativeFetch(url,{signal:abort.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'}),bytes=await responseBytes(response);fetchedBytes+=bytes.length;if(fetchedBytes>256*1024*1024)throw new Error('模型依赖总读取超过 256 MiB');return {buffer:bytes.buffer,type:response.headers.get('Content-Type')};}
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  get:imageSrc.get, configurable:true,
  set(value) {
    try { const url = authorized(value); this.addEventListener('error', () => fail(new Error('纹理加载失败')), {once:true});
      if(!textureURLs.has(url))textureURLs.set(url,readResource(url).then(item=>{const [w,h]=textureDimensions(new Uint8Array(item.buffer));decodedTextureBytes+=w*h*4;if(!w||!h||w>8192||h>8192||decodedTextureBytes>256*1024*1024)throw new Error('纹理解码预算超限');const blob=URL.createObjectURL(new Blob([item.buffer],{type:item.type||'image/png'}));return blob;}));
      textureURLs.get(url).then(blob=>{if(!abort.signal.aborted)imageSrc.set.call(this,blob);}).catch(fail);
    }
    catch(error) { fail(error); }
  }
});

async function loadRuntime(){
  const response=await nativeFetch(new URL('./runtime.json',import.meta.url),{signal:abort.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error('预览运行时配置未就绪');
  const runtime=JSON.parse(new TextDecoder().decode(await responseBytes(response,8192)));if(runtime.available!==true)throw new Error('当前 artifact 未分发 Core；需先核实预览应用发布许可');
  const runtimeRoot=boot.runtimeBase?new URL(boot.runtimeBase):new URL('../',import.meta.url);
  for(const path of ['assets/js/lib/live2dcubismcore.min.js','assets/js/live2dv3.js']){
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL(path,runtimeRoot).href;script.onload=resolve;script.onerror=()=>reject(new Error('预览运行时不可用；检查资源地址与页面 CSP'));document.head.append(script);});
  }
}
async function load({model,dpr,width=innerWidth,height=innerHeight,view:requestedView}) {
  if (started) return; started = true; manifest = model;
  view={...view,...requestedView};
  allowed = new Set([model.entryUrl, ...model.files.map(f => f.url)]);
  const response = await nativeFetch(model.entryUrl,{signal:abort.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
  if (!response.ok || response.redirected) throw new Error('模型配置读取失败');
  config = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await responseBytes(response,4*1024*1024)));
  await loadRuntime();
  if(typeof Live2DCubismCore==='undefined' || typeof L2dViewer==='undefined')throw new Error('预览运行时未包含在当前构建；需先核实 Core 发布许可');
  for (let i=0;i<100;i++) {
    try { if (Live2DCubismCore.Version.csmGetVersion()) break; } catch {}
    if (i === 99) throw new Error('本地 Core 初始化失败');
    await new Promise(resolve => setTimeout(resolve,20));
  }
  unsupportedGroups=new Set();const diagnostics=[];
  for(const motion of manifest.motions){
    try{const file=manifest.files.find(f=>f.kind==='motion' && (f.path.endsWith('/'+motion.file) || f.path===motion.file));if(!file)throw new Error('动作文件未声明');const response=await window.fetch(file.url);const prepared=prepareMotion(await response.json(),{compatibility:!!manifest.previewCompatibility});if(prepared.normalized){motionBodies.set(new URL(file.url,location.href).href,prepared.data);diagnostics.push(`${motion.file}: 当前预览内已校正计数；原文件及 hash 保持不变`);}}
    catch(error){unsupportedGroups.add(motion.group);diagnostics.push(`${motion.file}: ${error.message}`);}
  }
  config=structuredClone(config);
  for(const group of unsupportedGroups)delete config.FileReferences.Motions[group];
  const unavailableMotions=manifest.motions.filter(m=>unsupportedGroups.has(m.group));
  // Absolute URLs remain in the allowlist; virtual paths are mapped only inside this frame.
  viewer = new L2dViewer({el:document.getElementById('canvas'),modelHomePath:virtualRoot.href,model:'model',
    width:Math.max(1,Math.round(width*dpr)),height:Math.max(1,Math.round(height*dpr)),autoMotion:false,
    _finishedLoadModel:() => {
      const model = viewer.getModel(), core = model._model, parameters = [];
      for (let i=0;i<Math.min(core.getParameterCount?.() || 0,256);i++) {
        const id = core.getParameterId?.(i) || core._parameterIds?.at?.(i);
        parameters.push({id:typeof id === 'string' ? id : id?.getString?.().s || core._model?.parameters?.ids?.[i] || `parameter-${i}`,
          minimum:core.getParameterMinimumValue(i), maximum:core.getParameterMaximumValue(i),
          value:core.getParameterValueByIndex(i)});
      }
      bounds=drawableBounds(core);
      const lipIds=(manifest.lipSyncIds?.length?manifest.lipSyncIds:parameters.filter(p=>/mouth.*open|open.*mouth/i.test(p.id)).map(p=>p.id)).filter(id=>parameters.some(p=>p.id===id));
      const lipIndices=lipIds.map(id=>parameters.findIndex(p=>p.id===id));
      const update=model.update.bind(model);model.update=()=>{update();if(lipIndices.length){for(const i of lipIndices)core.setParameterValueByIndex(i,parameters[i].minimum+lip*(parameters[i].maximum-parameters[i].minimum));core.update();}};
      const draw=model.draw.bind(model);model.draw=matrix=>{applyView();draw(matrix);};applyView();
      send('loaded',{parameters,bounds,lipSyncIds:lipIds,unavailableMotions,diagnostics,coreAcceptance:'accepted',note:'模型已加载；默认完整角色适配'});
    }});
  window._onTap = () => send('hit'); // Avoid the frozen constructor's _onTab typo.
  const canvas = document.querySelector('canvas');if(!canvas)throw new Error('renderer 未创建 canvas');
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); pause(); send('context-lost'); });
  canvas.addEventListener('webglcontextrestored', () => { send('context-restored'); location.reload(); });
}
function applyView(){if(!bounds||!viewer)return;const canvas=document.querySelector('canvas'),matrix=viewer.getModel()?.getModelMatrix();if(!canvas||!matrix)return;const t=containTransform(bounds,canvas.width,canvas.height,view),a=matrix.getArray();a.fill(0);a[0]=a[5]=t.scale;a[10]=a[15]=1;a[12]=t.tx;a[13]=t.ty;}
function dispose(){pause();abort.abort();try{viewer?.getModel()?.release?.();}catch{}for(const promise of textureURLs.values())promise.then(url=>URL.revokeObjectURL(url)).catch(()=>{});textureURLs.clear();cache.clear();motionBodies.clear();}
addEventListener('pagehide',dispose,{once:true});
addEventListener('message', async event => {
  if (event.source !== parent || event.origin !== hostOrigin || event.data?.token !== token) return;
  const {command,payload} = event.data;
  try {
    if (command === 'load') await load(payload);
    else if (command === 'pause') pause();
    else if (command === 'resume') resume();
    else if(command==='view'){view={...view,...payload};applyView();}
    else if(command==='resize'){const c=document.querySelector('canvas');if(c){c.width=Math.max(1,Math.round(payload.width*payload.dpr));c.height=Math.max(1,Math.round(payload.height*payload.dpr));applyView();}}
    else if(command==='lip-sync')lip=Math.max(0,Math.min(1,Number(payload.value)||0));
    else if(command==='dispose')dispose();
    else if (command === 'motion') {
      if (unsupportedGroups.has(payload.group) || !manifest.motions.some(m => m.group === payload.group && m.index === payload.index)) throw new Error('无效动作');
      const handle = viewer.getModel()?.startMotion(payload.group,payload.index,payload.priority,()=>{});
      if (handle === -1) throw new Error('动作被优先级阻止');
      send('motion-start',payload);
    } else if (command === 'expression') {
      if (!manifest.expressions.some(e => e.name === payload.name)) throw new Error('无效表情');
      viewer.getModel()?.setExpression(payload.name); send('expression-start',payload);
    }
  } catch(error) { if (command === 'load') fail(error); else send('action-error',{message:error.message}); }
});
send('frame-ready');
