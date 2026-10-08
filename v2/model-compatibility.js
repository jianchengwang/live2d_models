import {prepareMotion} from './motion-validation.js';

// Resolve exactly one declared resource. Never infer another model's file by suffix.
export function declaredResource(ref, model) {
  if (typeof ref !== 'string' || !ref || /[:\\%\x00-\x1f]/.test(ref) || ref.startsWith('/') || ref.split('/').some(p => !p || p === '.' || p === '..'))
    throw new Error(`不安全或不支持的包内路径：${String(ref)}`);
  const file = model.localImport
    ? model.files.find(f => f.path === (model.entryPath.includes('/') ? model.entryPath.slice(0,model.entryPath.lastIndexOf('/')+1) : '') + ref)
    : model.files.find(f => new URL(f.url,model.entryUrl).href === new URL(ref,model.entryUrl).href);
  if (!file) throw new Error(`未找到已声明资源：${ref}`);
  return file;
}

export function mocVersion(bytes) {
  if (bytes.length < 64 || bytes[0] !== 77 || bytes[1] !== 79 || bytes[2] !== 67 || bytes[3] !== 51 || !bytes[4])
    throw new Error('MOC3 文件头无效；请使用实际导出的模型二进制');
  return bytes[4];
}

export function assertCoreVersion(version, core) {
  const supported = core.Version.csmGetLatestMocVersion();
  if (version > supported) throw new Error(`此模型使用 MOC3 版本 ${version}，当前 Core 最多支持版本 ${supported}；需要兼容的新 Core 运行时`);
  return {mocVersion:version,maxMocVersion:supported,coreVersion:core.Version.csmGetVersion()};
}

export function preferredRuntimeVersion(config,version){
  if(config.StudioRuntime===undefined)return version;
  const profile=config.StudioRuntime;
  if(profile?.profile!=='flat-independent-v1'||profile.core!==6||Object.keys(profile).some(k=>!['profile','core'].includes(k)))throw new Error('未知 Studio 运行时声明；不加载包内脚本或外部 Core');
  return Math.max(version,6);
}

export function selectCoreURL(runtime, runtimeRoot, requiredVersion) {
  const root=new URL(runtimeRoot), value=requiredVersion>5&&runtime.cubism53CoreURL?runtime.cubism53CoreURL:requiredVersion>3&&runtime.modernCoreURL?runtime.modernCoreURL:'assets/js/lib/live2dcubismcore.min.js';
  const url=new URL(value,root);
  if(url.username||url.password||url.search||url.hash||!(url.origin===root.origin||url.origin==='https://cubism.live2d.com'))
    throw new Error('新版 Core 必须来自已确认的同源运行时或 Live2D 官方 hosting');
  return url.href;
}

async function mapLimited(items, work) {
  const result=new Array(items.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{while(cursor<items.length){const index=cursor++;result[index]=await work(items[index]);}}));
  return result;
}

export function validateOptionalData(kind,data){
  const list={Physics:'PhysicsSettings',Pose:'Groups',UserData:'UserData'}[kind];
  if(!data||data.Version!==3||!Array.isArray(data[list])||data[list].length>10000)throw new Error(`${kind} 结构无效`);
  const finite=(object,keys)=>object&&keys.every(key=>Number.isFinite(object[key]));
  if(kind==='Physics'){
    const settings=data.PhysicsSettings,meta=data.Meta;
    if(!meta||meta.PhysicsSettingCount!==settings.length||!finite(meta.EffectiveForces?.Gravity,['X','Y'])||!finite(meta.EffectiveForces?.Wind,['X','Y']))throw new Error('Physics Meta / setting 计数无效');
    let inputs=0,outputs=0,vertices=0;
    for(const setting of settings){
      if(!setting||!['Input','Output','Vertices'].every(k=>Array.isArray(setting[k])&&setting[k].length<=10000)||!setting.Vertices.length)throw new Error('Physics Input / Output / Vertices 无效');
      inputs+=setting.Input.length;outputs+=setting.Output.length;vertices+=setting.Vertices.length;
      if(!['Position','Angle'].every(k=>finite(setting.Normalization?.[k],['Minimum','Default','Maximum'])))throw new Error('Physics Normalization 无效');
      for(const input of setting.Input)if(typeof input?.Source?.Id!=='string'||input.Source.Target!=='Parameter'||!finite(input,['Weight'])||!['X','Y','Angle'].includes(input.Type))throw new Error('Physics Input 无效');
      for(const output of setting.Output)if(typeof output?.Destination?.Id!=='string'||output.Destination.Target!=='Parameter'||!finite(output,['Scale','Weight'])||!Number.isInteger(output.VertexIndex)||output.VertexIndex<1||output.VertexIndex>=setting.Vertices.length||!['X','Y','Angle'].includes(output.Type))throw new Error('Physics Output 无效');
      for(const vertex of setting.Vertices)if(!finite(vertex,['Mobility','Delay','Acceleration','Radius'])||!finite(vertex.Position,['X','Y']))throw new Error('Physics Vertex 无效');
    }
    if(meta.TotalInputCount!==inputs||meta.TotalOutputCount!==outputs||meta.VertexCount!==vertices)throw new Error('Physics Meta 与实际 input / output / vertex 计数不一致');
  }else if(kind==='Pose'){
    if(data.Groups.some(group=>!Array.isArray(group)||group.some(part=>typeof part?.Id!=='string'||part.Link&&(!Array.isArray(part.Link)||part.Link.some(id=>typeof id!=='string')))))throw new Error('Pose Groups 无效');
  }else if(data.Meta?.UserDataCount!==data.UserData.length||data.UserData.some(item=>typeof item?.Id!=='string'||typeof item?.Target!=='string'||typeof item?.Value!=='string'))throw new Error('UserData 计数或条目无效');
}

