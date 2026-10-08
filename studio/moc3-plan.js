// Own adapter/planning code. Importing this module never imports or executes the writer.
import {validateMeshProject,meshPositions} from '../v2/mesh-project.js?ui=3';

export const MOC3_LIMITS=Object.freeze({visibleLayers:16,totalVertices:8192,parameters:4,atlasSize:4096,gutter:2});
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
  const project=validateMeshProject(raw);
  for(const layer of project.layers)if(Object.values(layer.bindings).filter(moving).length>1)fail('同一网格有多个实际运动参数；不能静默丢弃或合并其动作');
  const effective=new Set(project.layers.flatMap(layer=>Object.entries(layer.bindings).filter(([,keys])=>moving(keys)).map(([id])=>id)));
  if(!effective.size||effective.size>MOC3_LIMITS.parameters)fail('支持 1–4 个独立运动参数；每个网格最多一个动态参数');
  parameterId??=project.parameters.find(item=>effective.has(item.id))?.id;
  if(!effective.has(parameterId))fail('请选择有实际运动的参数；导出会保留全部独立运动参数');
  if(effective.has('ParamWave'))fail('关节招手／旋转尚未支持');
  const layers=project.layers.filter(layer=>layer.visible&&layer.opacity>0);
  if(!layers.length||layers.length>MOC3_LIMITS.visibleLayers)fail('可见图层必须为 1–16 层');
  if(layers.reduce((n,layer)=>n+layer.mesh.positions.length/2,0)>MOC3_LIMITS.totalVertices)fail('总顶点超过 8192');
  for(const id of effective)if(!layers.some(layer=>layer.bindings[id]&&moving(layer.bindings[id])))fail('参数 '+id+' 没有可见网格运动；不能丢弃隐藏层动作');
  const defaults=Object.fromEntries(project.parameters.map(item=>[item.id,item.default]));
  const mappings=project.parameters.filter(item=>effective.has(item.id)).map(item=>({sourceParameter:item.id,sourceToExport:/^ParamEye[LR]Open$/.test(item.id)&&item.semantics!=='eye-open-01'?'1 - value':'value',legacyEyeReversed:/^ParamEye[LR]Open$/.test(item.id)&&item.semantics!=='eye-open-01'}));
  const parameters=mappings.map(mapping=>{const item=project.parameters.find(p=>p.id===mapping.sourceParameter);return {id:item.id,name:item.name,min:0,max:1,default:mapping.legacyEyeReversed?1-item.default:item.default};});
  const activeIndex=parameters.findIndex(p=>p.id===parameterId);
  // Keep original mesh order independent of parameter-grouped binding descriptors.
  // Distinct fixed draw orders preserve bottom-to-top source compositing.
  const meshes=layers.slice().reverse().map((layer,index)=>{const id=Object.keys(layer.bindings).find(id=>moving(layer.bindings[id])),parameterIndex=id?parameters.findIndex(p=>p.id===id):-1,mapping=mappings[parameterIndex];return {
    id:layer.id,name:layer.name,opacity:layer.opacity,width:layer.width,height:layer.height,texture:layer.texture,
    drawOrder:layers.length-index,
    uvs:[...layer.mesh.uvs],indices:[...layer.mesh.indices],
    parameterIndex,static:parameterIndex<0,
    frames:parameterIndex<0?[meshPositions(layer,defaults)]:[0,1].map(value=>meshPositions(layer,{...defaults,[id]:mapping.legacyEyeReversed?1-value:value})),
  };});
  return {
    format:'studio-experimental-moc3-plan',version:1,name:project.name,width:project.width,height:project.height,
    parameter:parameters[activeIndex],mapping:mappings[activeIndex],activeIndex,parameters,mappings,
    frozenParameters:project.parameters.filter(item=>!effective.has(item.id)).map(item=>({id:item.id,value:item.default})),
    meshes,warnings:['支持 1–4 个独立参数的扁平线性网格；每网格最多一个动态参数。旋转、骨骼、嵌套、蒙版、物理和同网格多参数仍不支持。','命名和顶点变化不能证明眨眼、口内或关节绑定完整。'],
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
      moc3Keyforms:mesh.frames.map(points),moc3ParameterIndex:mesh.parameterIndex<0?0:mesh.parameterIndex};
  });
  return {project:{canvas:{width:plan.width,height:plan.height},nodes,parameters:plan.parameters.map(p=>({...p})),animations:[]},regions,atlasSize:atlas.size,numAtlases:1};
}

export function modelReferences(){return {Version:3,StudioRuntime:{profile:'flat-independent-v1',core:6},FileReferences:{Moc:'model.moc3',Textures:['textures/texture_00.png'],Motions:{Test:[{File:'motions/test.motion3.json',FadeInTime:0,FadeOutTime:0}]}}};}
export function testMotion(plan){const n=plan.parameters.length;return {Version:3,Meta:{Duration:3,Fps:30,Loop:false,AreBeziersRestricted:true,CurveCount:n,TotalSegmentCount:n*2,TotalPointCount:n*3,UserDataCount:0,TotalUserDataSize:0},Curves:plan.parameters.map(p=>({Target:'Parameter',Id:p.id,Segments:[0,p.default,0,1.5,p.default<.5?1:0,0,3,p.default]})),UserData:[]};}

export function parameterSamples(plan){const defaults=Object.fromEntries(plan.parameters.map(p=>[p.id,p.default])),cases=[defaults];for(let mask=0;mask<1<<plan.parameters.length;mask++)cases.push(Object.fromEntries(plan.parameters.map((p,i)=>[p.id,(mask>>i)&1])));cases.push(Object.fromEntries(plan.parameters.map(p=>[p.id,.5])));return cases;}
export function sourceValues(plan,exported){return Object.fromEntries(plan.mappings.map(m=>[m.sourceParameter,m.legacyEyeReversed?1-exported[m.sourceParameter]:exported[m.sourceParameter]]));}
export function expectedMeshFrame(mesh,values,plan){if(mesh.static)return mesh.frames[0];const v=values[plan.parameters[mesh.parameterIndex].id];return mesh.frames[0].map((x,i)=>x*(1-v)+mesh.frames[1][i]*v);}
