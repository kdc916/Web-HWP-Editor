import JSZip from "jszip";

const NS = {
  para: ["p"],
  run: ["run"],
  text: ["t"],
  table: ["tbl"],
  row: ["tr"],
  cell: ["tc"]
};

const HWPUNIT_TO_PX = 96 / 7200;

function localName(node){
  return node?.localName || node?.nodeName?.split(":").pop() || "";
}

function descendants(root, names){
  if(!root) return [];
  return [...root.getElementsByTagName("*")].filter(n=>names.includes(localName(n)));
}

function firstDesc(root, name){
  return descendants(root, [name])[0] || null;
}

function isInside(node, ancestorName){
  let p=node?.parentElement;
  while(p){
    if(localName(p)===ancestorName) return true;
    p=p.parentElement;
  }
  return false;
}

function parserError(doc){
  return doc?.getElementsByTagName("parsererror")?.[0] || null;
}

function pxFromHwpUnit(value, fallback=0){
  const n=Number(value);
  return Number.isFinite(n) ? n * HWPUNIT_TO_PX : fallback;
}

function normalizeColor(value){
  if(!value || value==="none" || value==="NONE") return null;
  if(/^#[0-9a-f]{6}$/i.test(value)) return value;
  if(/^[0-9a-f]{6}$/i.test(value)) return `#${value}`;
  return value;
}

function directTextNodes(container){
  return descendants(container, NS.text).filter(t=>{
    let p=t.parentElement;
    while(p && p!==container){
      if(localName(p)==="p" || localName(p)==="tc") return false;
      p=p.parentElement;
    }
    return true;
  });
}

function textOf(container){
  return directTextNodes(container).map(n=>n.textContent || "").join("");
}

function setTextPreservingNodes(container, value){
  const nodes=directTextNodes(container);
  if(nodes.length){
    nodes[0].textContent=value;
    for(let i=1;i<nodes.length;i++) nodes[i].textContent="";
    return;
  }
  const run = descendants(container, NS.run)[0] || container;
  const ns = run.namespaceURI || container.namespaceURI || "http://www.hancom.co.kr/hwpml/2011/paragraph";
  const t = container.ownerDocument.createElementNS(ns, "hp:t");
  t.textContent=value;
  run.appendChild(t);
}

async function parseZipXml(zip, path){
  const entry=zip.file(path);
  if(!entry) return null;
  const xml=await entry.async("text");
  const doc=new DOMParser().parseFromString(xml,"application/xml");
  if(parserError(doc)) throw new Error(`${path} XML 파싱에 실패했습니다.`);
  return {path,doc,originalXml:xml};
}

function parseFontFaces(headerDoc){
  const result={};
  if(!headerDoc) return result;
  for(const faceGroup of descendants(headerDoc,["fontface"])){
    const lang=(faceGroup.getAttribute("lang") || "HANGUL").toUpperCase();
    result[lang] ||= {};
    for(const font of descendants(faceGroup,["font"])){
      const id=font.getAttribute("id");
      const face=font.getAttribute("face") || font.getAttribute("name");
      if(id!==null && face) result[lang][String(id)]=face;
    }
  }
  return result;
}

function parseCharStyle(node, fontFaces){
  if(!node) return {};
  const style={};
  const height=Number(node.getAttribute("height"));
  if(Number.isFinite(height) && height>0) style.fontSizePx=pxFromHwpUnit(height);

  const color=normalizeColor(node.getAttribute("textColor"));
  if(color) style.color=color;
  const shade=normalizeColor(node.getAttribute("shadeColor"));
  if(shade && shade.toLowerCase()!=="#ffffff") style.backgroundColor=shade;

  style.bold=descendants(node,["bold"]).length>0;
  style.italic=descendants(node,["italic"]).length>0;

  const underline=firstDesc(node,"underline");
  if(underline && (underline.getAttribute("type") || "").toUpperCase()!=="NONE"){
    style.underline=true;
    style.decorationColor=normalizeColor(underline.getAttribute("color"));
  }
  const strike=firstDesc(node,"strikeout");
  if(strike && (strike.getAttribute("shape") || "").toUpperCase()!=="NONE") style.strike=true;

  const fontRef=firstDesc(node,"fontRef");
  if(fontRef){
    const hangul=fontRef.getAttribute("hangul");
    const latin=fontRef.getAttribute("latin");
    style.fontFamily=(hangul!==null && fontFaces.HANGUL?.[hangul]) || (latin!==null && fontFaces.LATIN?.[latin]) || null;
  }

  const spacing=firstDesc(node,"spacing");
  if(spacing){
    const raw=spacing.getAttribute("hangul") ?? spacing.getAttribute("latin");
    const n=Number(raw);
    if(Number.isFinite(n) && n!==0) style.letterSpacingEm=n/100;
  }

  const ratio=firstDesc(node,"ratio");
  if(ratio){
    const raw=ratio.getAttribute("hangul") ?? ratio.getAttribute("latin");
    const n=Number(raw);
    if(Number.isFinite(n) && n>0 && n!==100) style.scaleX=n/100;
  }
  return style;
}

function getMarginValue(marginNode,name){
  const node=descendants(marginNode,[name])[0];
  return node ? pxFromHwpUnit(node.getAttribute("value")) : 0;
}

function parseParaStyle(node){
  if(!node) return {};
  const style={};
  const align=firstDesc(node,"align")?.getAttribute("horizontal")?.toUpperCase();
  const alignMap={LEFT:"left",RIGHT:"right",CENTER:"center",JUSTIFY:"justify",DISTRIBUTE:"justify",DISTRIBUTE_SPACE:"justify"};
  if(alignMap[align]) style.textAlign=alignMap[align];

  const lineSpacing=firstDesc(node,"lineSpacing");
  if(lineSpacing){
    const type=(lineSpacing.getAttribute("type") || "").toUpperCase();
    const value=Number(lineSpacing.getAttribute("value"));
    if(Number.isFinite(value)){
      if(type==="PERCENT") style.lineHeight=Math.max(.6,value/100);
      else style.lineHeightPx=pxFromHwpUnit(value);
    }
  }

  const margin=firstDesc(node,"margin");
  if(margin){
    style.marginLeftPx=getMarginValue(margin,"left");
    style.marginRightPx=getMarginValue(margin,"right");
    style.marginTopPx=getMarginValue(margin,"prev");
    style.marginBottomPx=getMarginValue(margin,"next");
    style.textIndentPx=getMarginValue(margin,"intent");
  }
  return style;
}

function parseStyles(headerDoc){
  const fontFaces=parseFontFaces(headerDoc);
  const charPr={};
  const paraPr={};
  if(headerDoc){
    for(const node of descendants(headerDoc,["charPr"])){
      const id=node.getAttribute("id");
      if(id!==null) charPr[String(id)]=parseCharStyle(node,fontFaces);
    }
    for(const node of descendants(headerDoc,["paraPr"])){
      const id=node.getAttribute("id");
      if(id!==null) paraPr[String(id)]=parseParaStyle(node);
    }
  }
  return {fontFaces,charPr,paraPr};
}

function parsePage(sectionDoc){
  const pagePr=firstDesc(sectionDoc,"pagePr");
  if(!pagePr) return {widthPx:794,heightPx:1123,margin:{leftPx:72,rightPx:72,topPx:76,bottomPx:76}};
  const margin=firstDesc(pagePr,"margin");
  return {
    widthPx:pxFromHwpUnit(pagePr.getAttribute("width"),794),
    heightPx:pxFromHwpUnit(pagePr.getAttribute("height"),1123),
    landscape:(pagePr.getAttribute("landscape") || "").toUpperCase(),
    margin:{
      leftPx:pxFromHwpUnit(margin?.getAttribute("left"),72),
      rightPx:pxFromHwpUnit(margin?.getAttribute("right"),72),
      topPx:pxFromHwpUnit(margin?.getAttribute("top"),76),
      bottomPx:pxFromHwpUnit(margin?.getAttribute("bottom"),76)
    }
  };
}

function parseManifest(contentDoc){
  const items={};
  if(!contentDoc) return items;
  for(const item of descendants(contentDoc,["item"])){
    const id=item.getAttribute("id");
    let href=item.getAttribute("href");
    if(!id || !href) continue;
    href=href.replace(/^\.\//,"").replace(/^\//,"");
    if(!/^Contents\//i.test(href) && !/^META-INF\//i.test(href)) href=`Contents/${href}`;
    items[id]={href,mediaType:item.getAttribute("media-type") || item.getAttribute("mediaType") || "application/octet-stream"};
  }
  return items;
}

async function loadImageAssets(zip, sectionDocs, manifest){
  const refs=new Set();
  for(const section of sectionDocs){
    for(const node of descendants(section.doc,["pic","img"])){
      const id=node.getAttribute("binaryItemIDRef");
      if(id) refs.add(id);
    }
  }

  const assets={};
  const paths=Object.keys(zip.files);
  for(const id of refs){
    let meta=manifest[id];
    let path=meta?.href;
    if(!path || !zip.file(path)){
      const lower=String(id).toLowerCase();
      path=paths.find(p=>p.toLowerCase().includes("/bindata/") && p.split("/").pop().toLowerCase().startsWith(lower));
      meta={href:path,mediaType:"application/octet-stream"};
    }
    const entry=path ? zip.file(path) : null;
    if(!entry) continue;
    try{
      const bytes=await entry.async("arraybuffer");
      const blob=new Blob([bytes],{type:meta.mediaType || "application/octet-stream"});
      assets[id]={id,path,url:URL.createObjectURL(blob),mediaType:meta.mediaType};
    }catch(e){
      console.warn("이미지 로드 실패",id,e);
    }
  }
  return assets;
}

function parseRun(run, hwpx){
  const charPrIDRef=run.getAttribute("charPrIDRef") || "0";
  const textNodes=directTextNodes(run);
  const text=textNodes.map(n=>n.textContent || "").join("");
  const images=[];
  for(const pic of descendants(run,["pic"])){
    const img=firstDesc(pic,"img") || pic;
    const ref=img.getAttribute("binaryItemIDRef") || pic.getAttribute("binaryItemIDRef");
    if(!ref) continue;
    const sz=firstDesc(pic,"sz");
    images.push({
      ref,
      asset:hwpx.images[ref] || null,
      widthPx:pxFromHwpUnit(sz?.getAttribute("width") || pic.getAttribute("width"),0),
      heightPx:pxFromHwpUnit(sz?.getAttribute("height") || pic.getAttribute("height"),0)
    });
  }
  return {node:run,charPrIDRef,text,textNodes,style:hwpx.styles.charPr[charPrIDRef] || {},images};
}

function parseParagraph(node, sectionIndex, hwpx, inTable=false){
  const paraPrIDRef=node.getAttribute("paraPrIDRef") || "0";
  const runs=[];
  for(const run of descendants(node,NS.run)){
    let p=run.parentElement;
    let nested=false;
    while(p && p!==node){
      if(localName(p)==="p"){nested=true;break;}
      p=p.parentElement;
    }
    if(!nested) runs.push(parseRun(run,hwpx));
  }
  return {
    type:"paragraph",
    sectionIndex,
    node,
    paraPrIDRef,
    style:hwpx.styles.paraPr[paraPrIDRef] || {},
    runs,
    text:runs.map(r=>r.text).join(""),
    pageBreak:node.getAttribute("pageBreak")==="1",
    inTable
  };
}

function parseCell(cell, sectionIndex, hwpx){
  const span=firstDesc(cell,"cellSpan");
  const cellSz=firstDesc(cell,"cellSz");
  const subList=firstDesc(cell,"subList");
  const paras=[];
  if(subList){
    for(const p of descendants(subList,["p"])){
      let parent=p.parentElement,nested=false;
      while(parent && parent!==subList){
        if(localName(parent)==="p"){nested=true;break;}
        parent=parent.parentElement;
      }
      if(!nested) paras.push(parseParagraph(p,sectionIndex,hwpx,true));
    }
  }
  const text=paras.map(p=>p.text).join("\n");
  return {
    node:cell,
    paras,
    text,
    colSpan:Number(cell.getAttribute("colSpan") || span?.getAttribute("colSpan") || 1) || 1,
    rowSpan:Number(cell.getAttribute("rowSpan") || span?.getAttribute("rowSpan") || 1) || 1,
    widthPx:pxFromHwpUnit(cellSz?.getAttribute("width"),0),
    heightPx:pxFromHwpUnit(cellSz?.getAttribute("height"),0),
    vertAlign:(subList?.getAttribute("vertAlign") || "TOP").toLowerCase()
  };
}

function parseTable(node, sectionIndex, hwpx){
  const rows=[];
  for(const row of descendants(node,NS.row)){
    let p=row.parentElement,nested=false;
    while(p && p!==node){
      if(localName(p)==="tbl"){nested=true;break;}
      p=p.parentElement;
    }
    if(nested) continue;
    const cells=[];
    for(const cell of descendants(row,NS.cell)){
      let cp=cell.parentElement,cellNested=false;
      while(cp && cp!==row){
        if(localName(cp)==="tc"){cellNested=true;break;}
        cp=cp.parentElement;
      }
      if(!cellNested) cells.push(parseCell(cell,sectionIndex,hwpx));
    }
    rows.push(cells);
  }
  const sz=firstDesc(node,"sz");
  return {type:"table",sectionIndex,node,rows,widthPx:pxFromHwpUnit(sz?.getAttribute("width"),0)};
}

export async function loadHwpx(file){
  const zip=await JSZip.loadAsync(file);
  const sectionPaths=Object.keys(zip.files)
    .filter(p=>/^Contents\/section\d+\.xml$/i.test(p))
    .sort((a,b)=>Number(a.match(/section(\d+)/i)?.[1]||0)-Number(b.match(/section(\d+)/i)?.[1]||0));
  if(!sectionPaths.length) throw new Error("유효한 HWPX section XML을 찾지 못했습니다.");

  const sections=[];
  for(const path of sectionPaths) sections.push(await parseZipXml(zip,path));
  const header=await parseZipXml(zip,"Contents/header.xml");
  const content=await parseZipXml(zip,"Contents/content.hpf");
  const styles=parseStyles(header?.doc);
  const manifest=parseManifest(content?.doc);
  const images=await loadImageAssets(zip,sections,manifest);
  const page=parsePage(sections[0]?.doc);

  const hwpx={zip,sections,header,content,styles,manifest,images,page,name:file.name};
  return hwpx;
}

export function disposeHwpx(hwpx){
  if(!hwpx?.images) return;
  for(const asset of Object.values(hwpx.images)){
    if(asset?.url) URL.revokeObjectURL(asset.url);
  }
}

export function buildEditableModel(hwpx){
  const blocks=[];
  hwpx.sections.forEach((section,sectionIndex)=>{
    const all=[...section.doc.getElementsByTagName("*")];
    for(const node of all){
      const ln=localName(node);
      if(ln==="tbl"){
        if(isInside(node,"tc")) continue;
        blocks.push(parseTable(node,sectionIndex,hwpx));
      }else if(ln==="p" && !isInside(node,"tbl")){
        blocks.push(parseParagraph(node,sectionIndex,hwpx,false));
      }
    }
  });
  return blocks;
}

export function applyParagraphText(block,text){
  setTextPreservingNodes(block.node,text);
  block.text=text;
  if(block.runs?.length){
    block.runs[0].text=text;
    for(let i=1;i<block.runs.length;i++) block.runs[i].text="";
  }
}

export function applyRunText(run,text){
  setTextPreservingNodes(run.node,text);
  run.text=text;
}

export function applyCellText(cell,text){
  const textNodes=descendants(cell.node,NS.text);
  if(textNodes.length){
    textNodes[0].textContent=text;
    for(let i=1;i<textNodes.length;i++) textNodes[i].textContent="";
  }else{
    const paras=descendants(cell.node,NS.para);
    setTextPreservingNodes(paras[0]||cell.node,text);
  }
  cell.text=text;
  if(cell.paras?.[0]){
    cell.paras[0].text=text;
    if(cell.paras[0].runs?.[0]) cell.paras[0].runs[0].text=text;
  }
}

export async function saveHwpx(hwpx,fileName){
  const serializer=new XMLSerializer();
  for(const section of hwpx.sections){
    const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+serializer.serializeToString(section.doc).replace(/^<\?xml[^>]*>\s*/,"");
    hwpx.zip.file(section.path,xml);
  }
  const blob=await hwpx.zip.generateAsync({
    type:"blob",
    mimeType:"application/vnd.hancom.hwpx",
    compression:"DEFLATE",
    compressionOptions:{level:6}
  });
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=fileName || "edited.hwpx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