export async function prepareModelConfig(input, model, readJSON) {
  const config = structuredClone(input), fr = config?.FileReferences;
  if (config?.Version !== 3 || !fr || !Array.isArray(fr.Textures) || !fr.Textures.length) throw new Error('模型配置缺少 Moc / Textures');
  const moc = declaredResource(fr.Moc,model), textures = fr.Textures.map(ref => declaredResource(ref,model));
  const diagnostics=[], unavailableMotions=[], unavailableExpressions=[], motionBodies=new Map();
  // Optional files must not turn an otherwise usable character into a blank screen.
  if(fr.Expressions&&!Array.isArray(fr.Expressions)){diagnostics.push('Expressions 不是数组，已跳过');fr.Expressions=[];unavailableExpressions.push(...(model.expressions||[]).map(e=>e.name));}
  const expressions=await mapLimited(fr.Expressions || [],async expression=>{
    try {
      const file=declaredResource(expression.File,model),data=await readJSON(file);
      if (!Array.isArray(data.Parameters) || data.Parameters.some(p=>typeof p.Id!=='string'||!Number.isFinite(p.Value))) throw new Error('表情 Parameters 无效');
      return expression;
    } catch(error) { if(error.name==='AbortError')throw error;unavailableExpressions.push(expression?.Name);diagnostics.push(`表情 ${expression?.Name} (${expression?.File}) 已跳过：${error.message}`);return null; }
  });
  fr.Expressions=expressions.filter(Boolean);
  for(const key of ['Physics','Pose','UserData']) if(fr[key]) {
    try {
      const data=await readJSON(declaredResource(fr[key],model));
      validateOptionalData(key,data);
    }
    catch(error) { if(error.name==='AbortError')throw error;diagnostics.push(`${key} (${fr[key]}) 已跳过：${error.message}`);delete fr[key]; }
  }
  for(const [group,items] of Object.entries(fr.Motions || {})) {
    if(!Array.isArray(items)||!items.length){delete fr.Motions[group];unavailableMotions.push(...model.motions.filter(m=>m.group===group));diagnostics.push(`动作组 ${group} 为空或不是数组，已跳过`);continue;}
    let usable=true;
    await mapLimited(items,async motion=>{
      try {
        const file=declaredResource(motion.File,model),prepared=prepareMotion(await readJSON(file),{compatibility:!!model.previewCompatibility});
        if(prepared.normalized){motionBodies.set(file.url,prepared.data);diagnostics.push(`${motion.File}：仅当前预览校正动作计数，原文件未改`);}
      } catch(error) { if(error.name==='AbortError')throw error;usable=false;diagnostics.push(`动作 ${motion?.File} 已跳过：${error.message}`); }
    });
    // Retain original group/index identity; never renumber actions after a skipped item.
    if(!usable){delete fr.Motions[group];unavailableMotions.push(...model.motions.filter(m=>m.group===group));}
  }
  return {config,moc,textures,diagnostics,unavailableMotions,unavailableExpressions,motionBodies};
}
