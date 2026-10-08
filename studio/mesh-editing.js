// Geometry edits preserve the existing Studio mesh2d format and embedded textures.
import {meshPositions,bindPreset} from '../v2/mesh-project.js?ui=3';
const copy=value=>structuredClone(value);
export function layerState(layer){return {id:layer.id,mesh:copy(layer.mesh),bindings:copy(layer.bindings),visible:layer.visible,opacity:layer.opacity,role:layer.role,roleSource:layer.roleSource,occlusionComplete:layer.occlusionComplete,pivot:copy(layer.pivot),contentBounds:copy(layer.contentBounds)};}
export function editorState(project){return {parameters:copy(project.parameters),layers:project.layers.map(layerState),actionReviews:copy(project.actionReviews||{})};}
export function restoreEditorState(project,state){const byId=new Map(project.layers.map(l=>[l.id,l]));project.layers=state.layers.map(s=>{const l=byId.get(s.id);if(!l)throw new Error('图层状态不匹配');Object.assign(l,copy(s));return l;});project.parameters=copy(state.parameters);project.actionReviews=copy(state.actionReviews||{});}
export class EditHistory{
  constructor(limit=40){this.limit=limit;this.entries=[];this.cursor=0;}
  get canUndo(){return this.cursor>0;}
  get canRedo(){return this.cursor<this.entries.length;}
  push(before,after,label){if(JSON.stringify(before)===JSON.stringify(after))return false;this.entries.splice(this.cursor);this.entries.push({before,after,label});if(this.entries.length>this.limit)this.entries.shift();this.cursor=this.entries.length;return true;}
  undo(project){if(!this.canUndo)return null;const entry=this.entries[--this.cursor];restoreEditorState(project,entry.before);return entry.label;}
  redo(project){if(!this.canRedo)return null;const entry=this.entries[this.cursor++];restoreEditorState(project,entry.after);return entry.label;}
}
export function transformGeometry(layer,source,{indices,target='base',parameter,endpoint=0,dx=0,dy=0,sx=1,sy=1,pivot=[0,0],reference}){
  const selected=new Set(indices);const move=(positions,visible)=>positions.map((v,i)=>{if(!selected.has(Math.floor(i/2)))return v;const axis=i%2,p=pivot[axis],scale=axis?sy:sx,offset=axis?dy:dx;
    const coordinate=visible?.[i]??v,n=v+(coordinate-p)*(scale-1)+offset;if(!Number.isFinite(n)||Math.abs(n)>100000)throw new Error('变换超出可编辑范围');return n;});
  const next=copy(source);
  if(target==='base'){next.mesh.positions=move(source.mesh.positions);if(next.contentBounds&&selected.size===source.mesh.positions.length/2){const b=next.contentBounds,tx=x=>pivot[0]+(x-pivot[0])*sx+dx,ty=y=>pivot[1]+(y-pivot[1])*sy+dy;next.contentBounds={left:Math.min(tx(b.left),tx(b.left+b.width)),top:Math.min(ty(b.top),ty(b.top+b.height)),width:Math.abs(b.width*sx),height:Math.abs(b.height*sy)};}for(const keys of Object.values(next.bindings))for(const key of keys)key.positions=move(key.positions);}
  else {if(!parameter||![0,1].includes(endpoint))throw new Error('先选择参数端点');next.bindings[parameter]??=[{value:0,positions:source.mesh.positions.slice()},{value:1,positions:source.mesh.positions.slice()}];const key=next.bindings[parameter][endpoint];key.positions=move(key.positions,reference);}
  layer.mesh=next.mesh;layer.bindings=next.bindings;layer.contentBounds=next.contentBounds;
}
export function parameterMotion(project,id){let changedCoordinates=0,maxDisplacement=0,boundLayers=0;for(const layer of project.layers){const keys=layer.bindings[id];if(!keys||!layer.visible||layer.opacity<=0)continue;let changed=false;for(let i=0;i<keys[0].positions.length;i++){const delta=Math.abs(keys[1].positions[i]-keys[0].positions[i]);if(delta>1e-7){changedCoordinates++;changed=true;maxDisplacement=Math.max(maxDisplacement,delta);}}if(changed)boundLayers++;}return {id,boundLayers,changedCoordinates,maxDisplacement};}
export function basicBreath(project,{selected=0,strength=.04}={}){let parameter=project.parameters.find(p=>/breath/i.test(p.id));if(!parameter){if(project.parameters.length>=16)throw new Error('参数数量已达上限');parameter={id:'ParamBreath',name:'呼吸',min:0,max:1,default:0};project.parameters.push(parameter);}
  const existing=project.layers.findIndex(l=>l.visible&&l.opacity>0&&l.bindings[parameter.id]?.some((k,i,keys)=>i===1&&k.positions.some((v,n)=>Math.abs(v-keys[0].positions[n])>1e-7)));
  if(existing>=0)return {id:parameter.id,index:existing,created:false};
  const body=project.layers.findIndex(l=>l.visible&&l.opacity>0&&/body|clothing|身体|服装|衣服/i.test(l.name));const index=body>=0?body:Math.min(selected,project.layers.length-1);const layer=project.layers[index];if(!layer.visible||layer.opacity<=0)throw new Error('请先选择可见图层');bindPreset(layer,parameter.id,'breath',strength);return {id:parameter.id,index,created:true};
}
export function boundsFor(positions,indices){const points=indices.map(i=>[positions[i*2],positions[i*2+1]]);if(!points.length)return null;const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};}
export function selectedInBox(layer,values,box){const p=meshPositions(layer,values),result=[];for(let i=0;i<p.length;i+=2)if(p[i]>=box.left&&p[i]<=box.right&&p[i+1]>=box.top&&p[i+1]<=box.bottom)result.push(i/2);return result;}
