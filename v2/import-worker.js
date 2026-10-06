import {readZip} from './importer.js';
onmessage=async event=>{try{const result=await readZip(event.data);postMessage(result,result.files.map(([,b])=>b.buffer));}catch(error){postMessage({error:error.message});}};
