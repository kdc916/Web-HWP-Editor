import {loadHwpx,buildEditableModel,applyParagraphText,applyCellText,saveHwpx} from "./hwpx.js";

const $=s=>document.querySelector(s);
const state={hwpx:null,blocks:[],zoom:1,dirty:false,history:[],historyIndex:-1,restoring:false};

const els={
  fileInput:$("#fileInput"),openButton:$("#openButton"),emptyOpenButton:$("#emptyOpenButton"),
  saveButton:$("#saveButton"),dropZone:$("#dropZone"),emptyState:$("#emptyState"),
  editorViewport:$("#editorViewport"),paper:$("#paper"),documentName:$("#documentName"),
  documentMeta:$("#documentMeta"),statusText:$("#statusText"),toast:$("#toast"),
  zoomLabel:$("#zoomLabel"),editStatus:$("#editStatus"),undoButton:$("#undoButton"),
  redoButton:$("#redoButton"),zoomInButton:$("#zoomInButton"),zoomOutButton:$("#zoomOutButton")
};

function toast(message){els.toast.textContent=message;els.toast.classList.add("show");setTimeout(()=>els.toast.classList.remove("show"),1800);}
function setStatus(message){els.statusText.textContent=message;}
function chooseFile(){els.fileInput.click();}
function snapshot(){return state.blocks.map(b=>b.type==="paragraph"?{type:"p",text:b.text}:{type:"t",rows:b.rows.map(r=>r.map(c=>c.text))});}
function pushHistory(){
  if(state.restoring)return;
  state.history=state.history.slice(0,state.historyIndex+1);
  state.history.push(snapshot());
  if(state.history.length>50)state.history.shift();
  state.historyIndex=state.history.length-1;
  updateHistoryButtons();
}
function updateHistoryButtons(){els.undoButton.disabled=state.historyIndex<=0;els.redoButton.disabled=state.historyIndex<0||state.historyIndex>=state.history.length-1;}
function restoreSnapshot(snap){
  if(!snap)return;
  state.restoring=true;
  state.blocks.forEach((b,i)=>{
    const s=snap[i]; if(!s)return;
    if(b.type==="paragraph"){b.text=s.text;applyParagraphText(b,s.text);}
    else b.rows.forEach((r,ri)=>r.forEach((c,ci)=>{const v=s.rows?.[ri]?.[ci]??"";c.text=v;applyCellText(c,v);}));
  });
  renderDocument(false);
  state.restoring=false;
  state.dirty=true;
  els.editStatus.textContent="수정됨";
}
function undo(){if(state.historyIndex<=0)return;state.historyIndex--;restoreSnapshot(state.history[state.historyIndex]);updateHistoryButtons();}
function redo(){if(state.historyIndex>=state.history.length-1)return;state.historyIndex++;restoreSnapshot(state.history[state.historyIndex]);updateHistoryButtons();}

function createEditableParagraph(block){
  const p=document.createElement("p");p.className="hwpx-paragraph";p.contentEditable="true";p.spellcheck=false;p.textContent=block.text;
  p.addEventListener("input",()=>{block.text=p.innerText.replace(/\n$/,"");applyParagraphText(block,block.text);markDirty();});
  p.addEventListener("blur",()=>pushHistory());
  return p;
}
function createEditableTable(block){
  const table=document.createElement("table");table.className="hwpx-table";const tbody=document.createElement("tbody");
  block.rows.forEach(row=>{const tr=document.createElement("tr");row.forEach(cell=>{const td=document.createElement("td");td.contentEditable="true";td.spellcheck=false;td.textContent=cell.text;
    td.addEventListener("input",()=>{cell.text=td.innerText.replace(/\n$/,"");applyCellText(cell,cell.text);markDirty();});
    td.addEventListener("blur",()=>pushHistory());tr.appendChild(td);});tbody.appendChild(tr);});
  table.appendChild(tbody);return table;
}
function renderDocument(resetHistory=true){
  els.paper.innerHTML="";
  if(!state.blocks.length){const p=document.createElement("div");p.className="hwpx-placeholder";p.textContent="표시 가능한 일반 문단을 찾지 못했습니다.";els.paper.appendChild(p);}
  for(const block of state.blocks)els.paper.appendChild(block.type==="paragraph"?createEditableParagraph(block):createEditableTable(block));
  if(resetHistory){state.history=[];state.historyIndex=-1;pushHistory();}
  setZoom(state.zoom);
}
function markDirty(){state.dirty=true;els.editStatus.textContent="수정 중";els.saveButton.disabled=false;}

