// Framework-neutral SDK. Each legacy renderer owns an isolated document/context.
export class Live2DViewer extends EventTarget {
  constructor(container) {
    super(); this.container = container; this.frame = null; this.model = null;
    this.pending = null; this.disposed = false; this.timer = null; this.resizeTimer = null; this.paused = false;
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
      if (this.frame && this.model) this.resizeTimer = setTimeout(() => {
        this.load(this.model).catch(() => {});
      }, 160);
    });
    this.observer.observe(container);
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, {detail})); }
  stopFrame(reason = new DOMException('Load superseded', 'AbortError')) {
    clearTimeout(this.timer);
    this.pending?.cleanup(); this.pending?.reject(reason);this.ready=false; this.pending = null;
    this.frame?.remove(); this.frame = null;
  }
  load(model, {signal, timeoutMs = 20000} = {}) {
    if (this.disposed) return Promise.reject(new Error('Viewer destroyed'));
    clearTimeout(this.resizeTimer);this.stopFrame(); this.model = model;
    if (signal?.aborted) return Promise.reject(signal.reason || new DOMException('Aborted','AbortError'));
    if (model.format !== 'moc3') return Promise.reject(new Error('首轮预览仅支持 moc3；旧 moc 保留索引'));
    if (!model.validation?.referencesComplete) return Promise.reject(new Error('模型依赖不完整，请查看诊断；旧包保持原样'));
    const entry = new URL(model.entryUrl, location.href);
    const assetPath=new URL('../assets/model/',import.meta.url).pathname;
    if (entry.origin !== location.origin || !(model.localImport && entry.protocol==='blob:') && !(entry.protocol===location.protocol && entry.pathname.startsWith(assetPath)))
      return Promise.reject(new Error('只允许当前工作台的本地模型'));
    this.token = crypto.randomUUID();
    const frame = document.createElement('iframe');
    frame.title = '独立 Live2D 模型预览'; frame.className = 'viewer-frame';
    frame.setAttribute('sandbox','allow-scripts allow-same-origin');
    const frameURL=new URL('./frame.html',import.meta.url);frameURL.searchParams.set('token',this.token);frame.src=frameURL.href;
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
    if (type === 'frame-ready') this.command('load', {model:this.model, dpr:Math.min(devicePixelRatio || 1, 2)});
    else if (type === 'loaded') {
      clearTimeout(this.timer); this.pending?.cleanup(); this.pending?.resolve(detail); this.pending = null;
      this.unavailableMotions=detail.unavailableMotions || [];this.ready=true;this.emit(type, detail); if (this.paused || document.hidden) this.pause();
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
  listCapabilities() { return {motions:(this.model?.motions || []).filter(m=>!this.unavailableMotions?.some(x=>x.group===m.group && x.index===m.index)), expressions:this.model?.expressions || [], lipSyncIds:this.model?.lipSyncIds || []}; }
  pause() { this.paused = true; this.command('pause'); }
  resume() { this.paused = false; this.command('resume'); }
  destroy() {
    if (this.disposed) return;
    this.disposed = true; clearTimeout(this.resizeTimer); this.observer.disconnect(); this.stopFrame();
    window.removeEventListener('message',this.listener); document.removeEventListener('visibilitychange',this.visibility);
    this.model = null;
  }
}
