const prefix='studio-moc3-export-';
export function launchMoc3Export(project,status){
  if(!globalThis.BroadcastChannel)throw new Error('此浏览器无法交接；请保存项目，在导出页选择文件');
  const session=crypto.randomUUID(),channel=new BroadcastChannel(prefix+session);let sent=false;
  const close=()=>{clearTimeout(timer);channel.close();};const timer=setTimeout(()=>{close();status('导出页未确认收到项目；当前编辑仍保留，请重开导出页或选择保存的项目。');},60000);
  channel.onmessage=event=>{if(event.data?.type==='ready'&&!sent){sent=true;channel.postMessage({type:'project',project});}else if(event.data?.type==='loaded'){close();status('当前项目已交接；请在导出页生成并验收单参数 MOC3。');}else if(event.data?.type==='failed'){close();status('导出页未接收：'+String(event.data.message));}};
  const url=new URL('./moc3-export.html',import.meta.url);url.searchParams.set('ui','4');url.hash='session='+session;window.open(url.href,'_blank','noopener');status('正在交接当前项目；素材保持在当前浏览器，不上传。');return close;
}
export async function receiveMoc3Project(session){
  if(!/^[a-f0-9-]{36}$/.test(session)||!globalThis.BroadcastChannel)throw new Error('导出交接链接无效；请重新从编辑器打开或选择文件');
  return new Promise((resolve,reject)=>{const channel=new BroadcastChannel(prefix+session),timer=setTimeout(()=>{channel.close();reject(new Error('未收到编辑器项目；请保持编辑器打开或选择文件'));},18000);channel.onmessage=event=>{if(event.data?.type!=='project')return;clearTimeout(timer);channel.onmessage=null;resolve({project:event.data.project,complete:error=>{channel.postMessage(error?{type:'failed',message:error.message}:{type:'loaded'});channel.close();}});};channel.postMessage({type:'ready'});});
}
