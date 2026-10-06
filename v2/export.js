import {publicUrl} from './model-source.js';
import {crc32,safePath} from './importer.js';
const enc=new TextEncoder(),number=(n,def,min,max)=>Number.isFinite(Number(n))?Math.max(min,Math.min(max,Number(n))):def;
const text=(value,max=200)=>String(value||'').slice(0,max).replace(/[\x00-\x1f]/g,'');
export function publicConfig(raw,{base=globalThis.location?.href}={}){
  const chat=raw.chat||{},voice=raw.voice||{},a=raw.appearance||{},mode=['mock','direct','backend'].includes(chat.mode)?chat.mode:'mock';
  const cfg={schemaVersion:1,title:text(raw.title||'Live2D 伙伴',50),modelUrl:publicUrl(raw.modelUrl,base),models:(raw.models||[]).slice(0,64).map(m=>({name:text(m.name,60),url:publicUrl(m.url,base)})),runtimeBase:publicUrl(raw.runtimeBase||new URL('../',import.meta.url).href,base),compatibility:raw.compatibility!==false,
    appearance:{width:number(a.width,240,100,700),height:number(a.height,360,160,700),side:a.side==='left'?'left':'right',bottom:number(a.bottom,20,0,100),gutter:number(a.gutter,16,0,100),zoom:number(a.zoom,1,.2,2),x:number(a.x,0,-.7,.7),y:number(a.y,0,-.7,.7)},
    chat:{mode,endpoint:mode==='mock'||!chat.endpoint?'':publicUrl(chat.endpoint,base),model:text(chat.model,200),systemPrompt:text(chat.systemPrompt,2000)},
    voice:{enabled:!!voice.enabled,mode:voice.mode==='endpoint'?'endpoint':'browser',endpoint:voice.mode==='endpoint'?publicUrl(voice.endpoint,base):'',lang:text(voice.lang||'zh-CN',30),voiceName:text(voice.voiceName,100),volume:number(voice.volume,1,0,1),rate:number(voice.rate,1,.5,2),pitch:number(voice.pitch,1,.5,2)}};
  if(!new URL(cfg.modelUrl).pathname.endsWith('.model3.json')||cfg.models.some(m=>!new URL(m.url).pathname.endsWith('.model3.json')))throw new Error('导出模型必须是完整 model3.json 入口');
  if(!new URL(cfg.runtimeBase).pathname.endsWith('/'))throw new Error('runtimeBase 必须是资源目录 URL');
  // Whitelist construction intentionally never reads key/apiKey/provider credentials.
  return cfg;
}
const jsJSON=value=>JSON.stringify(value,null,2).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function embedCode(config,moduleUrl){return `<script type="module">\nimport {createLive2DWidget} from ${JSON.stringify(moduleUrl)};\nconst companion = await createLive2DWidget(${jsJSON(config)});\n// companion.open(); companion.setModel('https://your-site/model/model.model3.json');\n// companion.dispose();\n</script>`;}
export function bootstrapJS(config,moduleUrl){return `/* Live2D widget configuration. No API key or model binary is embedded. */\n(() => {\n  const baseUrl = document.currentScript?.src || location.href;\n  const config = ${jsJSON(config)};\n  import(new URL(${JSON.stringify(moduleUrl)}, baseUrl).href)\n    .then(({createLive2DWidget}) => createLive2DWidget({...config, baseUrl}))\n    .catch(() => console.error('Live2D widget could not start; check resource URLs, CORS and CSP.'));\n})();\n`;}
export function zipFiles(files){
  if(files.size>1000)throw new Error('导出文件过多');const local=[],central=[];let offset=0,total=0;
  for(const [raw,data] of files){const path=safePath(raw),name=enc.encode(path),bytes=typeof data==='string'?enc.encode(data):new Uint8Array(data);total+=bytes.length;if(total>64*1024*1024)throw new Error('导出包超过 64 MiB，请单独部署模型资源');const crc=crc32(bytes),head=new Uint8Array(30+name.length),v=new DataView(head.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);head.set(name,30);local.push(head,bytes);
    const c=new Uint8Array(46+name.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,0x21,true);d.setUint32(16,crc,true);d.setUint32(20,bytes.length,true);d.setUint32(24,bytes.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=head.length+bytes.length;
  }
  const size=central.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.size,true);v.setUint16(10,files.size,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...local,...central,end],{type:'application/zip'});
}
export const runtimeFiles=['widget.js','widget.css','sdk.js','frame.js','frame.html','frame.css','runtime.json','fit.js','model-source.js','conversation.js','behavior.js','speech.js','motion-validation.js','model-compatibility.js','importer.js','import-worker.js'];
export async function buildEmbedPackage(raw,{localPackage,includeLocalModel=false,signal,fetchFile}={}){
  if(includeLocalModel&&!localPackage)throw new Error('没有本地模型包可导出');
  const config=publicConfig({...raw,modelUrl:includeLocalModel?'https://model.example/model.model3.json':raw.modelUrl,models:includeLocalModel?[]:raw.models});
  const files=new Map();
  for(const name of runtimeFiles){if(signal?.aborted)throw new DOMException('导出已取消','AbortError');const content=fetchFile?await fetchFile(name):await fetch(new URL(name,import.meta.url),{signal,credentials:'omit',redirect:'error'}).then(r=>{if(!r.ok)throw new Error('组件文件未就绪：'+name);return r.text();});files.set(name,content);}
  if(includeLocalModel){
    const model=localPackage.model;config.modelUrl='./model/'+safePath(model.entryPath);config.models=[{name:model.name,url:config.modelUrl}];
    const entries=[{path:model.entryPath,url:model.entryUrl},...model.files];
    for(const f of entries){if(signal?.aborted)throw new DOMException('导出已取消','AbortError');const path='model/'+safePath(f.path);if(!files.has(path)){const r=await fetch(f.url,{signal});files.set(path,new Uint8Array(await r.arrayBuffer()));}}
  }
  files.set('config.json',jsJSON(config)+'\n');files.set('live2d-widget.js',bootstrapJS(config,'./widget.js'));
  files.set('start.js',`import {createLive2DWidget} from './widget.js';\nconst configURL=new URL('./config.json',import.meta.url);\nconst config=await fetch(configURL).then(r=>r.json());\nwindow.companion=await createLive2DWidget({...config,baseUrl:configURL.href});\n`);
  files.set('index.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><link rel="icon" href="data:,"><title>我的 Live2D 伙伴</title><body><h1>你的网页内容</h1><p>右下角是独立样式的 Live2D 小人，点开即可对话。默认可先用本地演示，运行时再配置自己的供应商。</p><script type="module" src="./start.js"></script></body></html>`);
  files.set('README.md',`# 可嵌入的 Live2D 伙伴\n\n此包包含 widget.js、公开 config.json、示例 index.html 和组件依赖。它没有把 moc3 转换成 JS，也没有 API key。\n\n1. 将包解压到自己的静态网站；请通过 HTTP/HTTPS 访问，不能直接 file:// 双击。开发可运行 python3 -m http.server。\n2. 打开 index.html 看示例。自己页面可引入 <script src="./live2d-widget.js" defer></script>，或 import {createLive2DWidget} from './widget.js'。\n3. config.json 的 modelUrl 指向完整 model3.json 入口；其 moc3、纹理、动作等须保持完整相对目录。默认引用所选模型的现有 URL，不捆绑仓库模型。${includeLocalModel?'本次按你的明确部署权确认，包含你提供的本地模型文件；部署时保留 model/ 内的目录。':'模型资源没有包含在此包中；如果要自部署模型，请确认权限后独立部署完整资源并修改 modelUrl。'}\n4. runtimeBase 指向旧 Core/renderer 资源根地址；新版 MOC3 由 runtime.json 路由到已验收的官方 Cubism 5.2 hosting 分支，并用 integrity 固定测试过的字节。本包不包含供应商二进制。自部署运行时需满足适用的 Live2D 许可，保持 assets/js/lib/live2dcubismcore.min.js 与 assets/js/live2dv3.js 结构。\n5. 异源模块、模型和自己的对话/TTS endpoint 必须允许访客网站 CORS。CSP 需允许组件模块、组件样式、runtimeBase 和 https://cubism.live2d.com 的脚本；不会提供绕过 CORS 的公共代理。\n6. chat.mode 为 mock（不联网）、direct（访客在设置里明确选择可信 endpoint 并输入会话 key）或 backend（你自己的 OpenAI-compatible SSE endpoint）。服务器供应商密钥只放服务器；永远不要放 config.json、JS 或 URL。backend 返回 text/event-stream，事件使用 choices[0].delta.content，结束为 data: [DONE]。\n7. voice.mode 为 browser 时用设备 speechSynthesis 声音，发音事件只提供近似口型。endpoint 模式向你的可信音频服务 POST {text,voice,rate}，返回 audio/*；按实际音频波形同步口型，无前端 TTS key。音量、语速、音调与声音可配置。能力依浏览器和模型口型参数而定。麦克风仅点击后请求识别，可能使用浏览器服务。\n8. companion.setModel(url)、setAppearance({...})、open()、dispose() 可由宿主调用；离开页面自动取消请求、识别、音频和渲染。\n\n未知模型授权不因导出而改变。既有旧 Core 可能不兼容新版 moc3；应更换合法运行时或模型，不伪造模型。\n`);
  return {config,files,blob:zipFiles(files)};
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
