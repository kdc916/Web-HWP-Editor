import {
  loadHwpx,
  disposeHwpx,
  buildEditableModel,
  applyRunText,
  applyCellText,
  saveHwpx
} from "./hwpx.js";

const $=s=>document.querySelector(s);
const state={hwpx:null,blocks:[],zoom:1,dirty:false,history:[],historyIndex:-1,restoring:false};

const els={
  fileInput:$("#fileInput"),openButton:$("#openButton"),emptyOpenButton:$("#emptyOpenButton"),
  saveButton:$("#saveButton"),printButton:$("#printButton"),dropZone:$("#dropZone"),emptyState:$("#emptyState"),
  editorViewport:$("#editorViewport"),paper:$("#paper"),documentName:$("#documentName"),
  documentMeta:$("#documentMeta"),statusText:$("#statusText"),toast:$("#toast"),
  zoomLabel:$("#zoomLabel"),editStatus:$("#editStatus"),undoButton:$("#undoButton"),
  redoButton:$("#redoButton"),zoomInButton:$("#zoomInButton"),zoomOutButton:$("#zoomOutButton"),
  formatInfo:$("#formatInfo")
};

function toast(message){
  els.toast.textContent=message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>els.toast.classList.remove("show"),1900);
}

function setStatus(message){els.statusText.textContent=message;}
function chooseFile(){els.fileInput.click();}

function snapshot(){
  return state.blocks.map(block=>{
    if(block.type==="paragraph") return {type:"p",runs:block.runs.map(r=>r.text)};
    return {type:"t",rows:block.rows.map(row=>row.map(cell=>cell.text))};
  });
}

function snapshotEquals(a,b){
  return JSON.stringify(a)===JSON.stringify(b);
}

function pushHistory(){
  if(state.restoring) return;
  const snap=snapshot();
  if(state.historyIndex>=0 && snapshotEquals(state.history[state.historyIndex],snap)) return;
  state.history=state.history.slice(0,state.historyIndex+1);
  state.history.push(snap);
  if(state.history.length>60) state.history.shift();
  state.historyIndex=state.history.length-1;
  updateHistoryButtons();
}

function updateHistoryButtons(){
  els.undoButton.disabled=state.historyIndex<=0;
  els.redoButton.disabled=state.historyIndex<0 || state.historyIndex>=state.history.length-1;
}

function restoreSnapshot(snap){
  if(!snap) return;
  state.restoring=true;
  state.blocks.forEach((block,i)=>{
    const s=snap[i];
    if(!s) return;
    if(block.type==="paragraph"){
      block.runs.forEach((run,ri)=>applyRunText(run,s.runs?.[ri] ?? ""));
      block.text=block.runs.map(r=>r.text).join("");
    }else{
      block.rows.forEach((row,ri)=>row.forEach((cell,ci)=>applyCellText(cell,s.rows?.[ri]?.[ci] ?? "")));
    }
  });
  renderDocument(false);
  state.restoring=false;
  state.dirty=true;
  els.editStatus.textContent="수정됨";
}

function undo(){
  if(state.historyIndex<=0) return;
  state.historyIndex--;
  restoreSnapshot(state.history[state.historyIndex]);
  updateHistoryButtons();
}

function redo(){
  if(state.historyIndex>=state.history.length-1) return;
  state.historyIndex++;
  restoreSnapshot(state.history[state.historyIndex]);
  updateHistoryButtons();
}

function applyCharStyle(el,style={}){
  if(style.fontSizePx) el.style.fontSize=`${style.fontSizePx}px`;
  if(style.color) el.style.color=style.color;
  if(style.backgroundColor) el.style.backgroundColor=style.backgroundColor;
  if(style.fontFamily) el.style.fontFamily=`"${style.fontFamily}", "Noto Sans KR", sans-serif`;
  if(style.bold) el.style.fontWeight="700";
  if(style.italic) el.style.fontStyle="italic";
  if(style.letterSpacingEm) el.style.letterSpacing=`${style.letterSpacingEm}em`;
  const decorations=[];
  if(style.underline) decorations.push("underline");
  if(style.strike) decorations.push("line-through");
  if(decorations.length) el.style.textDecorationLine=decorations.join(" ");
  if(style.decorationColor) el.style.textDecorationColor=style.decorationColor;
  if(style.scaleX && Math.abs(style.scaleX-1)>.01){
    el.style.display="inline-block";
    el.style.transform=`scaleX(${style.scaleX})`;
    el.style.transformOrigin="left center";
  }
}

