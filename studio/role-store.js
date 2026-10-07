import {configJSON,parsePublicConfig} from '../v2/export.js';

export const roleStorageKey='live2d-studio-public-v1';
export function restoreRoles(storage,options={}){
 try{
  const source=storage?.getItem(roleStorageKey);
  return {config:source?parsePublicConfig(source,options):null,message:''};
 }catch{return {config:null,message:'已保存的公开配置无法读取，先使用默认角色。可重新导入配置。'};}
}
export function saveRoles(storage,config,options={}){
 try{
  const source=configJSON(config,options);
  if(!storage)return {saved:false,message:'此浏览器不能保存配置，当前页仍可使用；可下载配置 JSON。'};
  storage.setItem(roleStorageKey,source);
  return {saved:true,message:'已保存公开配置，刷新后保留；会话 key 和聊天记录不保存。'};
 }catch{return {saved:false,message:'当前配置暂未保存。检查资源 URL，或下载公开配置；本地 ZIP 只在当前标签页使用。'};}
}
