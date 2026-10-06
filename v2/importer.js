// Browser-only bounded ZIP reader; no archive scripts, servers or remote transports.
export const limits = {archive:64*1024*1024, expanded:256*1024*1024, file:64*1024*1024, count:1000, ratio:200};
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8',{fatal:true});
export function safePath(name) {
  if(typeof name !== 'string' || !name || name.length>500 || /[%\\:\x00-\x1f\x7f]/.test(name) || name.startsWith('/') || name !== name.normalize('NFC')) throw new Error('拒绝编码、绝对路径、控制字符或反斜杠路径');
  const parts=name.replace(/\/$/,'').split('/');
  if(parts.some(p=>!p || p==='.' || p==='..' || /[. ]$/.test(p))) throw new Error('拒绝路径穿越或不明确路径');
  return parts.join('/');
}
export const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
const json = bytes => {if(bytes.length>4*1024*1024)throw new Error('JSON 超过 4 MiB');return JSON.parse(decoder.decode(bytes).replace(/^\uFEFF/,''));};
function refs(config){
  const fr=config.FileReferences;
  if(config.Version!==3 || !fr || typeof fr.Moc!=='string' || !fr.Moc.endsWith('.moc3') || !Array.isArray(fr.Textures) || !fr.Textures.length)throw new Error('需要 Version 3、Moc 和 Textures');
  const files=[['moc',fr.Moc],...fr.Textures.map(x=>['texture',x])],motions=[],expressions=[];
  for(const k of ['Physics','Pose','DisplayInfo','UserData'])if(fr[k])files.push([k.toLowerCase(),fr[k]]);
  if(fr.Motions && (typeof fr.Motions!=='object' || Array.isArray(fr.Motions)))throw new Error('Motions 必须为对象');
  for(const [group,items] of Object.entries(fr.Motions || {})){
    if(!Array.isArray(items))throw new Error('动作组必须为数组');
    items.forEach((m,index)=>{if(!m || typeof m.File!=='string')throw new Error('动作缺少 File');files.push(['motion',m.File]);if(m.Sound)files.push(['sound',m.Sound]);motions.push({group,index,file:m.File,label:m.File.split('/').at(-1)});});
  }
  if(!Array.isArray(fr.Expressions || []))throw new Error('Expressions 必须为数组');
  const names=new Set();
  for(const e of fr.Expressions || []){if(!e || typeof e.Name!=='string' || !e.Name || names.has(e.Name) || typeof e.File!=='string')throw new Error('表情 Name/File 无效或重复');names.add(e.Name);files.push(['expression',e.File]);expressions.push({name:e.Name,file:e.File});}
  files.forEach(([,p])=>safePath(p));
  return {files,motions,expressions};
}
export function textureDimensions(content){
  const view=new DataView(content.buffer,content.byteOffset,content.byteLength);
  if([137,80,78,71,13,10,26,10].every((b,i)=>content[i]===b)){
    if(content.length<24)throw new Error('PNG 头不完整');return [view.getUint32(16),view.getUint32(20)];
  }
  if(content[0]!==255 || content[1]!==216)throw new Error('纹理必须为 PNG/JPEG');
  let p=2;
  while(p<content.length){
    if(content[p++]!==255)throw new Error('JPEG marker 无效');while(content[p]===255)p++;
    const marker=content[p++];if(marker===217 || marker===218)break;if(marker===1 || marker>=208 && marker<=215)continue;
    if(p+2>content.length)throw new Error('JPEG 长度无效');const size=view.getUint16(p);
    if(size<2 || p+size>content.length)throw new Error('JPEG segment 越界');
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
      if(size<8)throw new Error('JPEG SOF 无效');return [view.getUint16(p+5),view.getUint16(p+3)];
    }p+=size;
  }throw new Error('JPEG 缺少尺寸');
}
export async function inspectModel(entry,data){
  const config=json(data.get(entry)), r=refs(config), base=entry.includes('/')?entry.slice(0,entry.lastIndexOf('/')+1):'', inventory=new Map();let decodedTextureBytes=0;
  for(const [kind,ref] of r.files){
    const path=base+ref, content=data.get(path);if(!content)throw new Error(`缺少 ${kind}: ${ref}`);
    if(kind==='moc' && (content.length<64 || decoder.decode(content.slice(0,4))!=='MOC3'))throw new Error('MOC3 文件头无效；仍需 Core 验收');
    if(ref.endsWith('.json'))json(content);
    if(kind==='texture'){
      const [width,height]=textureDimensions(content);
      if(!width || !height || width>8192 || height>8192)throw new Error('纹理超过 8192 上限');
      if(!inventory.has(path))decodedTextureBytes+=width*height*4;
      if(decodedTextureBytes>limits.expanded)throw new Error('纹理解码总量超过 256 MiB');
    }
    inventory.set(path,{kind,path,bytes:content.length,sha256:await sha(content)});
  }
  if(!Array.isArray(config.Groups || []) || (config.Groups || []).some(g=>!g || !Array.isArray(g.Ids) || g.Ids.some(i=>typeof i!=='string')))throw new Error('参数组无效');
  const ids=name=>(config.Groups || []).filter(g=>g.Name===name).flatMap(g=>g.Ids);
  return {id:`import-${(await sha(data.get(entry))).slice(0,12)}-${crypto.randomUUID().slice(0,8)}`,name:entry.split('/').slice(-2,-1)[0] || entry,entryPath:entry,config,format:'moc3',entrySha256:await sha(data.get(entry)),files:[...inventory.values()],motions:r.motions,expressions:r.expressions,lipSyncIds:ids('LipSync'),eyeBlinkIds:ids('EyeBlink'),parameters:[],issues:config.Expressions?[{message:'根级 Expressions 不被标准 loader 读取'}]:[],localImport:true,license:{status:'unknown',redistributionAllowed:false,note:'访问者确认有本地预览权；未核实公开分发权'},validation:{referencesComplete:true,coreAcceptance:'pending',note:'结构检查通过；文件头不是有效模型证明，仍需 Core 与视觉验收'}};
}
async function inflate(bytes,size){
  let stream;try{stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw new Error('浏览器不支持 ZIP Deflate；请用当前 Chrome/Edge 或 Stored ZIP');}
  const reader=stream.getReader(),chunks=[];let total=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>size || total>limits.file){await reader.cancel();throw new Error('实际解压长度超限');}chunks.push(value);}}finally{reader.releaseLock();}
  if(total!==size)throw new Error('解压长度不一致');const output=new Uint8Array(total);let at=0;for(const c of chunks){output.set(c,at);at+=c.length;}return output;
}
export async function readZip(buffer){
  const bytes=new Uint8Array(buffer);if(bytes.length>limits.archive || bytes.length<22)throw new Error('ZIP 必须 ≤64 MiB');
  const v=new DataView(buffer), u16=p=>v.getUint16(p,true), u32=p=>v.getUint32(p,true);let end=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(u32(p)===0x06054b50 && p+22+u16(p+20)===bytes.length){end=p;break;}
  if(end<0)throw new Error('无效 ZIP 目录');
  const count=u16(end+10),cdSize=u32(end+12),cdOffset=u32(end+16);
  if(u16(end+4)||u16(end+6)||count!==u16(end+8)||!count||count>limits.count||cdOffset+cdSize!==end)throw new Error('拒绝多卷、ZIP64 或超量 ZIP');
  let p=cdOffset,total=0;const entries=[],seen=new Set(),ranges=[];
  for(let i=0;i<count;i++){
    if(p+46>end || u32(p)!==0x02014b50)throw new Error('损坏的 ZIP 目录');
    const flags=u16(p+8),method=u16(p+10),crc=u32(p+16),compressed=u32(p+20),size=u32(p+24),nameLength=u16(p+28),extra=u16(p+30),comment=u16(p+32),attrs=u32(p+38),offset=u32(p+42),next=p+46+nameLength+extra+comment;
    if(next>end || flags&1 || ![0,8].includes(method) || u16(p+34) || [compressed,size,offset].includes(0xffffffff))throw new Error('拒绝加密、不支持压缩或 ZIP64');
    const original=decoder.decode(bytes.slice(p+46,p+46+nameLength)),name=safePath(original),key=name.normalize('NFKC').toLowerCase(),type=(attrs>>>16)&0xf000;
    if(seen.has(key) || ![0,0x8000,0x4000].includes(type))throw new Error('重复路径、符号链接或特殊文件');seen.add(key);
    let ep=p+46+nameLength;while(ep<p+46+nameLength+extra){if(ep+4>next)throw new Error('无效 ZIP extra');const tag=u16(ep),length=u16(ep+2);if(tag===1)throw new Error('不支持 ZIP64');ep+=4+length;}if(ep!==p+46+nameLength+extra)throw new Error('无效 extra 长度');
    if(offset+30>cdOffset || u32(offset)!==0x04034b50 || u16(offset+6)!==flags || u16(offset+8)!==method)throw new Error('本地 ZIP 头不一致');
    const ln=u16(offset+26),le=u16(offset+28),start=offset+30+ln+le,finish=start+compressed;
    if(decoder.decode(bytes.slice(offset+30,offset+30+ln))!==original || finish>cdOffset)throw new Error('本地路径或数据范围不一致');
    if(!(flags&8) && (u32(offset+14)!==crc || u32(offset+18)!==compressed || u32(offset+22)!==size))throw new Error('ZIP 尺寸或 CRC 头不一致');
    if(ranges.some(([a,b])=>offset<b && finish>a))throw new Error('拒绝重叠 ZIP 数据');ranges.push([offset,finish]);
    if(!original.endsWith('/')){
      if(!/\.(json|moc3|png|jpg|jpeg|wav|txt)$/i.test(name))throw new Error('只允许模型数据；拒绝脚本');
      total+=size;if(size>limits.file || total>limits.expanded || size>Math.max(1,compressed)*limits.ratio)throw new Error('解压大小或压缩比超限');
      entries.push({name,method,size,crc,start,finish});
    }else if(size || compressed)throw new Error('目录带数据');p=next;
  }
  if(p!==end)throw new Error('目录长度不一致');
  const data=new Map();for(const e of entries){const raw=bytes.slice(e.start,e.finish),content=e.method===0?raw:await inflate(raw,e.size);if(content.length!==e.size || crc32(content)!==e.crc)throw new Error('ZIP 数据长度或 CRC 无效');data.set(e.name,content);}
  const models=[...data.keys()].filter(p=>p.endsWith('.model3.json'));if(models.length!==1)throw new Error('ZIP 必须恰好包含一个 model3.json');
  const model=await inspectModel(models[0],data);model.archiveSha256=await sha(bytes);
  const reachable=new Set([model.entryPath,...model.files.map(f=>f.path)]);return {model,files:[...data].filter(([p])=>reachable.has(p))};
}
export function makePackage(result){
  const urls=new Map();for(const [path,bytes] of result.files)urls.set(path,URL.createObjectURL(new Blob([bytes],{type:path.endsWith('.json')?'application/json':path.endsWith('.png')?'image/png':path.endsWith('.jpg')||path.endsWith('.jpeg')?'image/jpeg':'application/octet-stream'})));
  const model={...result.model,entryUrl:urls.get(result.model.entryPath),files:result.model.files.map(f=>({...f,url:urls.get(f.path)}))};
  return {model,dispose:()=>{for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}};
}
export function importPackage(file,{signal}={}){
  if(file.size>limits.archive)return Promise.reject(new Error('ZIP 超过 64 MiB'));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./import-worker.js',import.meta.url),{type:'module'});
    const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',cancel);};
    const cancel=()=>{cleanup();reject(new DOMException('导入已取消','AbortError'));};
    if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});
    worker.onmessage=event=>{cleanup();if(event.data.error)reject(new Error(event.data.error));else resolve(makePackage(event.data));};
    worker.onerror=()=>{cleanup();reject(new Error('浏览器导入 worker 失败'));};
    file.arrayBuffer().then(buffer=>{if(!signal?.aborted)worker.postMessage(buffer,[buffer]);},error=>{cleanup();reject(error);});
  });
}