function applyParaStyle(el,style={}){
  if(style.textAlign) el.style.textAlign=style.textAlign;
  if(style.lineHeight) el.style.lineHeight=String(style.lineHeight);
  if(style.lineHeightPx) el.style.lineHeight=`${style.lineHeightPx}px`;
  if(style.marginLeftPx) el.style.marginLeft=`${style.marginLeftPx}px`;
  if(style.marginRightPx) el.style.marginRight=`${style.marginRightPx}px`;
  if(style.marginTopPx) el.style.marginTop=`${style.marginTopPx}px`;
  if(style.marginBottomPx) el.style.marginBottom=`${style.marginBottomPx}px`;
  if(style.textIndentPx) el.style.textIndent=`${style.textIndentPx}px`;
}

function plainEditableText(el){
  return el.innerText.replace(/\n$/,"").replace(/\u200b/g,"");
}

function bindEditableSpan(span,run){
  span.contentEditable="true";
  span.spellcheck=false;
  span.setAttribute("role","textbox");
  span.addEventListener("input",()=>{
    const value=plainEditableText(span);
    applyRunText(run,value);
    markDirty();
  });
  span.addEventListener("blur",pushHistory);
  span.addEventListener("paste",e=>{
    e.preventDefault();
    const text=e.clipboardData?.getData("text/plain") || "";
    document.execCommand("insertText",false,text);
  });
  span.addEventListener("keydown",e=>{
    if(e.key==="Enter"){
      e.preventDefault();
      document.execCommand("insertText",false," ");
      toast("v0.2에서는 Enter로 새 문단 추가는 아직 지원하지 않습니다.");
    }
  });
}

function appendRunContent(container,run){
  if(run.text || !run.images.length){
    const span=document.createElement("span");
    span.className="hwpx-run";
    span.textContent=run.text || "\u200b";
    applyCharStyle(span,run.style);
    bindEditableSpan(span,run);
    container.appendChild(span);
  }

  for(const image of run.images){
    if(image.asset?.url){
      const img=document.createElement("img");
      img.className="hwpx-image";
      img.src=image.asset.url;
      img.alt="HWPX 문서 이미지";
      img.contentEditable="false";
      if(image.widthPx) img.style.width=`${image.widthPx}px`;
      if(image.heightPx) img.style.height=`${image.heightPx}px`;
      container.appendChild(img);
    }else{
      const missing=document.createElement("span");
      missing.className="hwpx-image-missing";
      missing.textContent=`이미지(${image.ref})`;
      container.appendChild(missing);
    }
  }
}

function createEditableParagraph(block){
  const p=document.createElement("p");
  p.className="hwpx-paragraph";
  applyParaStyle(p,block.style);
  if(block.pageBreak) p.classList.add("page-break-marker");
  if(!block.runs.length){
    const blank=document.createElement("span");
    blank.className="hwpx-run";
    blank.textContent="\u200b";
    p.appendChild(blank);
  }else{
    block.runs.forEach(run=>appendRunContent(p,run));
  }
  return p;
}

function firstCellStyle(cell){
  const p=cell.paras?.[0];
  return {para:p?.style || {},char:p?.runs?.[0]?.style || {}};
}

