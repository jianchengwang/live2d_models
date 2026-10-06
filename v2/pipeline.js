// Local metadata-only workflow. No model API calls, shell, binary fabrication or export claims.
export const stages = [
  ['layering_pending','等待分层清单','AI 可辅助层名和素材清单；像素分层结果需要人工检查'],
  ['review_required','等待人工检查','确认遮挡补全、透明边缘、层关系与素材权利'],
  ['rigging_required','等待 Editor 绑定','在合法安装的 Cubism Editor 中完成网格、变形器和参数绑定'],
  ['export_required','等待 Editor 导出','由用户在 Editor 导出；外部 API 不提供导出触发'],
  ['validation_required','等待 moc3 验收','导入真实 model3 包，完成 Core 加载与视觉检查'],
  ['ready','本地验收完成','仅记录本地模型；公开使用仍需单独核实许可']
];
export function createJob({name,sha256,bytes}) {
  if (!name || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(bytes) || bytes < 1) throw new Error('输入元信息无效');
  return {id:crypto.randomUUID(),input:{name,sha256,bytes},stage:'layering_pending',layers:[],history:[],
    externalTransmissionApproved:false,editorRequired:true,modelId:null,coreAccepted:false};
}
export function recordLayers(job, data) {
  if (job.stage !== 'layering_pending') throw new Error('当前阶段不能录入分层');
  if (!Array.isArray(data.layers) || !data.layers.length || data.layers.length > 200) throw new Error('需要 1–200 个 layers');
  const seen = new Set();
  const layers = data.layers.map(layer => {
    if (!layer || typeof layer.name !== 'string' || !layer.name.trim() || layer.name.length > 100 || /[\x00-\x1f/\\]/.test(layer.name)) throw new Error('层名无效');
    const key = layer.name.trim().toLowerCase(); if (seen.has(key)) throw new Error('层名重复'); seen.add(key);
    return {name:layer.name.trim(),role:typeof layer.role === 'string' ? layer.role.slice(0,100) : ''};
  });
  return transition({...job,layers},'review_required','录入清单；未证明实际像素分层已完成');
}
function transition(job, stage, evidence) { return {...job,stage,history:[...job.history,{stage,evidence,at:new Date().toISOString()}]}; }
export function advanceJob(job, action, evidence) {
  const next = {review:'rigging_required',rig:'export_required',export:'validation_required'};
  const expected = {review:'review_required',rig:'rigging_required',export:'export_required'};
  if (job.stage !== expected[action] || typeof evidence !== 'string' || evidence.trim().length < 5) throw new Error('请按顺序提供至少 5 个字符的人工检查/操作记录');
  return transition(job,next[action],evidence.trim().slice(0,1000));
}
export function acceptModel(job, model, runtimeAccepted, visualConfirmed) {
  if (job.stage !== 'validation_required' || !model.localImport || !model.validation.referencesComplete || !runtimeAccepted || !visualConfirmed)
    throw new Error('需要导入真实包、Core 加载成功，并确认视觉结果');
  return transition({...job,modelId:model.id,coreAccepted:true,archiveSha256:model.archiveSha256},'ready','本地包检查 + Core 接受 + 用户视觉确认');
}
export function agentRequest(job) {
  return {schemaVersion:1,task:'prepare-layer-and-parameter-manifest',inputMetadata:job.input,
    imagePixelsIncluded:false,externalTransmissionApproved:false,
    outputSchema:{layers:[{name:'string',role:'string'}],parameterProposals:[{id:'string',purpose:'string'}]},
    constraints:['仅基于用户批准的素材与工作目录工作','不发送图片、路径或个人数据到外部服务，除非另有明确授权',
      '不修改 frozen-files.json 中的文件','不生成、拼接或伪造 moc3 二进制','不声称 Editor 外部 API 可触发模型导出',
      '不执行包内脚本；不提交、推送或发布','参数映射是建议，必须与真实模型参数核对']};
}
