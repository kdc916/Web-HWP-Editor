import {
  loadHwpx,
  disposeHwpx,
  buildEditableModel,
  applyRunText,
  applyCellText,
  saveHwpx
} from "./hwpx.js";

import {
  initHwpEngine,
  loadHwp,
  disposeHwp,
  renderHwpPage,
  hitTestHwp,
  readHwpTarget,
  replaceHwpTarget,
  saveHwp
} from "./hwp.js";

const $=s=>document.querySelector(s);
const state={
  mode:null,
  hwpx:null,
  hwp:null,
  blocks:[],
  zoom:1,
  dirty:false,
  history:[],
  historyIndex:-1,
  restoring:false,
  hwpPage:0,
  hwpEditTarget:null
};

const els={
  fileInput:$("#fileInput"),openButton:$("#openButton"),emptyOpenButton:$("#emptyOpenButton"),
  saveButton:$("#saveButton"),printButton:$("#printButton"),dropZone:$("#dropZone"),emptyState:$("#emptyState"),
  editorViewport:$("#editorViewport"),paper:$("#paper"),documentName:$("#documentName"),
  documentMeta:$("#documentMeta"),statusText:$("#statusText"),toast:$("#toast"),
  zoomLabel:$("#zoomLabel"),editStatus:$("#editStatus"),undoButton:$("#undoButton"),
  redoButton:$("#redoButton"),zoomInButton:$("#zoomInButton"),zoomOutButton:$("#zoomOutButton"),
  formatInfo:$("#formatInfo"),pageNav:$("#pageNav"),prevPageButton:$("#prevPageButton"),
  nextPageButton:$("#nextPageButton"),pageLabel:$("#pageLabel"),
  hwpEditDialog:$("#hwpEditDialog"),hwpEditTarget:$("#hwpEditTarget"),
  hwpEditTextarea:$("#hwpEditTextarea"),hwpEditClose:$("#hwpEditClose"),
  hwpEditCancel:$("#hwpEditCancel"),hwpEditApply:$("#hwpEditApply")
};

function toast(message){
  els.toast.textContent=message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>els.toast.classList.remove("show"),2200);
}

function setStatus(message){els.statusText.textContent=message;}
function chooseFile(){els.fileInput.click();}

function cleanupCurrentDocument(){
  disposeHwpx(state.hwpx);
  disposeHwp(state.hwp);
  state.hwpx=null;
  state.hwp=null;
  state.blocks=[];
  state.mode=null;
  state.history=[];
  state.historyIndex=-1;
  state.dirty=false;
  state.hwpPage=0;
  state.hwpEditTarget=null;
  els.paper.innerHTML="";
  els.paper.className="paper";
}

function snapshot(){
  return state.blocks.map(block=>{
    if(block.type==="paragraph") return {type:"p",runs:block.runs.map(r=>r.text)};
    return {type:"t",rows:block.rows.map(row=>row.map(cell=>cell.text))};
  });
}

function snapshotEquals(a,b){return JSON.stringify(a)===JSON.stringify(b);}

function pushHistory(){
  if(state.mode!=="hwpx" || state.restoring) return;
  const snap=snapshot();
  if(state.historyIndex>=0 && snapshotEquals(state.history[state.historyIndex],snap)) return;
  state.history=state.history.slice(0,state.historyIndex+1);
  state.history.push(snap);
  if(state.history.length>60) state.history.shift();
  state.historyIndex=state.history.length-1;
  updateHistoryButtons();
}

function updateHistoryButtons(){
  if(state.mode!=="hwpx"){
    els.undoButton.disabled=true;
    els.redoButton.disabled=true;
    return;
  }
  els.undoButton.disabled=state.historyIndex<=0;
  els.redoButton.disabled=state.historyIndex<0 || state.historyIndex>=state.history.length-1;
}

function restoreSnapshot(snap){
  if(state.mode!=="hwpx" || !snap) return;
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
  renderHwpxDocument(false);
  state.restoring=false;
  state.dirty=true;
  els.editStatus.textContent="수정됨";
}

function undo(){
  if(state.mode!=="hwpx" || state.historyIndex<=0) return;
  state.historyIndex--;
  restoreSnapshot(state.history[state.historyIndex]);
  updateHistoryButtons();
}

