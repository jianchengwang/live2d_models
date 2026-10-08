import {generateMoc3} from '../vendor/experimental-moc3/moc3writer.js';
self.onmessage=event=>{try{const binary=generateMoc3(event.data);self.postMessage({binary},[binary]);}catch(error){self.postMessage({error:{name:error.name,message:error.message}});}};
