import {validateMeshProject,meshModel} from './mesh-project.js';
export function publicUrl(value,base=globalThis.location?.href||import.meta.url){
  const url=new URL(value,base);
  const parent=new URL(base),loopback=u=>['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&(url.origin===parent.origin||loopback(url)&&loopback(parent)))))throw new Error('资源地址需要无密钥、查询和片段的 HTTPS URL；本地同源 HTTP 可用于开发');
  return url.href;
}
export async function responseBytes(response,limit=64*1024*1024){
  if(!response.ok||response.redirected)throw new Error(`模型资源读取失败 (${response.status})`);
  if(Number(response.headers.get('content-length'))>limit)throw new Error('模型资源超过读取上限');
  const reader=response.body?.getReader();if(!reader){const data=new Uint8Array(await response.arrayBuffer());if(data.length>limit)throw new Error('模型资源超过读取上限');return data;}
  let bytes=0;const chunks=[];
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>limit)throw new Error('模型资源超过读取上限');chunks.push(part.value);}const out=new Uint8Array(bytes);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
export async function loadModelSource(value,{base=globalThis.location?.href,signal}={}){
  const entryUrl=publicUrl(value,base);if(new URL(entryUrl).pathname.endsWith('.mesh2d.json')){const response=await fetch(entryUrl,{signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'}),project=validateMeshProject(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await responseBytes(response,64*1024*1024))));return meshModel(project,entryUrl);}if(!new URL(entryUrl).pathname.endsWith('.model3.json'))throw new Error('请使用完整 model3.json 入口，不是单个 moc3 文件');
  let config;
  try{const response=await fetch(entryUrl,{signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await responseBytes(response,4*1024*1024)));}
  catch(error){if(error.name==='AbortError')throw error;if(error instanceof TypeError)throw new Error('模型 URL 无法读取：资源服务器需允许当前网站 CORS；不会使用公共代理');throw error;}
  const fr=config.FileReferences;if(config.Version!==3||!fr||typeof fr.Moc!=='string'||!Array.isArray(fr.Textures)||!fr.Textures.length)throw new Error('模型入口缺少 Moc/Textures');
  const files=[],motions=[],expressions=[],seen=new Set();
  const add=(kind,ref)=>{
    if(typeof ref!=='string'||!ref||/[:\\%\x00-\x1f]/.test(ref)||ref.startsWith('/')||ref.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('模型引用需为包内相对路径');
    const expected={moc:/\.moc3$/,texture:/\.(png|jpe?g)$/i,sound:/\.(wav|mp3|ogg)$/i};if(!(expected[kind]||/\.json$/).test(ref))throw new Error('模型引用类型不支持');
    const url=publicUrl(ref,entryUrl);if(!seen.has(url)){files.push({kind,path:decodeURIComponent(new URL(url).pathname),ref,url});seen.add(url);}return url;
  };
  add('moc',fr.Moc);fr.Textures.forEach(ref=>add('texture',ref));
  // Optional unsafe/missing references are never fetched; the renderer reports and skips them.
  const optional=(kind,ref)=>{try{return add(kind,ref);}catch{return null;}};
  for(const key of ['Physics','Pose','DisplayInfo','UserData'])if(fr[key])optional(key.toLowerCase(),fr[key]);
  for(const [group,items] of Object.entries(fr.Motions||{})){if(!Array.isArray(items))throw new Error('无效动作组');items.forEach((m,index)=>{optional('motion',m.File);if(m.Sound)optional('sound',m.Sound);motions.push({group,index,file:m.File,label:String(m.File).split('/').at(-1)});});}
  for(const e of fr.Expressions||[]){if(typeof e.Name!=='string')throw new Error('无效表情');optional('expression',e.File);expressions.push({name:e.Name,file:e.File});}
  if(files.length>1000)throw new Error('模型依赖文件过多');
  const ids=name=>(config.Groups||[]).filter(g=>g.Name===name).flatMap(g=>g.Ids||[]).filter(id=>typeof id==='string');
  return {id:entryUrl,name:decodeURIComponent(new URL(entryUrl).pathname.split('/').at(-1)).replace('.model3.json',''),format:'moc3',entryUrl,files,motions,expressions,lipSyncIds:ids('LipSync'),eyeBlinkIds:ids('EyeBlink'),validation:{referencesComplete:true},localImport:false,previewCompatibility:true};
}
