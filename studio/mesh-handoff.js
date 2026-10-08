// Same-origin, memory-only handoff. No storage, server upload or demo fallback.
const prefix='studio-mesh-preview-';
export function launchPreview(project,status){
  if(!globalThis.BroadcastChannel)throw new Error('此浏览器不支持跨标签交接；请保存项目并在播放页打开文件');
  const session=crypto.randomUUID(),channel=new BroadcastChannel(prefix+session);let sent=false;
  const close=()=>{clearTimeout(timer);channel.close();};
  const timer=setTimeout(()=>{close();status('播放页未确认收到当前项目。请重新打开网页播放，或保存后在播放页选择文件；项目仍在编辑器中。');},60000);
  channel.onmessage=event=>{const message=event.data;if(message?.type==='ready'&&!sent){sent=true;channel.postMessage({type:'project',project});}
    else if(message?.type==='loaded'){close();status('当前项目已送到播放页，包含未保存的编辑。');}
    else if(message?.type==='failed'){close();status('播放页加载失败：'+String(message.message||'未知错误')+'；当前项目仍在编辑器中。');}};
  const url=new URL('./mesh-player.html',import.meta.url);url.searchParams.set('ui','3');url.hash='session='+session;window.open(url.href,'_blank','noopener');status('正在把当前项目送到播放页，包含未保存的编辑；无需先下载。');return close;
}
export function receivePreview(session){
  if(!/^[a-f0-9-]{36}$/.test(session)||!globalThis.BroadcastChannel)return Promise.reject(new Error('项目交接链接无效或浏览器不支持；请在此页打开保存的项目文件'));
  return new Promise((resolve,reject)=>{const channel=new BroadcastChannel(prefix+session);const timer=setTimeout(()=>{channel.close();reject(new Error('未收到编辑器项目。请保持编辑器打开并重新点击网页播放，或选择保存的项目文件。'));},18000);
    channel.onmessage=event=>{if(event.data?.type!=='project')return;clearTimeout(timer);channel.onmessage=null;resolve({project:event.data.project,complete:(error)=>{channel.postMessage(error?{type:'failed',message:error.message}:{type:'loaded'});channel.close();}});};channel.postMessage({type:'ready'});});
}
