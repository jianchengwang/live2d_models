// Open, editable webpage mesh project. This is not a Cubism moc3 binary.
export const MESH_FORMAT='studio-mesh2d';
export function gridMesh(left,top,width,height,segments=8){
  const positions=[],uvs=[],indices=[];
  for(let y=0;y<=segments;y++)for(let x=0;x<=segments;x++){positions.push(left+x*width/segments,top+y*height/segments);uvs.push(x/segments,y/segments);}
  for(let y=0;y<segments;y++)for(let x=0;x<segments;x++){const a=y*(segments+1)+x,b=a+1,c=a+segments+1,d=c+1;indices.push(a,b,c,b,d,c);}
  return {positions,uvs,indices};
}
const bad=message=>{throw new Error(message);};
const finite=(n,limit=100000)=>Number.isFinite(n)&&Math.abs(n)<=limit;
const cleanName=(v,fallback)=>typeof v==='string'?v.slice(0,100):fallback;
export function validateMeshProject(raw){
  if(raw?.format!==MESH_FORMAT||raw.version!==1)bad('请选择 Studio 网格项目 v1');
  if(!Number.isInteger(raw.width)||!Number.isInteger(raw.height)||raw.width<1||raw.height<1||raw.width>4096||raw.height>4096)bad('项目画布尺寸无效');
  if(!Array.isArray(raw.layers)||!raw.layers.length||raw.layers.length>64||!Array.isArray(raw.parameters)||raw.parameters.length>16)bad('图层或参数数量无效');
  const ids=new Set(),parameters=raw.parameters.map(p=>{if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(p?.id)||ids.has(p.id)||p.min!==0||p.max!==1||!finite(p.default)||p.default<0||p.default>1)bad('参数需唯一 ID、范围 0–1');ids.add(p.id);return {id:p.id,name:cleanName(p.name,p.id),min:0,max:1,default:p.default};});
  let textureBytes=0,texturePixels=0;
  const layerIds=new Set(),layers=raw.layers.map((l,index)=>{
    if(typeof l?.id!=='string'||l.id.length>80||layerIds.has(l.id))bad('图层 ID 无效');layerIds.add(l.id);
    if(!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(l.texture)||l.texture.length>32*1024*1024)bad('图层仅接受项目内 PNG 像素，不接受外部资源或脚本');
    let binary;try{binary=atob(l.texture.slice(l.texture.indexOf(',')+1));}catch{bad('PNG 编码无效');}textureBytes+=binary.length;if(binary.length<24||textureBytes>64*1024*1024)bad('纹理总字节超过 64 MiB');
    const png=Uint8Array.from(binary.slice(0,24),c=>c.charCodeAt(0)),dv=new DataView(png.buffer);if(png.slice(0,8).join(',')!=='137,80,78,71,13,10,26,10')bad('纹理不是 PNG');const w=dv.getUint32(16),h=dv.getUint32(20);texturePixels+=w*h;
    if(!w||!h||w>4096||h>4096||texturePixels>64*1024*1024||w!==l.width||h!==l.height)bad('纹理尺寸或解码预算无效');
    const mesh=l.mesh,n=mesh?.positions?.length;if(!n||n%2||n>2048||mesh.uvs?.length!==n||!Array.isArray(mesh.indices)||!mesh.indices.length||mesh.indices.length%3||mesh.indices.length>12288)bad('网格结构无效');
    if(!mesh.positions.every(v=>finite(v))||!mesh.uvs.every(v=>finite(v)&&v>=0&&v<=1)||!mesh.indices.every(v=>Number.isInteger(v)&&v>=0&&v<n/2))bad('网格坐标或索引无效');
    const bindings={};for(const [id,keys]of Object.entries(l.bindings||{})){if(!ids.has(id)||!Array.isArray(keys)||keys.length!==2||keys[0].value!==0||keys[1].value!==1||keys.some(k=>!Array.isArray(k.positions)||k.positions.length!==n||!k.positions.every(v=>finite(v))))bad('参数端点与网格不一致');bindings[id]=keys.map(k=>({value:k.value,positions:[...k.positions]}));}
    if(!finite(l.opacity,1)||l.opacity<0)bad('图层透明度无效');
    return {id:l.id,name:cleanName(l.name,'图层 '+(index+1)),width:w,height:h,texture:l.texture,visible:l.visible!==false,opacity:l.opacity,mesh:{positions:[...mesh.positions],uvs:[...mesh.uvs],indices:[...mesh.indices]},bindings};
  });
  return {format:MESH_FORMAT,version:1,name:cleanName(raw.name,'我的网格角色'),width:raw.width,height:raw.height,layers,parameters};
}
export function meshPositions(layer,values={}){
  const result=layer.mesh.positions.slice();
  for(const [id,keys]of Object.entries(layer.bindings)){const v=Math.max(0,Math.min(1,Number(values[id])||0));for(let i=0;i<result.length;i++)result[i]+=keys[0].positions[i]*(1-v)+keys[1].positions[i]*v-layer.mesh.positions[i];}
  return result;
}
export function bindPreset(layer,id,kind,strength=.04){
  const base=layer.mesh.positions,max=base.slice(),xs=base.filter((_,i)=>i%2===0),ys=base.filter((_,i)=>i%2===1),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),cx=(left+right)/2,cy=(top+bottom)/2;
  for(let i=0;i<max.length;i+=2){const x=base[i],y=base[i+1];if(kind==='breath'){const weight=Math.max(0,1-(y-top)/(bottom-top));max[i]=x+(x-cx)*strength*weight;max[i+1]=y-(bottom-top)*strength*weight;}
    else if(kind==='blink')max[i+1]=cy+(y-cy)*.06;
    else if(kind==='mouth')max[i+1]=cy+(y-cy)*(1+strength*8);
    else if(kind==='sway')max[i]=x+(bottom-top)*strength*(1-(y-top)/(bottom-top));}
  layer.bindings[id]=[{value:0,positions:base.slice()},{value:1,positions:max}];return layer;
}
export function playbackValues(project,time,{breath=true,blink=false,mouth=0}={}){
  return Object.fromEntries(project.parameters.map(p=>[p.id,(/breath/i.test(p.id)&&breath)?(1-Math.cos(time*2))/2:(/eye.*open/i.test(p.id)&&blink)?(time%4<.16?1:0):/mouth.*open/i.test(p.id)?mouth:p.default]));
}
export function meshModel(project,entryUrl,{localImport=false}={}){return {id:'mesh2d-'+project.name,name:project.name,format:'mesh2d',entryUrl,project,localImport,files:[],motions:[],expressions:[],lipSyncIds:project.parameters.filter(p=>/mouth.*open/i.test(p.id)).map(p=>p.id),validation:{referencesComplete:true},license:{note:'像素与项目的使用权限由素材所有者决定；本地导入不上传。'}};}