function createEditableTable(block){
  const table=document.createElement("table");
  table.className="hwpx-table";
  if(block.widthPx) table.style.width=`${block.widthPx}px`;
  const tbody=document.createElement("tbody");
  block.rows.forEach(row=>{
    const tr=document.createElement("tr");
    row.forEach(cell=>{
      const td=document.createElement("td");
      td.contentEditable="true";
      td.spellcheck=false;
      td.textContent=cell.text;
      if(cell.colSpan>1) td.colSpan=cell.colSpan;
      if(cell.rowSpan>1) td.rowSpan=cell.rowSpan;
      if(cell.widthPx) td.style.width=`${cell.widthPx}px`;
      if(cell.heightPx) td.style.minHeight=`${cell.heightPx}px`;
      td.style.verticalAlign=cell.vertAlign==="center"?"middle":cell.vertAlign;
      const styles=firstCellStyle(cell);
      applyParaStyle(td,styles.para);
      applyCharStyle(td,styles.char);
      td.addEventListener("input",()=>{
        applyCellText(cell,plainEditableText(td));
        markDirty();
      });
      td.addEventListener("blur",pushHistory);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function applyPageSettings(){
  const page=state.hwpx?.page;
  if(!page) return;
  els.paper.style.width=`${page.widthPx}px`;
  els.paper.style.minHeight=`${page.heightPx}px`;
  els.paper.style.padding=`${page.margin.topPx}px ${page.margin.rightPx}px ${page.margin.bottomPx}px ${page.margin.leftPx}px`;
  els.paper.dataset.pageWidth=String(page.widthPx);
  els.paper.dataset.pageHeight=String(page.heightPx);
}

function renderDocument(resetHistory=true){
  els.paper.innerHTML="";
  applyPageSettings();
  if(!state.blocks.length){
    const p=document.createElement("div");
    p.className="hwpx-placeholder";
    p.textContent="표시 가능한 일반 문단을 찾지 못했습니다.";
    els.paper.appendChild(p);
  }
  for(const block of state.blocks){
    els.paper.appendChild(block.type==="paragraph"?createEditableParagraph(block):createEditableTable(block));
  }
  if(resetHistory){
    state.history=[];
    state.historyIndex=-1;
    pushHistory();
  }
  setZoom(state.zoom);
}

function markDirty(){
  state.dirty=true;
  els.editStatus.textContent="수정 중";
  els.saveButton.disabled=false;
}

async function openFile(file){
  if(!file) return;
  if(!/\.hwpx$/i.test(file.name)){
    toast("현재 v0.2는 HWPX 파일을 우선 지원합니다.");
    return;
  }
  try{
    setStatus("HWPX 구조와 서식 분석 중…");
    const hwpx=await loadHwpx(file);
    const blocks=buildEditableModel(hwpx);
    disposeHwpx(state.hwpx);
    state.hwpx=hwpx;
    state.blocks=blocks;
    state.dirty=false;
    state.zoom=1;
    els.documentName.textContent=file.name;
    const paraCount=blocks.filter(b=>b.type==="paragraph").length;
    const tableCount=blocks.filter(b=>b.type==="table").length;
    els.documentMeta.textContent=`${hwpx.sections.length}개 섹션 · 문단 ${paraCount} · 표 ${tableCount} · 이미지 ${Object.keys(hwpx.images).length}`;
    els.formatInfo.textContent=`서식 ${Object.keys(hwpx.styles.charPr).length}/${Object.keys(hwpx.styles.paraPr).length}`;
    els.emptyState.hidden=true;
    els.editorViewport.hidden=false;
    els.saveButton.disabled=false;
    els.printButton.disabled=false;
    els.editStatus.textContent="원본 서식 렌더링";
    renderDocument(true);
    setStatus("문서를 열었습니다.");
    toast("HWPX 서식과 이미지를 로컬에서 불러왔습니다.");
  }catch(e){
    console.error(e);
    setStatus("열기 실패");
    toast(e.message || "문서를 열 수 없습니다.");
  }
}

async function save(){
  if(!state.hwpx) return;
  try{
    setStatus("HWPX 저장 중…");
    const name=state.hwpx.name.replace(/\.hwpx$/i,"")+"_edited.hwpx";
    await saveHwpx(state.hwpx,name);
    state.dirty=false;
    els.editStatus.textContent="저장됨";
    setStatus("저장 완료");
    toast("수정한 HWPX를 저장했습니다.");
  }catch(e){
    console.error(e);
    setStatus("저장 실패");
    toast("저장에 실패했습니다.");
  }
}

function printDocument(){
  if(!state.hwpx) return;
  window.print();
}

function setZoom(v){
  state.zoom=Math.min(1.6,Math.max(.5,v));
  els.paper.style.transform=`scale(${state.zoom})`;
  const baseHeight=Number(els.paper.dataset.pageHeight || 1123);
  els.paper.style.marginBottom=`${Math.max(32,(baseHeight*(state.zoom-1))+32)}px`;
  els.zoomLabel.textContent=Math.round(state.zoom*100)+"%";
}

els.openButton.addEventListener("click",chooseFile);
els.emptyOpenButton.addEventListener("click",chooseFile);
els.fileInput.addEventListener("change",e=>openFile(e.target.files?.[0]));
els.saveButton.addEventListener("click",save);
els.printButton.addEventListener("click",printDocument);
els.undoButton.addEventListener("click",undo);
els.redoButton.addEventListener("click",redo);
els.zoomInButton.addEventListener("click",()=>setZoom(state.zoom+.1));
els.zoomOutButton.addEventListener("click",()=>setZoom(state.zoom-.1));

["dragenter","dragover"].forEach(type=>els.dropZone.addEventListener(type,e=>{
  e.preventDefault();
  els.dropZone.classList.add("dragover");
}));
["dragleave","drop"].forEach(type=>els.dropZone.addEventListener(type,e=>{
  e.preventDefault();
  els.dropZone.classList.remove("dragover");
}));
els.dropZone.addEventListener("drop",e=>openFile(e.dataTransfer.files?.[0]));

window.addEventListener("keydown",e=>{
  const mod=e.metaKey || e.ctrlKey;
  if(mod && e.key.toLowerCase()==="s"){
    e.preventDefault();
    save();
  }
  if(mod && !e.shiftKey && e.key.toLowerCase()==="z"){
    e.preventDefault();
    undo();
  }
  if(mod && e.shiftKey && e.key.toLowerCase()==="z"){
    e.preventDefault();
    redo();
  }
});

window.addEventListener("beforeunload",e=>{
  if(state.dirty){
    e.preventDefault();
    e.returnValue="";
  }
});
