const coreURL='https://cubism.live2d.com/sdk-web/core/06/live2dcubismcore.min.js';
const integrity='sha384-KshektsgDLeJaInLQF891mST1tYYMpWEuzK4rQ6eYpwBwPohR3CjQEO855CYGgh6';
let pending;
export function loadMoc3Core(){return pending??=initialize().catch(error=>{pending=null;throw error;});}
async function initialize(){
  const response=await fetch(new URL('../v2/runtime.json',import.meta.url),{credentials:'omit',redirect:'error'});if(!response.ok)throw new Error('官方运行时配置无法读取');const runtime=await response.json();
  if(runtime.cubism53CoreURL!==coreURL||runtime.cubism53CoreIntegrity!==integrity)throw new Error('官方 Core 来源或完整性与已验收版本不符');
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=coreURL;script.integrity=integrity;script.crossOrigin='anonymous';script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('官方 Core 加载失败；检查网络、CSP 或完整性'));};document.head.append(script);});
  for(let i=0;i<150;i++){try{globalThis.Live2DCubismCore.Version.csmGetVersion();return;}catch{}await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('官方 Core 初始化超时');
}
