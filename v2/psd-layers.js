// Minimal PSD v1 reader based on Adobe's public file-format specification.
// Only flat, normal-blend, 8-bit RGB layers with raw/PackBits pixels are accepted.
export function readPSDLayers(input) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length>64*1024*1024)throw new Error('PSD 超过 64 MiB');
  let at=0,budget=0;
  const need=(n,end=bytes.length)=>{if(!Number.isSafeInteger(n)||n<0||at+n>end)throw new Error('PSD 数据截断或长度无效');};
  const take=n=>{need(n);const b=bytes.subarray(at,at+n);at+=n;return b;};
  const u8=()=>take(1)[0],u16=()=>{need(2);const n=view.getUint16(at);at+=2;return n;},i16=()=>{need(2);const n=view.getInt16(at);at+=2;return n;},u32=()=>{need(4);const n=view.getUint32(at);at+=4;return n;},i32=()=>{need(4);const n=view.getInt32(at);at+=4;return n;},str=n=>new TextDecoder().decode(take(n));
  if(str(4)!=='8BPS'||u16()!==1)throw new Error('请选择 PSD v1；暂不支持 PSB');take(6);u16();const height=u32(),width=u32(),depth=u16(),mode=u16();
  if(!width||!height||width>4096||height>4096||depth!==8||mode!==3)throw new Error('需要不超过 4096 × 4096 的 8-bit RGB PSD');
  for(let i=0;i<2;i++)take(u32());
  const sectionSize=u32(),sectionEnd=at+sectionSize;need(sectionSize);if(!sectionSize)throw new Error('PSD 没有分层像素');
  const infoSize=u32(),infoEnd=at+infoSize;need(infoSize,sectionEnd);const count=Math.abs(i16());if(!count||count>64)throw new Error('需要 1–64 个平面图层');
  const records=[];
  for(let i=0;i<count;i++){
    const top=i32(),left=i32(),bottom=i32(),right=i32(),h=bottom-top,w=right-left,n=u16(),channels=[];
    if(w<0||h<0||w>4096||h>4096||n>16)throw new Error('图层尺寸或通道无效');
    for(let j=0;j<n;j++)channels.push({id:i16(),length:u32()});
    if(str(4)!=='8BIM')throw new Error('PSD 图层签名无效');const blend=str(4),opacity=u8(),clipping=u8();if(clipping)throw new Error('暂不支持剪贴图层，请先合并到像素');const flags=u8();u8();
    const extraSize=u32(),end=at+extraSize;need(extraSize,infoEnd);const maskSize=u32();if(maskSize)throw new Error('暂不支持图层蒙版，请先应用蒙版到像素');take(u32());
    const nameLength=u8();let name=new TextDecoder().decode(take(nameLength));take((4-(1+nameLength)%4)%4);
    while(at+12<=end){const signature=str(4),key=str(4),length=u32();if(!['8BIM','8B64'].includes(signature))throw new Error('PSD 附加信息签名无效');need(length,end);const start=at;
      if(key==='luni'){const units=u32();if(units>200||4+units*2>length)throw new Error('图层名无效');name='';for(let j=0;j<units;j++)name+=String.fromCharCode(u16());}
      if(['lrFX','lfx2','lfxs'].includes(key))throw new Error('暂不支持图层效果，请先应用到像素');
      if(key==='lsct'&&length>=4&&view.getUint32(start)!==0)throw new Error('第一版需要平面图层；请先展开组再导入');
      at=start+length+(length%2);
    }
    at=end;records.push({id:'layer-'+i,name:(name||'图层 '+(i+1)).slice(0,100),left,top,width:w,height:h,opacity:opacity/255,visible:!(flags&2),blend,channels});
  }
  const layers=[];
  for(const record of records){const planes={};
    for(const channel of record.channels){const end=at+channel.length;need(channel.length,infoEnd);if(channel.length<2)throw new Error('PSD 通道长度无效');const compression=u16();
      if(!record.width||!record.height||![-1,0,1,2].includes(channel.id)){at=end;continue;}
      if(![0,1].includes(compression))throw new Error('暂仅支持 Raw / RLE PSD；请另存 RLE PSD');
      const pixels=record.width*record.height;budget+=pixels;if(budget>256*1024*1024)throw new Error('PSD 解码超过 256 MiB');const plane=new Uint8Array(pixels);
      if(compression===0){need(pixels,end);plane.set(take(pixels));}
      else {need(record.height*2,end);const lengths=Array.from({length:record.height},()=>u16());let dest=0;
        for(const length of lengths){const rowEnd=at+length;need(length,end);const destEnd=dest+record.width;
          while(at<rowEnd){let n=u8();if(n<=127){const size=n+1;need(size,rowEnd);if(dest+size>destEnd)throw new Error('RLE 行像素溢出');plane.set(take(size),dest);dest+=size;}
            else if(n>=129){const size=257-n;need(1,rowEnd);if(dest+size>destEnd)throw new Error('RLE 行像素溢出');plane.fill(u8(),dest,dest+size);dest+=size;}}
          if(dest!==destEnd)throw new Error('RLE 行像素不完整');
        }
      }
      if(at!==end)throw new Error('PSD 通道像素长度不匹配');planes[channel.id]=plane;
    }
    if(!record.width||!record.height)continue;
    if(record.blend!=='norm')throw new Error('第一版仅支持普通混合模式；请先合并效果到像素');
    if(![0,1,2].every(id=>planes[id]))throw new Error('图层缺少 RGB 像素');
    const rgba=new Uint8ClampedArray(record.width*record.height*4);for(let i=0;i<record.width*record.height;i++){rgba[i*4]=planes[0][i];rgba[i*4+1]=planes[1][i];rgba[i*4+2]=planes[2][i];rgba[i*4+3]=planes[-1]?.[i]??255;}
    const {channels,blend,...layer}=record;layers.push({...layer,rgba});
  }
  return {width,height,layers};
}
