// Projection is x * matrix, y * matrix * (canvas width / height).
export function containTransform(bounds,width,height,{zoom=1,x=0,y=0}={}){
  const [left,bottom,right,top]=bounds;
  if(![...bounds,width,height].every(Number.isFinite)||right<=left||top<=bottom||width<=0||height<=0)throw new Error('无效模型边界');
  const aspect=width/height,clamp=(n,a,b)=>Math.min(b,Math.max(a,Number(n)||0));
  const scale=Math.min(1.76/(right-left),1.76/(aspect*(top-bottom)))*clamp(zoom,.2,2);
  return {scale,tx:-(left+right)*.5*scale+clamp(x,-.7,.7)*2,ty:-(bottom+top)*.5*scale-clamp(y,-.7,.7)*2/aspect};
}
export function drawableBounds(core){
  let left=Infinity,bottom=Infinity,right=-Infinity,top=-Infinity;
  for(let i=0;i<(core.getDrawableCount?.()||0);i++){
    if(core.getDrawableOpacity?.(i)<=.001)continue;
    const vertices=core.getDrawableVertices(i);
    for(let j=0;j<vertices.length;j+=2){const x=vertices[j],y=vertices[j+1];if(!Number.isFinite(x)||!Number.isFinite(y))continue;left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);}
  }
  if(right>left&&top>bottom)return [left,bottom,right,top];
  const w=core.getCanvasWidth(),h=core.getCanvasHeight();return [-w/2,-h/2,w/2,h/2];
}
