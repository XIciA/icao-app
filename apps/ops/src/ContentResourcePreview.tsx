import { useEffect, useState } from 'react';
import { opsResponse } from './api';
export function ResourcePreview({order,path,image=false}:{order:string;path:string;image?:boolean}) {
  const [requested,setRequested]=useState(image);const [retry,setRetry]=useState(0);
  const [url,setUrl]=useState<string>();const [error,setError]=useState(false);
  useEffect(()=>{setUrl(undefined);setError(false);if(!requested)return;let current=true;let objectUrl:string|undefined;
    void opsResponse(`/v1/admin/content-orders/${order}/resource?path=${encodeURIComponent(path)}`).then(r=>r.blob()).then(blob=>{if(current){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{if(current)setError(true);});
    return ()=>{current=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[order,path,requested,retry]);
  return !requested?<button onClick={()=>setRequested(true)}>加载试听</button>:error?<div role="alert"><p>资源加载失败</p><button onClick={()=>setRetry(value=>value+1)}>重新加载资源</button></div>:url?image?<img className="content-resource-image" src={url} alt="内容预览"/>:<audio controls preload="metadata" src={url}/>:<p className="muted">正在加载资源…</p>;
}
