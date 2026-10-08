// Own adapter/planning code. Importing this module never imports or executes the writer.
import {validateMeshProject,meshPositions} from '../v2/mesh-project.js?ui=3';

export const MOC3_LIMITS=Object.freeze({visibleLayers:16,totalVertices:8192,atlasSize:4096,gutter:2});
const fail=message=>{throw new Error('实验性 MOC3：'+message);};
const fields=(object,allowed,where)=>{for(const key of Object.keys(object||{}))if(!allowed.includes(key))fail(`${where}含未支持字段 ${key}；不接受旋转、嵌套、蒙版或物理结构`);};
const moving=keys=>keys[0].positions.some((value,index)=>Math.abs(value-keys[1].positions[index])>1e-7);

export function guardMoc3Structure(raw){
  // Guard the original input BEFORE the usual project validator drops extra properties.
  fields(raw,['format','version','name','width','height','layers','parameters','sourceAsset','actionReviews'],'项目');
  for(const parameter of raw?.parameters||[])fields(parameter,['id','name','min','max','default','semantics'],'参数');
  for(const layer of raw?.layers||[]){
    fields(layer,['id','name','width','height','texture','visible','opacity','mesh','bindings','role','roleSource','occlusionComplete','contentBounds'],'图层');
    fields(layer.mesh,['positions','uvs','indices'],'网格');
    for(const keys of Object.values(layer.bindings||{}))for(const key of Array.isArray(keys)?keys:[])fields(key,['value','positions'],'关键形');
  }
}
export function planMoc3(raw,parameterId){
  guardMoc3Structure(raw);
  const project=validateMeshProject(raw),parameter=project.parameters.find(item=>item.id===parameterId);
  if(!parameter)fail('请选择已有的参数');
  if(parameter.id==='ParamWave')fail('关节招手／旋转尚未支持');
  const effective=new Set(project.layers.flatMap(layer=>Object.entries(layer.bindings).filter(([,keys])=>moving(keys)).map(([id])=>id)));
  if(effective.size!==1||!effective.has(parameterId))fail('仅支持一个有实际端点变化的参数；多参数组合必须拒绝，不能静默丢弃其他动作');
  const layers=project.layers.filter(layer=>layer.visible&&layer.opacity>0);
  if(!layers.length||layers.length>MOC3_LIMITS.visibleLayers)fail('可见图层必须为 1–16 层');
  if(layers.reduce((n,layer)=>n+layer.mesh.positions.length/2,0)>MOC3_LIMITS.totalVertices)fail('总顶点超过 8192');
  if(!layers.some(layer=>layer.bindings[parameterId]&&moving(layer.bindings[parameterId])))fail('所选参数没有可见网格运动');
  const legacyEye=/^ParamEye[LR]Open$/.test(parameterId)&&parameter.semantics!=='eye-open-01';
  const defaults=Object.fromEntries(project.parameters.map(item=>[item.id,item.default]));
  // The fixed writer gives meshes equal draw order. Observed Core tie ordering reverses
  // their indices, so feed top-to-bottom to reproduce Studio's bottom-to-top compositing.
  const meshes=layers.slice().reverse().map((layer,index)=>({
    id:layer.id,name:layer.name,opacity:layer.opacity,width:layer.width,height:layer.height,texture:layer.texture,
    drawOrder:layers.length-index,
    uvs:[...layer.mesh.uvs],indices:[...layer.mesh.indices],
    frames:[0,1].map(value=>meshPositions(layer,{...defaults,[parameterId]:legacyEye?1-value:value})),
  }));
  return {
    format:'studio-experimental-moc3-plan',version:1,name:project.name,width:project.width,height:project.height,
    parameter:{id:parameterId,name:parameter.name,min:0,max:1,default:legacyEye?1-parameter.default:parameter.default},
    mapping:{sourceParameter:parameterId,sourceToExport:legacyEye?'1 - value':'value',legacyEyeReversed:legacyEye},
    frozenParameters:project.parameters.filter(item=>item.id!==parameterId).map(item=>({id:item.id,value:item.default})),
    meshes,warnings:['仅支持扁平网格的线性顶点插值；不支持旋转变形器、骨骼、嵌套、蒙版、物理或多参数组合。','命名和顶点变化不能证明眨眼、口内或关节绑定完整。'],
  };
}

export function planAtlas(plan){
  const sorted=plan.meshes.map((mesh,index)=>({mesh,index})).sort((a,b)=>b.mesh.height-a.mesh.height||a.index-b.index);
  for(let size=256;size<=MOC3_LIMITS.atlasSize;size*=2){
    let x=0,y=0,rowHeight=0,ok=true;const entries=[];
    for(const {mesh}of sorted){const w=mesh.width+4,h=mesh.height+4;if(w>size||h>size){ok=false;break;}if(x+w>size){x=0;y+=rowHeight;rowHeight=0;}if(y+h>size){ok=false;break;}
      entries.push({id:mesh.id,x:x+2,y:y+2,width:mesh.width,height:mesh.height});x+=w;rowHeight=Math.max(rowHeight,h);}
    if(ok)return {size,gutter:2,entries};
  }
  fail('带边距的单张纹理图集无法放入 4096×4096；不会缩图或裁掉素材');
}

export function writerInput(plan,atlas){
  if(atlas.size>MOC3_LIMITS.atlasSize||atlas.entries.length!==plan.meshes.length)fail('纹理图集计划不匹配');
  const byId=new Map(atlas.entries.map(entry=>[entry.id,entry])),regions=new Map();
  const nodes=plan.meshes.map(mesh=>{
    const region=byId.get(mesh.id);if(!region||region.width!==mesh.width||region.height!==mesh.height)fail('纹理区域不匹配');
    regions.set(mesh.id,{...region,atlasIndex:0,srcWidth:mesh.width,srcHeight:mesh.height,srcX:0,srcY:0,cropW:mesh.width,cropH:mesh.height});
    const points=frame=>Array.from({length:frame.length/2},(_,index)=>({x:frame[index*2],y:frame[index*2+1]}));
    return {id:mesh.id,type:'part',name:mesh.name,parent_id:null,draw_order:mesh.drawOrder,opacity:mesh.opacity,
      mesh:{vertices:points(mesh.frames[0]),uvs:[...mesh.uvs],triangles:Array.from({length:mesh.indices.length/3},(_,i)=>mesh.indices.slice(i*3,i*3+3))},
      moc3Keyforms:mesh.frames.map(points)};
  });
  return {project:{canvas:{width:plan.width,height:plan.height},nodes,parameters:[{...plan.parameter}],animations:[]},regions,atlasSize:atlas.size,numAtlases:1};
}

export function modelReferences(){return {Version:3,FileReferences:{Moc:'model.moc3',Textures:['textures/texture_00.png'],Motions:{Test:[{File:'motions/test.motion3.json',FadeInTime:0,FadeOutTime:0}]}}};}
export function testMotion(plan){const start=plan.parameter.default,end=start<.5?1:0;return {Version:3,Meta:{Duration:3,Fps:30,Loop:false,AreBeziersRestricted:true,CurveCount:1,TotalSegmentCount:2,TotalPointCount:3,UserDataCount:0,TotalUserDataSize:0},Curves:[{Target:'Parameter',Id:plan.parameter.id,Segments:[0,start,0,1.5,end,0,3,start]}],UserData:[]};}
