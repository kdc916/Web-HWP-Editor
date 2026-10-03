import { readFileSync, writeFileSync, cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { APP_VERSION } from '../js/document-utils.js';
const { version } = JSON.parse(readFileSync('package.json','utf8'));
if (version !== APP_VERSION) throw new Error('App/package version mismatch');
const out = process.argv[2] || 'docs';
if (!resolve(out).startsWith(resolve('.') + sep)) throw new Error('Build output must be a child directory of the project');
mkdirSync(out,{recursive:true});
cpSync('public',out,{recursive:true});
cpSync('vendor/studio',join(out,'studio'),{recursive:true});
mkdirSync(join(out,'vendor'),{recursive:true});
cpSync('vendor/editor',join(out,'vendor/editor'),{recursive:true});
mkdirSync(join(out,'js'),{recursive:true});
for(const file of ['app.js','table-geometry.js','document-utils.js']) cpSync(join('js',file),join(out,'js',file));
writeFileSync(join(out,'index.html'),readFileSync('app.html','utf8').replaceAll(/v0\.5\.\d+/g,`v${version}`));
cpSync('styles.css',join(out,'styles.css'));
cpSync('vendor/RHWP_CORE_COMMIT.txt',join(out,'RHWP_CORE_COMMIT.txt'));
writeFileSync(join(out,'.nojekyll'),'');
writeFileSync(join(out,'DEPLOYED_VERSION.txt'),`v${version}\n`);
function replaceOnce(text,old,replacement){
  if(text.split(old).length!==2) throw new Error('Pinned upstream patch mismatch: '+old.slice(0,90));
  return text.replace(old,replacement);
}
const bundlePath=join(out,'studio/assets/index-CgUeJRGy.js');
let bundle=readFileSync(bundlePath,'utf8');
bundle=replaceOnce(bundle,'async ready(){return await $,!0}','async ready(){await $;if(!_A)throw Error(gA||`편집기 초기화 실패`);return !0}');
bundle=replaceOnce(bundle,'vA=await hh(),','vA=await hh(),vA.disableExternalWebFonts=!0,');
bundle=replaceOnce(bundle,'new URL(`/Web-HWP-Editor/studio-v052/assets/rhwp_bg-PUGAA2uC.wasm`,``+import.meta.url)','new URL(`./rhwp_bg-PUGAA2uC.wasm`,import.meta.url)');
bundle=replaceOnce(bundle,'return`/Web-HWP-Editor/studio-v052/`+e','return new URL(`../`+e,import.meta.url).href');
const start=bundle.indexOf('function mE(e,t){'),end=bundle.indexOf('var hE=[',start);
if(start<0||end<0) throw new Error('Equalization function not found');
bundle='import {equalizeSelectedGrid as webHwpEqualize} from "../../js/table-geometry.js";\n'+bundle.slice(0,start)+'function mE(e,t){return webHwpEqualize(e,t)}'+bundle.slice(end);
bundle=replaceOnce(bundle,'var hE=[','var hE=[{id:`table:select-all-cells`,label:`표 전체 선택`,canExecute:e=>e.inTable||e.inCellSelectionMode,execute(e){const i=e.getInputHandler();if(i){i.cursor.enterCellSelectionMode();i.cursor.selectAllCells();i.updateCellSelection();i.textarea?.focus()}}},');
bundle=replaceOnce(bundle,'function $T(e,t){try{e()}catch(e){console.error(`[table] ${t} 실패:`,e)}}','function $T(e,t){try{e()}catch(e){console.error(`[table] ${t} 실패:`,e);document.dispatchEvent(new CustomEvent(`webhwp:table-error`,{detail:t+`: `+(e.message||String(e))}))}}');
bundle=replaceOnce(bundle,'if(nE(t)||(i?.cellPath?.length??0)>1)return;','if(nE(t)||(i?.cellPath?.length??0)>1)throw Error(`연속된 셀을 선택해주세요. 중첩 표의 셀 나누기는 지원하지 않습니다.`);');
bundle=replaceOnce(bundle,'if(!t||nE(t))return;let n=t.getSelectedCellRange(),r=t.getCellTableContext();','if(!t)return;if(nE(t))throw Error(`합칠 셀을 직사각형으로 선택해주세요.`);let n=t.getSelectedCellRange(),r=t.getCellTableContext();if((r?.cellPath?.length??0)>1)throw Error(`중첩 표의 셀 합치기는 지원하지 않습니다.`);');
writeFileSync(bundlePath,bundle);
const canvasPath=join(out,'studio/assets/canvaskit-renderer-BiKYH6aI.js');
writeFileSync(canvasPath,replaceOnce(readFileSync(canvasPath,'utf8'),'p=`/Web-HWP-Editor/studio-v052/assets/canvaskit-SCAxUyCS.wasm`','p=new URL(`./canvaskit-SCAxUyCS.wasm`,import.meta.url).href'));
function relativeAssets(directory){
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    const file=join(directory,entry.name);
    if(entry.isDirectory()) relativeAssets(file);
    else if(/\.(html|css)$/.test(entry.name)){
      const prefix=entry.name.endsWith('.css')?'../':'./';
      writeFileSync(file,readFileSync(file,'utf8').replaceAll('/Web-HWP-Editor/studio-v052/',prefix));
    }
  }
}
relativeAssets(join(out,'studio'));
console.log(`Built v${version} to ${out}`);
