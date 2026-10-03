import init, { HwpDocument } from "@rhwp/core";

let enginePromise = null;
let measureCanvas = null;
let measureContext = null;
let lastFont = "";

function ensureMeasureTextBridge(){
  globalThis.measureTextWidth = (font, text) => {
    if(!measureCanvas){
      measureCanvas = document.createElement("canvas");
      measureContext = measureCanvas.getContext("2d");
    }
    if(!measureContext) return String(text ?? "").length * 8;
    if(font !== lastFont){
      measureContext.font = font || '10pt "Noto Sans KR", sans-serif';
      lastFont = font || "";
    }
    return measureContext.measureText(String(text ?? "")).width;
  };
}

export async function initHwpEngine(){
  if(enginePromise) return enginePromise;
  ensureMeasureTextBridge();
  const wasmUrl = `${import.meta.env.BASE_URL}rhwp_bg.wasm`;
  enginePromise = init({ module_or_path: wasmUrl });
  await enginePromise;
  return true;
}

export async function loadHwp(file){
  await initHwpEngine();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = new HwpDocument(bytes);
  const pageCount = Number(doc.pageCount());
  let info = {};
  try { info = JSON.parse(doc.getDocumentInfo?.() || "{}"); } catch {}
  return {
    doc,
    name: file.name,
    sourceBytes: bytes,
    pageCount: Number.isFinite(pageCount) ? pageCount : 0,
    info
  };
}

export function disposeHwp(model){
  try { model?.doc?.free?.(); } catch {}
}

export function renderHwpPage(model, pageIndex){
  if(!model?.doc) throw new Error("HWP 문서가 로드되지 않았습니다.");
  return model.doc.renderPageSvg(pageIndex);
}

function parseJson(value, fallback={}){
  if(value == null) return fallback;
  if(typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function pickNumber(obj, keys, fallback=null){
  for(const key of keys){
    const v=obj?.[key];
    if(v !== undefined && v !== null && v !== ""){
      const n=Number(v);
      if(Number.isFinite(n)) return n;
    }
  }
  return fallback;
}

export function hitTestHwp(model, pageIndex, x, y){
  const raw=model.doc.hitTest(pageIndex, x, y);
  const hit=parseJson(raw,{});
  return {
    raw: hit,
    sectionIndex: pickNumber(hit,["sectionIndex","section_idx","sectionIdx"],0),
    paragraphIndex: pickNumber(hit,["paragraphIndex","paragraph_idx","paraIndex","paraIdx"],0),
    charOffset: pickNumber(hit,["charOffset","char_offset"],0),
    parentParaIndex: pickNumber(hit,["parentParaIndex","parent_para_index","parentParaIdx"],null),
    controlIndex: pickNumber(hit,["controlIndex","control_index","controlIdx"],null),
    cellIndex: pickNumber(hit,["cellIndex","cell_index","cellIdx"],null),
    cellParaIndex: pickNumber(hit,["cellParaIndex","cell_para_index","cellParaIdx","innerPara"],0),
    isTextBox: Boolean(hit.isTextBox ?? hit.is_textbox),
    cellPath: hit.cellPath ?? hit.cell_path ?? null
  };
}

function hasDirectCellContext(hit){
  return Number.isFinite(hit.parentParaIndex)
    && Number.isFinite(hit.controlIndex)
    && Number.isFinite(hit.cellIndex);
}

function normalizeCellPath(path){
  if(!path) return null;
  if(typeof path === "string"){
    try { return JSON.parse(path); } catch { return null; }
  }
  return path;
}

export function readHwpTarget(model, hit){
  const doc=model.doc;
  const sectionIndex=hit.sectionIndex ?? 0;
  const path=normalizeCellPath(hit.cellPath);

  if(path && Number.isFinite(hit.parentParaIndex) && typeof doc.getCellParagraphLengthByPath === "function"){
    const pathJson=JSON.stringify(path);
    const length=Number(doc.getCellParagraphLengthByPath(sectionIndex,hit.parentParaIndex,pathJson)) || 0;
    const text=doc.getTextInCellByPath(sectionIndex,hit.parentParaIndex,pathJson,0,length);
    return {
      kind:"cellPath",
      sectionIndex,
      parentParaIndex:hit.parentParaIndex,
      pathJson,
      length,
      text,
      label:"표 셀 / 중첩 셀"
    };
  }

  if(hasDirectCellContext(hit)){
    const cellParaIndex=hit.cellParaIndex ?? 0;
    const length=Number(doc.getCellParagraphLength(
      sectionIndex,hit.parentParaIndex,hit.controlIndex,hit.cellIndex,cellParaIndex
    )) || 0;
    const text=doc.getTextInCell(
      sectionIndex,hit.parentParaIndex,hit.controlIndex,hit.cellIndex,cellParaIndex,0,length
    );
    return {
      kind:"cell",
      sectionIndex,
      parentParaIndex:hit.parentParaIndex,
      controlIndex:hit.controlIndex,
      cellIndex:hit.cellIndex,
      cellParaIndex,
      length,
      text,
      label:`표 셀 #${hit.cellIndex + 1}`
    };
  }

  const paragraphIndex=hit.paragraphIndex ?? 0;
  const length=Number(doc.getParagraphLength(sectionIndex,paragraphIndex)) || 0;
  const text=doc.getTextRange(sectionIndex,paragraphIndex,0,length);
  return {
    kind:"paragraph",
    sectionIndex,
    paragraphIndex,
    length,
    text,
    label:`본문 문단 #${paragraphIndex + 1}`
  };
}

export function replaceHwpTarget(model,target,newText){
  const doc=model.doc;
  const text=String(newText ?? "");

  if(target.kind==="cellPath"){
    if(target.length>0) doc.deleteTextInCellByPath(
      target.sectionIndex,target.parentParaIndex,target.pathJson,0,target.length
    );
    if(text) doc.insertTextInCellByPath(
      target.sectionIndex,target.parentParaIndex,target.pathJson,0,text
    );
  }else if(target.kind==="cell"){
    if(target.length>0) doc.deleteTextInCell(
      target.sectionIndex,target.parentParaIndex,target.controlIndex,target.cellIndex,target.cellParaIndex,0,target.length
    );
    if(text) doc.insertTextInCell(
      target.sectionIndex,target.parentParaIndex,target.controlIndex,target.cellIndex,target.cellParaIndex,0,text
    );
  }else{
    if(target.length>0) doc.deleteText(target.sectionIndex,target.paragraphIndex,0,target.length);
    if(text) doc.insertText(target.sectionIndex,target.paragraphIndex,0,text);
  }

  model.pageCount=Number(doc.pageCount()) || model.pageCount;
  return true;
}

function downloadBytes(bytes,fileName,mime){
  const blob=new Blob([bytes],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export function saveHwp(model,fileName){
  const bytes=model.doc.exportHwp();
  downloadBytes(bytes,fileName || "edited.hwp","application/x-hwp");
}

export function saveHwpAsHwpx(model,fileName){
  const bytes=model.doc.exportHwpx();
  downloadBytes(bytes,fileName || "converted.hwpx","application/vnd.hancom.hwpx");
}
