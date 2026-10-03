const NS = {
  para: ["p"],
  run: ["run"],
  text: ["t"],
  table: ["tbl"],
  row: ["tr"],
  cell: ["tc"]
};

function localName(node){return node?.localName || node?.nodeName?.split(":").pop() || "";}
function descendants(root, names){return [...root.getElementsByTagName("*")].filter(n=>names.includes(localName(n)));}
function childDesc(root, names){return descendants(root,names);}
function directTextNodes(container){
  return childDesc(container, NS.text).filter(t=>{
    let p=t.parentElement;
    while(p && p!==container){
      if(localName(p)==="p" || localName(p)==="tc") return false;
      p=p.parentElement;
    }
    return true;
  });
}
function textOf(container){return directTextNodes(container).map(n=>n.textContent || "").join("");}
function isInside(node, ancestorName){
  let p=node.parentElement;
  while(p){if(localName(p)===ancestorName)return true;p=p.parentElement;}
  return false;
}
function setTextPreservingNodes(container, value){
  const nodes=directTextNodes(container);
  if(nodes.length){
    nodes[0].textContent=value;
    for(let i=1;i<nodes.length;i++) nodes[i].textContent="";
    return;
  }
  const run = childDesc(container, NS.run)[0] || container;
  const t = container.ownerDocument.createElementNS(container.namespaceURI || run.namespaceURI, "hp:t");
  t.textContent=value;
  run.appendChild(t);
}
function parserError(doc){return doc.getElementsByTagName("parsererror")[0];}

export async function loadHwpx(file){
  if(!window.JSZip) throw new Error("JSZip을 불러오지 못했습니다.");
  const zip = await JSZip.loadAsync(file);
  const sectionPaths = Object.keys(zip.files)
    .filter(p=>/^Contents\/section\d+\.xml$/i.test(p))
    .sort((a,b)=>{
      const na=Number(a.match(/section(\d+)/i)?.[1]||0);
      const nb=Number(b.match(/section(\d+)/i)?.[1]||0);
      return na-nb;
    });
  if(!sectionPaths.length) throw new Error("유효한 HWPX section XML을 찾지 못했습니다.");

  const parser=new DOMParser();
  const sections=[];
  for(const path of sectionPaths){
    const xml=await zip.file(path).async("text");
    const doc=parser.parseFromString(xml,"application/xml");
    if(parserError(doc)) throw new Error(path+" XML 파싱에 실패했습니다.");
    sections.push({path,doc,originalXml:xml});
  }
  return {zip,sections,name:file.name};
}

export function buildEditableModel(hwpx){
  const blocks=[];
  hwpx.sections.forEach((section,sectionIndex)=>{
    const all=[...section.doc.getElementsByTagName("*")];
    for(const node of all){
      const ln=localName(node);
      if(ln==="tbl"){
        if(isInside(node,"tc")) continue;
        const rows=childDesc(node,NS.row).filter(r=>{
          let p=r.parentElement; while(p&&p!==node){ if(localName(p)==="tbl") return false; p=p.parentElement; } return true;
        });
        const table={type:"table",sectionIndex,node,rows:[]};
        rows.forEach(row=>{
          const cells=childDesc(row,NS.cell).filter(c=>{
            let p=c.parentElement; while(p&&p!==row){ if(localName(p)==="tr") return false; p=p.parentElement; } return true;
          });
          table.rows.push(cells.map(cell=>({node:cell,text:descendants(cell,NS.text).map(t=>t.textContent||"").join("")})));
        });
        blocks.push(table);
      } else if(ln==="p" && !isInside(node,"tbl")){
        blocks.push({type:"paragraph",sectionIndex,node,text:textOf(node)});
      }
    }
  });
  return blocks;
}

export function applyParagraphText(block,text){setTextPreservingNodes(block.node,text);}
export function applyCellText(cell,text){
  const textNodes=descendants(cell.node,NS.text);
  if(textNodes.length){textNodes[0].textContent=text;for(let i=1;i<textNodes.length;i++)textNodes[i].textContent="";return;}
  const paras=descendants(cell.node,NS.para);
  const target=paras[0]||cell.node;
  setTextPreservingNodes(target,text);
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
  a.href=url;a.download=fileName || "edited.hwpx";document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}