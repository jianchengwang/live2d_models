// Framework-neutral SDK. Each legacy renderer owns an isolated document/context.
export class Live2DViewer extends EventTarget {
  constructor(container,options={}) {
    super(); this.container = container; this.frame = null; this.model = null;
    this.pending = null; this.disposed = false; this.timer = null; this.resizeTimer = null; this.paused = false;
    this.options=options;this.view={zoom:1,x:0,y:0,...options.view};
    this.listener = (event) => this.receive(event);
    window.addEventListener('message', this.listener);
    this.visibility = () => {
      if (document.hidden) { this.wasPausedBeforeHidden = this.paused; this.pause(); }
      else if (!this.wasPausedBeforeHidden) this.resume();
    };
    document.addEventListener('visibilitychange', this.visibility);
    this.observer = new ResizeObserver(entries => {
      clearTimeout(this.resizeTimer);
      if (entries[0]?.contentRect.width <= 0 || entries[0]?.contentRect.height <= 0) return;
      if (this.frame && this.model) this.resizeTimer = setTimeout(() => this.command('resize',this.dimensions()),80);
    });
    this.observer.observe(container);
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, {detail})); }
  dimensions(){return {width:Math.max(1,this.container.clientWidth||300),height:Math.max(1,this.container.clientHeight||400),dpr:Math.min(devicePixelRatio||1,2)};}
  setView(view){this.view={...this.view,...view};this.command('view',this.view);}
  setLipSync(value){if(this.ready)this.command('lip-sync',{value:Math.max(0,Math.min(1,Number(value)||0))});}
  stopFrame(reason = new DOMException('Load superseded', 'AbortError')) {
    clearTimeout(this.timer);
    this.pending?.cleanup(); this.pending?.reject(reason);this.ready=false; this.pending = null;
    this.command('dispose');this.frame?.remove(); this.frame = null;
  }
  load(model, {signal, timeoutMs = 20000} = {}) {
    if (this.disposed) return Promise.reject(new Error('Viewer destroyed'));
    clearTimeout(this.resizeTimer);this.stopFrame(); this.model = model;
    if (signal?.aborted) return Promise.reject(signal.reason || new DOMException('Aborted','AbortError'));
    if (model.format !== 'moc3') return Promise.reject(new Error('首轮预览仅支持 moc3；旧 moc 保留索引'));
    if (!model.validation?.referencesComplete) return Promise.reject(new Error('模型依赖不完整，请查看诊断；旧包保持原样'));
    const entry = new URL(model.entryUrl, location.href);
    const assetPath=new URL('../assets/model/',import.meta.url).pathname;
    const loopback=url=>['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    const remote=this.options.allowRemote&&(entry.protocol==='https:'||entry.protocol==='http:'&&location.protocol==='http:'&&loopback(entry)&&loopback(location))&&!entry.username&&!entry.password&&!entry.search&&!entry.hash;
    const own=this.options.allowRemote&&entry.origin===location.origin&&entry.protocol===location.protocol;
    if (!remote&&!own&&(entry.origin !== location.origin || !(model.localImport && entry.protocol==='blob:') && !(entry.protocol===location.protocol && entry.pathname.startsWith(assetPath))))
      return Promise.reject(new Error('只允许当前工作台的本地模型'));
    this.model={...model,entryUrl:entry.href,files:(model.files||[]).map(f=>({...f,url:new URL(f.url,location.href).href}))};
    this.token = crypto.randomUUID();
    const frame = document.createElement('iframe');
    frame.title = '独立 Live2D 模型预览'; frame.className = 'viewer-frame';
    frame.setAttribute('sandbox','allow-scripts allow-same-origin');
    const frameURL=new URL('./frame.html',import.meta.url);frameURL.searchParams.set('token',this.token);
    if(this.options.embedded){
      const base=new URL('./',import.meta.url),runtime=new URL(this.options.runtimeBase||'../',base);
      const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const policy=`default-src 'none'; script-src 'self' ${base.origin} ${runtime.origin} 'wasm-unsafe-eval'; style-src 'self' ${base.origin}; img-src 'self' https: blob: data:; connect-src 'self' ${base.origin} ${runtime.origin} ${entry.origin} https: blob:; object-src 'none'; base-uri 'none'; form-action 'none'`;
      frame.srcdoc=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(policy)}"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="${esc(new URL('frame.css',base))}"></head><body data-token="${esc(this.token)}" data-parent-origin="${esc(location.origin)}" data-runtime-base="${esc(runtime.href)}"><div id="canvas"></div><script type="module" src="${esc(new URL('frame.js',base))}"></script></body></html>`;
    }else frame.src=frameURL.href;
    this.frame = frame;
    const promise = new Promise((resolve, reject) => {
      const abort = () => this.fail(signal.reason || new DOMException('Aborted','AbortError'));
      this.pending = {resolve, reject, cleanup: () => signal?.removeEventListener('abort', abort)};
      signal?.addEventListener('abort', abort, {once:true});
      this.timer = setTimeout(() => this.fail(new Error('Core / 模型加载超时；可能不兼容当前旧 Core')), timeoutMs);
    });
    this.container.replaceChildren(frame); this.emit('loading', {model});
    return promise;
  }
  receive(event) {
    if (event.origin !== location.origin || event.source !== this.frame?.contentWindow || event.data?.token !== this.token) return;
    const {type, detail} = event.data;
    if (type === 'frame-ready') this.command('load', {model:this.model,...this.dimensions(),view:this.view});
    else if (type === 'loaded') {
      clearTimeout(this.timer); this.pending?.cleanup(); this.pending?.resolve(detail); this.pending = null;
      this.unavailableMotions=detail.unavailableMotions || [];this.lipSyncIds=detail.lipSyncIds||this.model.lipSyncIds||[];this.ready=true;this.emit(type, detail); if (this.paused || document.hidden) this.pause();
    } else if (type === 'error') this.fail(new Error(detail.message));
    else if (['hit','motion-start','expression-start','action-error','context-lost','context-restored','paused','resumed'].includes(type)) this.emit(type, detail);
  }
  fail(error) { this.stopFrame(error); this.emit('error', {message:error.message}); }
  command(command, payload = {}) { this.frame?.contentWindow?.postMessage({token:this.token, command, payload}, location.origin); }
  playMotion({group, index, priority = 2}) {
    if(!this.ready)throw new Error('模型预览未就绪');
    const motion = this.model?.motions?.find(m => m.group === group && m.index === index);
    if(this.unavailableMotions?.some(m=>m.group===group && m.index===index))throw new Error('动作结构与旧 renderer 不兼容，请查看诊断');
    if (!motion) throw new Error('此模型没有该动作');
    this.command('motion', {group,index,priority:Math.max(1,Math.min(3,priority))});
  }
  setExpression(name) {
    if(!this.ready)throw new Error('模型预览未就绪');
    if (!this.model?.expressions?.some(e => e.name === name)) throw new Error('此模型没有该表情');
    this.command('expression', {name});
  }
  listCapabilities() { return {motions:(this.model?.motions || []).filter(m=>!this.unavailableMotions?.some(x=>x.group===m.group && x.index===m.index)), expressions:this.model?.expressions || [], lipSyncIds:this.lipSyncIds || []}; }
  pause() { this.paused = true; this.command('pause'); }
  resume() { this.paused = false; this.command('resume'); }
  destroy() {
    if (this.disposed) return;
    this.disposed = true; clearTimeout(this.resizeTimer); this.observer.disconnect(); this.stopFrame();
    window.removeEventListener('message',this.listener); document.removeEventListener('visibilitychange',this.visibility);
    this.model = null;
  }
}
