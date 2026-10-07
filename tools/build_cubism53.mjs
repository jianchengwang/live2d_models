// Rebuild vendor modules from an official Framework 5-r.5 checkout; no Core download.
// node tools/build_cubism53.mjs /path/CubismWebFramework /path/esbuild/lib/main.js
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [checkoutArg,esbuildArg]=process.argv.slice(2);
if(!checkoutArg||!esbuildArg)throw new Error('Provide official Framework checkout and installed esbuild module paths');
const checkout=path.resolve(checkoutArg),commit=execFileSync('git',['-C',checkout,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(commit!=='198a3769c26ca3d7b600e932590433badd392edd')throw new Error('Expected official CubismWebFramework 5-r.5 commit');
const {build}=await import(pathToFileURL(path.resolve(esbuildArg)).href);
await build({stdin:{contents:"export {CubismFramework} from './src/live2dcubismframework';\nexport {CubismUserModel} from './src/model/cubismusermodel';\nexport {CubismMatrix44} from './src/math/cubismmatrix44';\nexport {CubismShaderManager_WebGL} from './src/rendering/cubismshader_webgl';",resolveDir:checkout,loader:'ts'},bundle:true,format:'esm',target:'es2020',supported:{'template-literal':false},minify:true,legalComments:'inline',outfile:path.join(root,'v2/cubism53-framework.js')});
const shaderDir=path.join(checkout,'Shaders/WebGL'),shaders={};
for(const name of (await fs.readdir(shaderDir)).sort())shaders[name]=await fs.readFile(path.join(shaderDir,name),'utf8');
await fs.writeFile(path.join(root,'v2/cubism53-shaders.js'),'// Official Live2D Cubism Web Framework 5-r.5 shaders; Live2D Open Software License.\nexport const shaderSources = Object.freeze('+JSON.stringify(shaders)+');\n');
