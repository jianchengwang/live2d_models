// Direct browser transport. Credentials remain private to this instance until clear().
export function validateEndpoint(value){
  const url=new URL(value);
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || /^(localhost|127\.|\[?::1\]?)/i.test(url.hostname))throw new Error('请填写无凭据、查询或片段的可信 HTTPS 完整 endpoint');
  return url.href;
}
const abortError=()=>new DOMException('会话已取消','AbortError');
export class Conversation {
  #key='';#config={mode:'mock'};
  configure({mode='mock',endpoint='',model='',key='',trusted=false}){
    this.clear();key=key.trim();
    if(mode==='direct'||mode==='backend'){
      if(!trusted || mode==='direct'&&(!key.trim()||!model.trim()) || model.length>200 || /[\x00-\x1f]/.test(model) || key&&(model.includes(key)||endpoint.includes(key)))throw new Error('需确认 endpoint 可信；BYOK 还需要模型与会话 key');
      this.#config={mode,endpoint:validateEndpoint(endpoint),model:model.trim()};this.#key=mode==='direct'?key.trim():'';
    }else if(mode!=='mock')throw new Error('不支持的 provider 模式');
  }
  clear(){this.#key='';this.#config={mode:'mock'};}
  get summary(){return {...this.#config,hasKey:!!this.#key};}
  async stream(messages,{signal,onText=()=>{}}={}){
    if(signal?.aborted)throw abortError();
    if(this.#config.mode==='mock'){
      let text='';for(const part of ['这是本地 mock 回复。','模型动作与表情由独立配置映射，','没有向外部服务发送信息。']){
        await new Promise((resolve,reject)=>{const finish=()=>{signal?.removeEventListener('abort',cancel);resolve();};const timer=setTimeout(finish,100);const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(abortError());};signal?.addEventListener('abort',cancel,{once:true});});
        text+=part;onText(text);
      }return text;
    }
    // Snapshot protects an in-flight request from a later configure/clear.
    const config=this.#config,key=this.#key;let reader,buffer='',pending='',output='',rawCount=0;
    const redact=text=>key?text.split(key).join('[credential redacted]'):text;
    const emit=(text,final=false)=>{
      pending+=text;
      if(pending.length+output.length>100000)throw new Error('回复超出会话长度上限');
      // Retain a key-length suffix, so even an echoed credential split over chunks is never displayed.
      pending=redact(pending);
      const cut=final?pending.length:Math.max(0,pending.length-key.length+1);
      if(cut){output+=pending.slice(0,cut);pending=pending.slice(cut);onText(output);}
    };
    let done=false;
    const event=block=>{
      const lines=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart());if(!lines.length)return;
      const data=lines.join('\n');if(data==='[DONE]'){done=true;return;}
      let frame;try{frame=JSON.parse(data);}catch{throw new Error('供应商 SSE JSON 无效');}
      if(frame.error)throw new Error('供应商返回错误事件');
      const delta=frame.choices?.[0]?.delta?.content;if(typeof delta==='string')emit(delta);
    };
    try{
      const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify({model:config.model,messages:messages.map(m=>({role:m.role,content:m.content})),stream:true}),signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)throw new Error(`供应商 HTTP ${response.status}`);
      if(!response.headers.get('content-type')?.includes('text/event-stream') || !response.body)throw new Error('需要 text/event-stream 响应');
      reader=response.body.getReader();const decode=new TextDecoder();let trailingCR=false;
      while(!done){
        const item=await reader.read();if(signal?.aborted)throw abortError();
        let text=decode.decode(item.value || new Uint8Array(),{stream:!item.done});
        // Normalize CRLF even when CR and LF arrive in separate network reads.
        if(trailingCR){if(text.startsWith('\n'))text=text.slice(1);trailingCR=false;}
        if(text.endsWith('\r')){text=text.slice(0,-1)+'\n';trailingCR=true;}
        buffer+=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');rawCount+=item.value?.length || 0;
        if(rawCount>4*1024*1024 || buffer.length>1024*1024)throw new Error('SSE 数据超限');
        let at;while((at=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,at);buffer=buffer.slice(at+2);event(block);if(done)break;}
        if(item.done){if(buffer.trim())event(buffer);if(!done)throw new Error('供应商流提前结束，缺少 [DONE]');break;}
      }
      emit('',true);return output;
    }catch(error){
      if(signal?.aborted || error.name==='AbortError')throw abortError();
      if(error instanceof TypeError)throw new Error('无法直连供应商：检查 endpoint、网络和 CORS；工作台不会使用公共代理');
      // Never surface arbitrary provider/fetch errors that could include credentials or URLs.
      if(/^供应商 |^需要 |^SSE |^回复/.test(error.message))throw new Error(redact(error.message));
      throw new Error('供应商连接失败');
    }finally{try{await reader?.cancel();}catch{}reader?.releaseLock();}
  }
}
