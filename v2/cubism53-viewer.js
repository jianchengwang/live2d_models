// Adapter for the official Cubism Web Framework 5-r.5. Core remains vendor hosted.
import {CubismFramework,CubismUserModel,CubismMatrix44,CubismShaderManager_WebGL} from './cubism53-framework.js';
import {shaderSources} from './cubism53-shaders.js';

export async function createCubism53Viewer({container,width,height,config,mocBytes,textureURLs,readJSON,resolveResource,signal}) {
  CubismFramework.startUp(); CubismFramework.initialize();
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;container.replaceChildren(canvas);
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true});
  if(!gl)throw new Error('Cubism 5.3 渲染需要 WebGL2；请检查浏览器硬件加速');
  const textures=[],motions=new Map(),expressions=new Map();let released=false,lastTime=performance.now();
  class Model extends CubismUserModel {
    update(){
      const now=performance.now(),dt=Math.min(.1,Math.max(0,(now-lastTime)/1000));lastTime=now;
      this._model.loadParameters();this._motionManager.updateMotion(this._model,dt);this._model.saveParameters();
      this._expressionManager.updateMotion(this._model,dt);this._physics?.evaluate(this._model,dt);this._pose?.updateParameters(this._model,dt);this._model.update();
    }
    draw(){
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const matrix=new CubismMatrix44();matrix.scale(1,canvas.width/canvas.height);matrix.multiplyByMatrix(this.getModelMatrix());
      const renderer=this.getRenderer();renderer.setRenderTargetSize(canvas.width,canvas.height);renderer.setMvpMatrix(matrix);renderer.setRenderState(null,[0,0,canvas.width,canvas.height]);renderer.drawModel();
    }
    startMotion(group,index,priority){const motion=motions.get(`${group}:${index}`);if(!motion)throw new Error('此模型没有可加载的动作');if(priority!==3&&!this._motionManager.reserveMotion(priority))return -1;return this._motionManager.startMotionPriority(motion,false,priority);}
    setExpression(name){const expression=expressions.get(name);if(!expression)throw new Error('此模型没有可加载的表情');this._expressionManager.startMotionPriority(expression,false,3);}
    release(){if(released)return;released=true;window.cancelAnimationFrame(frame);for(const texture of textures)gl.deleteTexture(texture);super.release();CubismFramework.dispose();CubismFramework.cleanUp();}
  }
  const model=new Model();let frame;
  try {
    model.loadModel(mocBytes.buffer.slice(mocBytes.byteOffset,mocBytes.byteOffset+mocBytes.byteLength),true);
    if(!model.getModel())throw new Error('Cubism 5.3 Core 拒绝模型或一致性检查失败');
    model.createRenderer(width,height);const renderer=model.getRenderer();renderer.startUp(gl);renderer.setIsPremultipliedAlpha(true);
    const shaderRoot=new URL('./cubism53-shaders/',import.meta.url).href,shaderURLs=new Map(Object.entries(shaderSources).map(([name,source])=>[shaderRoot+name,source]));
    const previousFetch=window.fetch.bind(window);
    window.fetch=(raw,...args)=>{const url=new URL(typeof raw==='string'||raw instanceof URL?raw:raw.url,location.href).href;return shaderURLs.has(url)?Promise.resolve(new Response(shaderURLs.get(url),{headers:{'Content-Type':'text/plain'}})):previousFetch(raw,...args);};
    renderer.loadShaders(shaderRoot);
    for(let i=0;i<textureURLs.length;i++){
      signal?.throwIfAborted();const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Cubism 5.3 纹理读取失败'));image.src=textureURLs[i];});signal?.throwIfAborted();
      const texture=gl.createTexture();textures.push(texture);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);renderer.bindTexture(i,texture);
    }
    const bytes=data=>new TextEncoder().encode(JSON.stringify(data));
    for(const kind of ['Physics','Pose','UserData'])if(config.FileReferences[kind]){const data=bytes(await readJSON(resolveResource(config.FileReferences[kind])));model[`load${kind}`](data.buffer,data.byteLength);}
    for(const [group,items]of Object.entries(config.FileReferences.Motions||{}))for(let i=0;i<items.length;i++){const item=items[i],data=bytes(await readJSON(resolveResource(item.File))),motion=model.loadMotion(data.buffer,data.byteLength,`${group}:${i}`);if(!motion)throw new Error('动作读取失败');motion.setEffectIds([],[]);if(Number.isFinite(item.FadeInTime))motion.setFadeInTime(item.FadeInTime);if(Number.isFinite(item.FadeOutTime))motion.setFadeOutTime(item.FadeOutTime);motions.set(`${group}:${i}`,motion);}
    for(const item of config.FileReferences.Expressions||[]){const data=bytes(await readJSON(resolveResource(item.File))),expression=model.loadExpression(data.buffer,data.byteLength,item.Name);if(!expression)throw new Error('表情读取失败');expressions.set(item.Name,expression);}
    const shader=CubismShaderManager_WebGL.getInstance().getShader(gl);
    for(let i=0;!shader._isShaderLoaded;i++){signal?.throwIfAborted();if(i>=250)throw new Error('Cubism 5.3 shader 初始化超时');await new Promise(resolve=>setTimeout(resolve,20));}
    if(shader._shaderSets.slice(0,11).some(s=>!s.shaderProgram))throw new Error('Cubism 5.3 shader 编译失败');
    model.getModel().update();
    const tick=()=>{if(released||signal?.aborted)return;model.update();model.draw();frame=window.requestAnimationFrame(tick);};
    // Caller installs parameter/view hooks before the first visible frame.
    return {getModel:()=>model,start:()=>{tick();},resize:()=>gl.viewport(0,0,canvas.width,canvas.height)};
  } catch(error){model.release();throw error;}
}
