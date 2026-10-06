// Local, read-only Core acceptance audit. No provider, network, or browser calls.
// Usage: node tools/audit_runtime.mjs [--core /path/to/already-approved/core.js] [--adapter]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mocVersion} from '../v2/model-compatibility.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),corePath=args.includes('--core')?path.resolve(args[args.indexOf('--core')+1]):path.join(root,'assets/js/lib/live2dcubismcore.min.js');
const quiet={log(){},warn(){},error(){},assert(){}};
const context={atob,console:quiet,WebAssembly,ArrayBuffer,Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,Math,setTimeout,clearTimeout,TextDecoder,process,require:createRequire(import.meta.url),__dirname:path.dirname(corePath)};
vm.createContext(context);vm.runInContext(fs.readFileSync(corePath,'utf8'),context,{filename:corePath});
const core=context.Live2DCubismCore;
for(let i=0;;i++){try{core.Version.csmGetVersion();break;}catch(error){if(i===100)throw error;await new Promise(resolve=>setTimeout(resolve,20));}}
let LegacyUserModel;
if(args.includes('--adapter')){
  context.window=context;context.self=context;context.innerWidth=300;context.innerHeight=400;
  const bundle=fs.readFileSync(path.join(root,'assets/js/live2dv3.js'),'utf8');
  if(!bundle.includes('i(i.s=18)'))throw new Error('Unexpected legacy renderer bundle; audit hook needs review');
  // Expose webpack modules ONLY in this VM copy. Frozen source bytes are never changed.
  vm.runInContext(bundle.replace('i(i.s=18)','globalThis.__auditRequire=i,i(i.s=18)'),context);
  const requireModule=context.__auditRequire;
  for(let i=0;i<requireModule.m.length;i++){const entry=requireModule(i);if(entry?.Live2DCubismFramework?.CubismUserModel)LegacyUserModel=entry.Live2DCubismFramework.CubismUserModel;}
  const framework=requireModule(0).Live2DCubismFramework.CubismFramework;framework.startUp();framework.initialize();
}
const results=[];
for(const entry of JSON.parse(fs.readFileSync(path.join(root,'catalog/models.json'))).models.filter(m=>m.format==='moc3')){
  const file=entry.files.find(f=>f.kind==='moc'),result={name:entry.name,path:file?.path};
  let moc,model,adapter;
  try{
    const data=fs.readFileSync(path.join(root,file.path));result.mocVersion=mocVersion(data);
    moc=core.Moc.fromArrayBuffer(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
    if(!moc)throw new Error('Core rejected MOC3 binary');
    model=core.Model.fromMoc(moc);if(!model)throw new Error('Core rejected model instance');
    model.update();result.status='accepted';result.parameters=model.parameters.count;result.drawables=model.drawables.count;
    if(LegacyUserModel){
      adapter=new LegacyUserModel();adapter.loadModel(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));adapter.getModel().update();
      if(adapter.getModel().getDrawableRenderOrders().length!==adapter.getModel().getDrawableCount())throw new Error('Legacy drawable render-order interface mismatch');
      result.legacyAdapter='accepted-load-update-and-drawable-accessors';
    }
  }catch(error){result.status=error.code==='ENOENT'?'not-tested-missing-local-file':'rejected';result.message=error.message;}
  finally{adapter?.release();model?.release();moc?._release();}
  results.push(result);
}
console.log(JSON.stringify({corePath,coreVersion:core.Version.csmGetVersion(),maxMocVersion:core.Version.csmGetLatestMocVersion(),scope:'Core binary acceptance and one update only; not WebGL rendering or texture verification',results},null,2));
