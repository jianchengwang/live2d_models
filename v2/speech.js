import {validateEndpoint} from './conversation.js';
import {responseBytes} from './model-source.js';
export class VoicePlayback {
  constructor(viewer,notify=()=>{}){this.viewer=viewer;this.notify=notify;this.config={enabled:false,mode:'browser',volume:1,rate:1,pitch:1,lang:'zh-CN'};this.generation=0;}
  configure(config={}){this.stop();this.config={...this.config,...config};}
  voices(){return globalThis.speechSynthesis?.getVoices()||[];}
  async prepare(){if(this.config.enabled&&this.config.mode==='endpoint'){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)throw new Error('此浏览器没有 Web Audio');this.context??=new C();await this.context.resume();}}
  stop(){this.generation++;this.request?.abort();this.request=null;if(this.utterance){globalThis.speechSynthesis?.cancel();this.utterance=null;}try{this.source?.stop();}catch{}this.source?.disconnect();this.gain?.disconnect();this.analyser?.disconnect();this.source=null;cancelAnimationFrame(this.animation);this.viewer.setLipSync(0);}
  async speak(text){
    this.stop();if(!this.config.enabled||!text)return;const id=this.generation,c=this.config;
    if(c.mode==='browser'){
      if(!globalThis.speechSynthesis||!globalThis.SpeechSynthesisUtterance)throw new Error('此浏览器不支持系统朗读');
      const u=new SpeechSynthesisUtterance(text.slice(0,3000));u.lang=c.lang;u.volume=Math.min(1,Math.max(0,c.volume));u.rate=Math.min(2,Math.max(.5,c.rate));u.pitch=Math.min(2,Math.max(.5,c.pitch));u.voice=this.voices().find(v=>v.name===c.voiceName)||null;this.utterance=u;
      // System synthesis exposes boundaries, not PCM. This is explicitly approximate lip movement.
      let boundary=0;u.onboundary=()=>{boundary=performance.now();};u.onstart=()=>{const tick=()=>{if(id!==this.generation)return;this.viewer.setLipSync(performance.now()-boundary<160?.45:.08);this.animation=requestAnimationFrame(tick);};tick();};
      u.onend=()=>{if(id===this.generation){cancelAnimationFrame(this.animation);this.viewer.setLipSync(0);this.utterance=null;}};u.onerror=()=>{if(id===this.generation){this.stop();this.notify('系统朗读未完成；可换声音或关闭语音');}};speechSynthesis.speak(u);return;
    }
    if(c.mode!=='endpoint'||!c.endpoint)throw new Error('请配置自己的音频 TTS endpoint');
    const endpoint=validateEndpoint(c.endpoint);const controller=new AbortController();this.request=controller;await this.prepare();if(id!==this.generation)return;
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text.slice(0,3000),voice:c.voiceName||c.lang,rate:c.rate,pitch:c.pitch}),signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    if(!response.headers.get('content-type')?.startsWith('audio/'))throw new Error('TTS 接口需返回 audio/* 音频；检查 CORS 和服务配置');
    const bytes=await responseBytes(response,8*1024*1024),buffer=await this.context.decodeAudioData(bytes.buffer);if(id!==this.generation)return;if(buffer.duration>120)throw new Error('TTS 音频超过 120 秒');
    this.source=this.context.createBufferSource();this.source.buffer=buffer;this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;this.gain=this.context.createGain();this.gain.gain.value=Math.max(0,Math.min(1,c.volume));this.source.connect(this.analyser);this.analyser.connect(this.gain);this.gain.connect(this.context.destination);
    const data=new Float32Array(256);const tick=()=>{if(id!==this.generation)return;this.analyser.getFloatTimeDomainData(data);const rms=Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length);this.viewer.setLipSync(Math.min(1,rms*7));this.animation=requestAnimationFrame(tick);};
    this.source.onended=()=>{if(id===this.generation)this.stop();};this.source.start();tick();
  }
  recognize(input){
    const C=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;if(!C)throw new Error('此浏览器不支持麦克风识别；可直接输入');
    this.recognition?.abort();const recognition=new C();this.recognition=recognition;recognition.lang=this.config.lang;recognition.interimResults=false;recognition.onresult=e=>{input(e.results[0][0].transcript);};recognition.onerror=()=>this.notify('麦克风识别失败或权限未允许');recognition.onend=()=>{if(this.recognition===recognition)this.recognition=null;};recognition.start();
  }
  async dispose(){this.stop();this.recognition?.abort();this.recognition=null;await this.context?.close();this.context=null;}
}
