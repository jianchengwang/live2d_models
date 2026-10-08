import {MESH_FORMAT,gridMesh,bindPreset} from '../v2/mesh-project.js';
// Original synthetic geometry; no user image or third-party sample artwork.
export function makeMeshDemo(){const w=480,h=640,layers=[];
  function layer(name,paint){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');paint(ctx);layers.push({id:'demo-'+layers.length,name,width:w,height:h,texture:c.toDataURL('image/png'),visible:true,opacity:1,mesh:gridMesh(0,0,w,h),bindings:{}});}
  layer('身体 · 呼吸',c=>{c.fillStyle='#679379';c.beginPath();c.moveTo(165,285);c.quadraticCurveTo(100,400,128,560);c.quadraticCurveTo(240,610,352,560);c.quadraticCurveTo(380,400,315,285);c.closePath();c.fill();c.fillStyle='#d8e6bd';c.fillRect(214,350,52,95);});
  layer('头部',c=>{c.fillStyle='#42534a';c.beginPath();c.ellipse(240,205,110,135,0,0,Math.PI*2);c.fill();c.fillStyle='#f4d5b3';c.beginPath();c.ellipse(240,220,87,106,0,0,Math.PI*2);c.fill();c.fillStyle='#42534a';c.beginPath();c.ellipse(240,135,93,42,-.15,0,Math.PI*2);c.fill();});
  layer('眼睛 · 眨眼',c=>{c.fillStyle='#42534a';for(const x of [205,275]){c.beginPath();c.ellipse(x,218,9,14,0,0,Math.PI*2);c.fill();}});
  layer('嘴 · 口型',c=>{c.fillStyle='#ab6c65';c.beginPath();c.ellipse(240,263,17,5,0,0,Math.PI*2);c.fill();});
  bindPreset(layers[0],'ParamBreath','breath',.055);
  // The eyes/mouth occupy small regions: move only nearby vertices for these demo keys.
  for(const [index,id,kind]of [[2,'ParamEyeLOpen','blink'],[3,'ParamMouthOpenY','mouth']]){const l=layers[index],c=document.createElement('canvas');c.width=160;c.height=80;const ctx=c.getContext('2d');
    // Redraw the same simple original shapes in a tight transparent texture.
    ctx.fillStyle=index===2?'#42534a':'#ab6c65';if(index===2)for(const x of [45,115]){ctx.beginPath();ctx.ellipse(x,40,9,14,0,0,Math.PI*2);ctx.fill();}else{ctx.beginPath();ctx.ellipse(80,40,17,5,0,0,Math.PI*2);ctx.fill();}
    l.width=160;l.height=80;l.texture=c.toDataURL();l.mesh=gridMesh(160,index===2?178:223,160,80);bindPreset(l,id,kind,.08);}
  return {format:MESH_FORMAT,version:1,name:'几何伙伴 · 可动演示',width:w,height:h,layers,parameters:[{id:'ParamBreath',name:'呼吸',min:0,max:1,default:0},{id:'ParamEyeLOpen',name:'眨眼',min:0,max:1,default:0},{id:'ParamMouthOpenY',name:'口型',min:0,max:1,default:0}]};}
