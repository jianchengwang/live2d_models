// Optional model-specific UI behavior. The LLM adapter does not command the renderer.
export class BehaviorMap {
  constructor(viewer){this.viewer=viewer;this.profile={};}
  configure(profile){
    if(!profile || typeof profile!=='object' || Array.isArray(profile))throw new Error('行为映射必须为 JSON 对象');
    for(const [event,action] of Object.entries(profile)){
      if(!['thinking','complete','error'].includes(event) || !action || typeof action!=='object' || Array.isArray(action))throw new Error('仅支持 thinking/complete/error 映射');
      if(action.motion && (typeof action.motion.group!=='string' || !Number.isInteger(action.motion.index)))throw new Error('动作需要准确 group/index');
      if(action.expression!==undefined && typeof action.expression!=='string')throw new Error('表情需要准确 Name');
    }this.profile=structuredClone(profile);
  }
  apply(event){
    const action=this.profile[event];if(!action)return;
    const caps=this.viewer.listCapabilities();
    if(action.motion){if(!caps.motions.some(m=>m.group===action.motion.group && m.index===action.motion.index))throw new Error('当前模型没有映射动作');this.viewer.playMotion(action.motion);}
    if(action.expression){if(!caps.expressions.some(e=>e.name===action.expression))throw new Error('当前模型没有映射表情');this.viewer.setExpression(action.expression);}
  }
}