function redo(){
  if(state.mode!=="hwpx" || state.historyIndex>=state.history.length-1) return;
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
    applyRunText(run,plainEditableText(span));
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
      toast("HWPX 새 문단 삽입은 다음 패치에서 지원합니다.");
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

function applyHwpxPageSettings(){
  const page=state.hwpx?.page;
  if(!page) return;
  els.paper.style.width=`${page.widthPx}px`;
  els.paper.style.minHeight=`${page.heightPx}px`;
  els.paper.style.padding=`${page.margin.topPx}px ${page.margin.rightPx}px ${page.margin.bottomPx}px ${page.margin.leftPx}px`;
  els.paper.dataset.pageWidth=String(page.widthPx);
  els.paper.dataset.pageHeight=String(page.heightPx);
}

function renderHwpxDocument(resetHistory=true){
  els.paper.className="paper";
  els.paper.innerHTML="";
  applyHwpxPageSettings();
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

function sanitizeSvg(svgText){
  const parsed=new DOMParser().parseFromString(svgText,"image/svg+xml");
  const svg=parsed.documentElement;
  if(svg.nodeName.toLowerCase()==="parsererror") throw new Error("HWP SVG 렌더링 결과를 읽지 못했습니다.");
  svg.querySelectorAll("script,iframe,object,embed").forEach(n=>n.remove());
  svg.querySelectorAll("*").forEach(el=>{
    for(const attr of [...el.attributes]){
      const name=attr.name.toLowerCase();
      const value=String(attr.value || "").trim().toLowerCase();
      if(name.startsWith("on")) el.removeAttribute(attr.name);
      if((name==="href" || name==="xlink:href") && value.startsWith("javascript:")) el.removeAttribute(attr.name);
    }
  });
  return document.importNode(svg,true);
}

function hwpEventPoint(event,svg){
  const rect=svg.getBoundingClientRect();
  const vb=svg.viewBox?.baseVal;
  if(!rect.width || !rect.height) return null;
  if(vb && vb.width && vb.height){
    return {
      x:vb.x + ((event.clientX-rect.left)/rect.width)*vb.width,
      y:vb.y + ((event.clientY-rect.top)/rect.height)*vb.height
    };
  }
  const width=Number(svg.getAttribute("width")) || rect.width;
  const height=Number(svg.getAttribute("height")) || rect.height;
  return {
    x:((event.clientX-rect.left)/rect.width)*width,
    y:((event.clientY-rect.top)/rect.height)*height
  };
}

function updatePageNav(){
  if(state.mode!=="hwp" || !state.hwp){
    els.pageNav.hidden=true;
    return;
  }
  els.pageNav.hidden=false;
  const total=Math.max(1,state.hwp.pageCount || 1);
  state.hwpPage=Math.max(0,Math.min(state.hwpPage,total-1));
  els.pageLabel.textContent=`${state.hwpPage+1} / ${total}`;
  els.prevPageButton.disabled=state.hwpPage<=0;
  els.nextPageButton.disabled=state.hwpPage>=total-1;
}

function renderHwpCurrentPage(){
  if(!state.hwp) return;
  updatePageNav();
  els.paper.className="paper hwp-mode";
  els.paper.innerHTML="";
  const svgText=renderHwpPage(state.hwp,state.hwpPage);
  const svg=sanitizeSvg(svgText);
  svg.classList.add("hwp-svg-page");
  svg.setAttribute("aria-label",`HWP ${state.hwpPage+1}페이지`);

  const card=document.createElement("div");
  card.className="hwp-page-card";
  card.appendChild(svg);
  card.title="텍스트를 수정하려면 문단 또는 표 셀을 더블클릭하세요.";
  card.addEventListener("dblclick",async event=>{
    try{
      const point=hwpEventPoint(event,svg);
      if(!point) return;
      const hit=hitTestHwp(state.hwp,state.hwpPage,point.x,point.y);
      const target=readHwpTarget(state.hwp,hit);
      openHwpEditDialog(target);
    }catch(error){
      console.error(error);
      toast(error?.message || "이 위치의 텍스트를 편집할 수 없습니다.");
    }
  });

  els.paper.appendChild(card);
  const rect=svg.viewBox?.baseVal;
  const naturalHeight=rect?.height || Number(svg.getAttribute("height")) || card.scrollHeight || 1123;
  els.paper.dataset.pageHeight=String(naturalHeight);
  setZoom(state.zoom);
}

function openHwpEditDialog(target){
  state.hwpEditTarget=target;
  els.hwpEditTarget.textContent=target.label;
  els.hwpEditTextarea.value=target.text ?? "";
  els.hwpEditDialog.hidden=false;
  requestAnimationFrame(()=>{
    els.hwpEditTextarea.focus();
    els.hwpEditTextarea.setSelectionRange(0,els.hwpEditTextarea.value.length);
  });
}

function closeHwpEditDialog(){
  els.hwpEditDialog.hidden=true;
  state.hwpEditTarget=null;
}

function applyHwpDialogEdit(){
  if(!state.hwp || !state.hwpEditTarget) return;
  try{
    replaceHwpTarget(state.hwp,state.hwpEditTarget,els.hwpEditTextarea.value);
    state.dirty=true;
    els.editStatus.textContent="HWP 수정됨 · 저장 필요";
    els.saveButton.disabled=false;
    closeHwpEditDialog();
    renderHwpCurrentPage();
    updateDocumentMeta();
    toast("HWP 텍스트를 수정했습니다.");
  }catch(error){
    console.error(error);
    toast(error?.message || "HWP 텍스트 수정에 실패했습니다.");
  }
}

function updateDocumentMeta(){
  if(state.mode==="hwp" && state.hwp){
    const format=state.hwp.info?.format || state.hwp.info?.sourceFormat || "HWP 5.0";
    els.documentMeta.textContent=`${format} · ${state.hwp.pageCount}페이지 · WASM 로컬 렌더링`;
  }else if(state.mode==="hwpx" && state.hwpx){
    const paraCount=state.blocks.filter(b=>b.type==="paragraph").length;
    const tableCount=state.blocks.filter(b=>b.type==="table").length;
    els.documentMeta.textContent=`${state.hwpx.sections.length}개 섹션 · 문단 ${paraCount} · 표 ${tableCount} · 이미지 ${Object.keys(state.hwpx.images).length}`;
  }
}

function markDirty(){
  state.dirty=true;
  els.editStatus.textContent="수정 중";
  els.saveButton.disabled=false;
}

async function openHwpxFile(file){
  setStatus("HWPX 구조와 서식 분석 중…");
  const hwpx=await loadHwpx(file);
  const blocks=buildEditableModel(hwpx);
  cleanupCurrentDocument();
  state.mode="hwpx";
  state.hwpx=hwpx;
  state.blocks=blocks;
  state.zoom=1;
  els.documentName.textContent=file.name;
  els.formatInfo.textContent=`HWPX · 서식 ${Object.keys(hwpx.styles.charPr).length}/${Object.keys(hwpx.styles.paraPr).length}`;
  els.emptyState.hidden=true;
  els.editorViewport.hidden=false;
  els.saveButton.disabled=false;
  els.saveButton.textContent="HWPX 저장";
  els.printButton.disabled=false;
  els.pageNav.hidden=true;
  els.editStatus.textContent="HWPX 직접 편집";
  renderHwpxDocument(true);
  updateHistoryButtons();
  updateDocumentMeta();
  setStatus("HWPX 문서를 열었습니다.");
  toast("HWPX를 로컬에서 불러왔습니다.");
}

async function openHwpFile(file){
  setStatus("HWP WASM 엔진으로 문서 분석 중…");
  const hwp=await loadHwp(file);
  cleanupCurrentDocument();
  state.mode="hwp";
  state.hwp=hwp;
  state.zoom=1;
  state.hwpPage=0;
  els.documentName.textContent=file.name;
  els.formatInfo.textContent="HWP 5.0 · WASM";
  els.emptyState.hidden=true;
  els.editorViewport.hidden=false;
  els.saveButton.disabled=false;
  els.saveButton.textContent="HWP 저장";
  els.printButton.disabled=false;
  els.editStatus.textContent="더블클릭하여 텍스트 편집";
  updateHistoryButtons();
  renderHwpCurrentPage();
  updateDocumentMeta();
  setStatus("일반 HWP 문서를 열었습니다.");
  toast("HWP 5.0 문서를 브라우저에서 열었습니다.");
}

async function openFile(file){
  if(!file) return;
  const lower=file.name.toLowerCase();
  try{
    if(lower.endsWith(".hwp")){
      await openHwpFile(file);
    }else if(lower.endsWith(".hwpx")){
      await openHwpxFile(file);
    }else{
      toast("HWP 또는 HWPX 파일을 선택해주세요.");
    }
  }catch(error){
    console.error(error);
    setStatus("열기 실패");
    toast(error?.message || "문서를 열 수 없습니다.");
  }finally{
    els.fileInput.value="";
  }
}

async function save(){
  try{
    if(state.mode==="hwp" && state.hwp){
      setStatus("HWP 저장 중…");
      const name=state.hwp.name.replace(/\.hwp$/i,"")+"_edited.hwp";
      saveHwp(state.hwp,name);
      state.dirty=false;
      els.editStatus.textContent="HWP 저장됨";
      setStatus("HWP 저장 완료");
      toast("수정한 HWP 파일을 저장했습니다.");
      return;
    }
    if(state.mode==="hwpx" && state.hwpx){
      setStatus("HWPX 저장 중…");
      const name=state.hwpx.name.replace(/\.hwpx$/i,"")+"_edited.hwpx";
      await saveHwpx(state.hwpx,name);
      state.dirty=false;
      els.editStatus.textContent="HWPX 저장됨";
      setStatus("HWPX 저장 완료");
      toast("수정한 HWPX 파일을 저장했습니다.");
    }
  }catch(error){
    console.error(error);
    setStatus("저장 실패");
    toast(error?.message || "저장에 실패했습니다.");
  }
}

function printDocument(){
  if(!state.mode) return;
  window.print();
}

function setZoom(v){
  state.zoom=Math.min(1.6,Math.max(.5,v));
  els.paper.style.transform=`scale(${state.zoom})`;
  const baseHeight=Number(els.paper.dataset.pageHeight || 1123);
  els.paper.style.marginBottom=`${Math.max(32,(baseHeight*(state.zoom-1))+32)}px`;
  els.zoomLabel.textContent=Math.round(state.zoom*100)+"%";
}

function moveHwpPage(delta){
  if(state.mode!=="hwp" || !state.hwp) return;
  const next=state.hwpPage+delta;
  if(next<0 || next>=state.hwp.pageCount) return;
  state.hwpPage=next;
  renderHwpCurrentPage();
  els.paper.scrollIntoView({block:"start",behavior:"smooth"});
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
els.prevPageButton.addEventListener("click",()=>moveHwpPage(-1));
els.nextPageButton.addEventListener("click",()=>moveHwpPage(1));

els.hwpEditClose.addEventListener("click",closeHwpEditDialog);
els.hwpEditCancel.addEventListener("click",closeHwpEditDialog);
els.hwpEditApply.addEventListener("click",applyHwpDialogEdit);
els.hwpEditDialog.addEventListener("click",e=>{if(e.target===els.hwpEditDialog) closeHwpEditDialog();});
els.hwpEditTextarea.addEventListener("keydown",e=>{
  if((e.metaKey||e.ctrlKey) && e.key==="Enter"){
    e.preventDefault();
    applyHwpDialogEdit();
  }
});

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
  if(e.key==="Escape" && !els.hwpEditDialog.hidden){
    closeHwpEditDialog();
    return;
  }
  if(mod && e.key.toLowerCase()==="s"){
    e.preventDefault();
    save();
  }
  if(mod && !e.shiftKey && e.key.toLowerCase()==="z"){
    if(state.mode==="hwpx"){
      e.preventDefault();
      undo();
    }
  }
  if(mod && e.shiftKey && e.key.toLowerCase()==="z"){
    if(state.mode==="hwpx"){
      e.preventDefault();
      redo();
    }
  }
  if(state.mode==="hwp" && !mod && els.hwpEditDialog.hidden){
    if(e.key==="PageUp"){e.preventDefault();moveHwpPage(-1);}
    if(e.key==="PageDown"){e.preventDefault();moveHwpPage(1);}
  }
});

window.addEventListener("beforeunload",e=>{
  if(state.dirty){
    e.preventDefault();
    e.returnValue="";
  }
});

initHwpEngine()
  .then(()=>setStatus("HWP/HWPX 편집 준비 완료"))
  .catch(error=>{
    console.error(error);
    setStatus("HWP 엔진 로드 실패 · HWPX는 사용 가능");
  });
