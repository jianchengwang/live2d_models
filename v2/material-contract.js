// Pixel roles are material declarations. They do not certify visual quality.
export const MATERIAL_ROLES=['torso.clothing','neck','head.face_fill','hair.back','hair.front',
  ...['left','right'].flatMap(side=>['open_patch','sclera','iris','pupil','highlight','upper_lid','lower_lid','closed_line'].map(part=>`eye.${side}.${part}`)),
  ...['closed_patch','outer_upper','outer_lower','inner','teeth','tongue','closed_line'].map(part=>`mouth.${part}`),
  ...['left','right'].flatMap(side=>['upper','forearm','hand','backfill'].map(part=>`arm.${side}.${part}`)),'other'];
export const eyeOpen01=parameter=>parameter?.semantics==='eye-open-01';
export function mainAlphaBounds(rgba,width,height,left=0,top=0){const count=width*height;if(rgba.length!==count*4)throw new Error('像素尺寸不一致');const seen=new Uint8Array(count),queue=new Int32Array(count);let best=null;
  for(let start=0;start<count;start++){if(seen[start]||rgba[start*4+3]<32)continue;let read=0,write=1,minX=width,minY=height,maxX=-1,maxY=-1;queue[0]=start;seen[start]=1;
    while(read<write){const index=queue[read++],x=index%width,y=Math.floor(index/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const next of [x>0?index-1:-1,x<width-1?index+1:-1,y>0?index-width:-1,y<height-1?index+width:-1])if(next>=0&&!seen[next]&&rgba[next*4+3]>=32){seen[next]=1;queue[write++]=next;}}
    if(!best||write>best.pixels)best={left:left+minX,top:top+minY,width:maxX-minX+1,height:maxY-minY+1,pixels:write};
  }if(!best)return null;const {pixels,...bounds}=best;return bounds;}
export function defaultActionParameters(){return [
  {id:'ParamBreath',name:'呼吸',min:0,max:1,default:0},
  {id:'ParamEyeLOpen',name:'角色左眼开合',min:0,max:1,default:1,semantics:'eye-open-01'},
  {id:'ParamEyeROpen',name:'角色右眼开合',min:0,max:1,default:1,semantics:'eye-open-01'},
  {id:'ParamMouthOpenY',name:'张嘴',min:0,max:1,default:0},
];}
export function inferMaterialRole(name){const key=name.toLowerCase().replace(/^[0-9]+/,'').replace(/[^a-z0-9]/g,'');return {
  bodyclothing:'torso.clothing',torsoclothing:'torso.clothing',neck:'neck',facebase:'head.face_fill',headfacefill:'head.face_fill',
  backhair:'hair.back',hairback:'hair.back',fronthair:'hair.front',hairfront:'hair.front',
  lefteye:'eye.left.open_patch',righteye:'eye.right.open_patch',eyeleftopenpatch:'eye.left.open_patch',eyerightopenpatch:'eye.right.open_patch',
  eyeviewerleftcomplete:'eye.right.open_patch',eyeviewerrightcomplete:'eye.left.open_patch',
  closedmouth:'mouth.closed_patch',mouthclosed:'mouth.closed_patch',mouthclosedpatch:'mouth.closed_patch',
}[key]||MATERIAL_ROLES.find(role=>role.replaceAll('.','').replaceAll('_','')===key)||'other';}
export function applyMaterialManifest(project,raw){
  const keysAllowed=(object,allowed)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).every(key=>allowed.includes(key));
  if(!keysAllowed(raw,['format','version','asset','layers','requestedActions','review'])||raw.format!=='character-layer-manifest'||raw.version!==1||!Array.isArray(raw.layers)||!raw.layers.length||raw.layers.length>64)throw new Error('请选择角色图层 manifest v1');
  if(!keysAllowed(raw.asset,['psd','sha256','width','height','coordinates'])||typeof raw.asset.psd!=='string'||!raw.asset.psd.length||raw.asset.psd.length>160||!Number.isInteger(raw.asset.width)||!Number.isInteger(raw.asset.height))throw new Error('素材记录无效');
  if(!Array.isArray(raw.requestedActions)||!raw.requestedActions.length||raw.requestedActions.length>4||new Set(raw.requestedActions).size!==raw.requestedActions.length||!raw.requestedActions.every(action=>['breath','blink','mouth','wave'].includes(action)))throw new Error('动作目录声明无效');
  if(!keysAllowed(raw.review,['visualApproved','notes'])||typeof raw.review.visualApproved!=='boolean'||typeof raw.review.notes!=='string'||raw.review.notes.length>2000)throw new Error('素材检查记录无效');
  if(raw.asset?.coordinates!=='canvas-pixels-x-right-y-down'||raw.asset.width!==project.width||raw.asset.height!==project.height)throw new Error('素材规范的画布坐标不匹配');
  if(!/^[a-f0-9]{64}$/.test(raw.asset.sha256||'')||project.sourceAsset?.kind!=='psd'||raw.asset.sha256!==project.sourceAsset.sha256)throw new Error('PSD SHA-256 不匹配或项目未保留原件哈希；请重新导入对应 PSD');
  const seen=new Set(),assignments=[];
  for(const entry of raw.layers){
    if(!keysAllowed(entry,['id','psdName','role','restVisible','occlusionComplete','parentId','pivot','notes'])||! /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(entry.id||'')||seen.has(entry.id)||typeof entry.psdName!=='string'||!entry.psdName.length||entry.psdName.length>100||!MATERIAL_ROLES.includes(entry.role)||typeof entry.restVisible!=='boolean'||typeof entry.occlusionComplete!=='boolean')throw new Error('图层角色记录无效或重复');
    if(entry.notes!==undefined&&(typeof entry.notes!=='string'||entry.notes.length>1000))throw new Error('图层说明无效');
    if(entry.parentId!==undefined&&entry.parentId!==null&&(typeof entry.parentId!=='string'||!raw.layers.some(parent=>parent?.id===entry.parentId)||entry.parentId===entry.id))throw new Error('图层父级记录无效');
    seen.add(entry.id);const found=project.layers.filter(layer=>layer.name===entry.psdName);if(found.length!==1)throw new Error('图层名称缺失或不唯一：'+entry.psdName);
    if(assignments.some(([layer])=>layer===found[0]))throw new Error('同一 PSD 层不能重复声明角色');
    if(entry.pivot!==undefined&&(!keysAllowed(entry.pivot,['x','y'])||!Number.isFinite(entry.pivot.x)||!Number.isFinite(entry.pivot.y)||entry.pivot.x<0||entry.pivot.y<0||entry.pivot.x>project.width||entry.pivot.y>project.height))throw new Error('关节支点超出画布');
    assignments.push([found[0],entry]);
  }
  for(const [layer,entry]of assignments){layer.role=entry.role;layer.roleSource='manifest';layer.visible=entry.restVisible;layer.occlusionComplete=entry.occlusionComplete;if(entry.pivot)layer.pivot={...entry.pivot};else delete layer.pivot;}
  project.actionReviews={};return assignments.length;
}
