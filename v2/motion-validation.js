// Checks/corrects allocation counts only in an opted-in renderer response; source bytes stay frozen.
export function prepareMotion(data,{compatibility=false}={}){
  const meta=data?.Meta,curves=data?.Curves;
  if(data?.Version!==3 || !meta || !Array.isArray(curves) || !Number.isFinite(meta.Duration) || meta.Duration<0 || curves.length>1024)throw new Error('motion3 Meta/Curves 无效');
  let segments=0,points=0;
  for(const curve of curves){
    const a=curve.Segments;
    if(!Array.isArray(a) || a.length<2 || a.length>100000 || !a.every(Number.isFinite) || typeof curve.Id!=='string' || !['Model','Parameter','PartOpacity'].includes(curve.Target))throw new Error('曲线 Segments/Target/Id 无效');
    points++;let i=2;
    while(i<a.length){const type=a[i];if(![0,1,2,3].includes(type))throw new Error('不支持的曲线 segment 类型');const n=type===1?7:3;if(i+n>a.length)throw new Error('曲线 segment 不完整');i+=n;segments++;points+=type===1?3:1;}
  }
  const mismatch=meta.CurveCount!==curves.length || meta.TotalSegmentCount!==segments || meta.TotalPointCount!==points;
  if(mismatch && !compatibility)throw new Error('motion3 计数与实际曲线不一致；请显式选择兼容预览');
  if(!mismatch)return {data,normalized:false};
  const normalized=structuredClone(data);Object.assign(normalized.Meta,{CurveCount:curves.length,TotalSegmentCount:segments,TotalPointCount:points});
  return {data:normalized,normalized:true};
}
export const validateMotion=data=>{prepareMotion(data);return true;};