async function openFile(file){
  if(!file)return;
  if(!/\.hwpx$/i.test(file.name)){toast("현재 v0.1은 HWPX 파일만 지원합니다.");return;}
  try{
    setStatus("HWPX 분석 중…");
    const hwpx=await loadHwpx(file);const blocks=buildEditableModel(hwpx);
    state.hwpx=hwpx;state.blocks=blocks;state.dirty=false;state.zoom=1;
    els.documentName.textContent=file.name;
    const paraCount=blocks.filter(b=>b.type==="paragraph").length;
    const tableCount=blocks.filter(b=>b.type==="table").length;
    els.documentMeta.textContent=`${hwpx.sections.length}개 섹션 · 문단 ${paraCount} · 표 ${tableCount}`;
    els.emptyState.hidden=true;els.editorViewport.hidden=false;els.saveButton.disabled=false;els.editStatus.textContent="편집 준비";
    renderDocument(true);setStatus("문서를 열었습니다.");toast("HWPX를 로컬에서 열었습니다.");
  }catch(e){console.error(e);setStatus("열기 실패");toast(e.message||"문서를 열 수 없습니다.");}
}
async function save(){
  if(!state.hwpx)return;
  try{setStatus("HWPX 저장 중…");let name=state.hwpx.name.replace(/\.hwpx$/i,"")+"_edited.hwpx";await saveHwpx(state.hwpx,name);state.dirty=false;els.editStatus.textContent="저장됨";setStatus("저장 완료");toast("수정한 HWPX를 저장했습니다.");}
  catch(e){console.error(e);setStatus("저장 실패");toast("저장에 실패했습니다.");}
}
function setZoom(v){state.zoom=Math.min(1.6,Math.max(.55,v));els.paper.style.transform=`scale(${state.zoom})`;els.paper.style.marginBottom=`${(1123*(state.zoom-1))+32}px`;els.zoomLabel.textContent=Math.round(state.zoom*100)+"%";}

els.openButton.addEventListener("click",chooseFile);els.emptyOpenButton.addEventListener("click",chooseFile);
els.fileInput.addEventListener("change",e=>openFile(e.target.files?.[0]));
els.saveButton.addEventListener("click",save);els.undoButton.addEventListener("click",undo);els.redoButton.addEventListener("click",redo);
els.zoomInButton.addEventListener("click",()=>setZoom(state.zoom+.1));els.zoomOutButton.addEventListener("click",()=>setZoom(state.zoom-.1));
["dragenter","dragover"].forEach(type=>els.dropZone.addEventListener(type,e=>{e.preventDefault();els.dropZone.classList.add("dragover");}));
["dragleave","drop"].forEach(type=>els.dropZone.addEventListener(type,e=>{e.preventDefault();els.dropZone.classList.remove("dragover");}));
els.dropZone.addEventListener("drop",e=>openFile(e.dataTransfer.files?.[0]));
window.addEventListener("keydown",e=>{
  const mod=e.metaKey||e.ctrlKey;
  if(mod&&e.key.toLowerCase()==="s"){e.preventDefault();save();}
  if(mod&&!e.shiftKey&&e.key.toLowerCase()==="z"){e.preventDefault();undo();}
  if(mod&&e.shiftKey&&e.key.toLowerCase()==="z"){e.preventDefault();redo();}
});
window.addEventListener("beforeunload",e=>{if(state.dirty){e.preventDefault();e.returnValue="";}});
