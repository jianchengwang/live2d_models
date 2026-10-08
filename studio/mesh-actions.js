import {bindPreset} from '../v2/mesh-project.js?ui=3';
import {defaultActionParameters,inferMaterialRole} from '../v2/material-contract.js?ui=3';
import {parameterMotion} from './mesh-editing.js?ui=3';
export const ACTIONS=[{id:'breath',name:'呼吸'},{id:'blink',name:'眨眼'},{id:'mouth',name:'张嘴'},{id:'wave',name:'招手（可选）'}];
const ids={breath:['ParamBreath'],blink:['ParamEyeLOpen','ParamEyeROpen'],mouth:['ParamMouthOpenY'],wave:['ParamWave']};
const candidate=(project,role)=>project.layers.filter(layer=>layer.visible&&layer.opacity>0&&layer.role===role);
const textureHashes=new WeakMap();function textureHash(layer){const previous=textureHashes.get(layer);if(previous?.texture===layer.texture)return previous.hash;let hash=2166136261;for(let i=0;i<layer.texture.length;i++)hash=Math.imul(hash^layer.texture.charCodeAt(i),16777619);const value=(hash>>>0).toString(16);textureHashes.set(layer,{texture:layer.texture,hash:value});return value;}
export function ensureActionParameters(project,{wave=false,allowFull=false}={}){let count=0;const next=defaultActionParameters();if(wave)next.push({id:'ParamWave',name:'招手',min:0,max:1,default:0});
  for(const p of next)if(!project.parameters.some(old=>old.id===p.id)){if(project.parameters.length>=16){if(allowFull)continue;throw new Error('参数数量已达上限');}project.parameters.push(p);count++;}return count;}
export function inferProjectRoles(project){for(const layer of project.layers)if(!layer.role){layer.role=inferMaterialRole(layer.name);layer.roleSource='inferred';}return project;}
export function actionSignature(project,action){const used=ids[action];let hash=2166136261;const text=JSON.stringify({parameters:project.parameters,layers:project.layers.map(l=>({id:l.id,role:l.role,textureHash:textureHash(l),visible:l.visible,opacity:l.opacity,mesh:l.mesh,bindings:Object.fromEntries(used.filter(id=>l.bindings[id]).map(id=>[id,l.bindings[id]]))}))});
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return (hash>>>0).toString(16);}
export function actionStatus(project,action){const moving=ids[action].map(id=>parameterMotion(project,id)),changed=moving.reduce((n,m)=>n+m.changedCoordinates,0),bound=moving.reduce((n,m)=>n+m.boundLayers,0);
  const materials=action==='breath'?candidate(project,'torso.clothing'):action==='blink'?[...candidate(project,'eye.left.open_patch'),...candidate(project,'eye.right.open_patch')]:action==='mouth'?candidate(project,'mouth.closed_patch'):project.layers.filter(l=>l.role?.startsWith('arm.'));
  const detail={id:action,changedCoordinates:changed,boundLayers:bound,parameterIds:ids[action]};
  if(action==='wave')return {...detail,state:materials.length?'unbound':'missing-materials',label:materials.length?'未绑定':'缺层',note:'关节招手尚未实现；需分开的上臂、前臂、手、遮挡补全和支点。'};
  if(changed){const usable=action==='breath'&&materials.length>0&&project.actionReviews?.breath===actionSignature(project,'breath');return {...detail,state:usable?'usable':'approximate',label:usable?'可用 · 已人工检查':'近似 · 需检查',note:action==='blink'?'当前是眼层压扁近似；不会生成闭眼线或完成眼睑遮挡。':action==='mouth'?'当前是嘴层拉伸近似；不会生成嘴内部。':'网格端点已变化；请检查两个端点的轮廓和遮挡。'};}
  if(!materials.length){const rich=action==='blink'?project.layers.some(l=>l.role?.startsWith('eye.')):action==='mouth'?project.layers.some(l=>l.role?.startsWith('mouth.')):false;return {...detail,state:rich?'unbound':'missing-materials',label:rich?'未绑定':'缺层',note:rich?'有分部件材料，完整开合需要眼睑／口内遮挡绑定；本批不会伪造完成。':'尚无对应图层角色；可选择图层，手动指定角色。'};}
  const missing=action==='blink'&&['left','right'].some(side=>!candidate(project,`eye.${side}.open_patch`).length);
  return {...detail,state:missing?'missing-materials':'unbound',label:missing?'缺层 · 缺一侧眼层':'未绑定',note:'材料角色只表示候选。点击创建基础绑定后，还需检查实际画面。'};
}
export function bindBasicAction(project,action,strength=.04){if(!['breath','blink','mouth'].includes(action))throw new Error('本批没有关节招手绑定能力');ensureActionParameters(project);let created=0,preserved=0;
  const routes=action==='breath'?[['torso.clothing','ParamBreath','breath']]:action==='blink'?[['eye.left.open_patch','ParamEyeLOpen','blink'],['eye.right.open_patch','ParamEyeROpen','blink']]:[['mouth.closed_patch','ParamMouthOpenY','mouth']];
  for(const [role,id,preset]of routes){const layers=candidate(project,role);if(layers.length>1)throw new Error('角色不唯一，请先检查图层角色：'+role);if(!layers.length)continue;const layer=layers[0],keys=layer.bindings[id];if(keys&&keys[0].positions.some((v,i)=>Math.abs(v-keys[1].positions[i])>1e-7)){preserved++;continue;}
    const parameter=project.parameters.find(p=>p.id===id);bindPreset(layer,id,preset,strength,{semantics:parameter.semantics});created++;}
  if(created){project.actionReviews??={};delete project.actionReviews[action];}return {created,preserved,status:actionStatus(project,action)};
}
export function bindAllBasics(project,strength=.04){return ['breath','blink','mouth'].map(action=>({action,...bindBasicAction(project,action,strength)}));}
