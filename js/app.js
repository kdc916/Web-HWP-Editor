import { createEditor } from "@rhwp/editor";

const $ = (selector) => document.querySelector(selector);

const state = {
  editor: null,
  currentFile: null,
  currentFormat: null,
  pageCount: 0,
  loading: false,
};

const els = {
  fileInput: $("#fileInput"),
  openButton: $("#openButton"),
  emptyOpenButton: $("#emptyOpenButton"),
  saveButton: $("#saveButton"),
  printButton: $("#printButton"),
  dropZone: $("#dropZone"),
  emptyState: $("#emptyState"),
  editorViewport: $("#editorViewport"),
  studioLoading: $("#studioLoading"),
  studioHost: $("#studioHost"),
  documentName: $("#documentName"),
  documentMeta: $("#documentMeta"),
  formatInfo: $("#formatInfo"),
  statusText: $("#statusText"),
  toast: $("#toast"),
};

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function chooseFile() {
  if (!state.loading) els.fileInput.click();
}

function getFormat(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".hwpx")) return "hwpx";
  if (lower.endsWith(".hwp")) return "hwp";
  return null;
}

function getStudioUrl() {
  return new URL(`${import.meta.env.BASE_URL}studio/`, window.location.origin).href;
}

async function ensureEditor() {
  if (state.editor) return state.editor;

  els.emptyState.hidden = true;
  els.emptyState.style.display = "none";
  els.editorViewport.hidden = false;
  els.editorViewport.style.display = "block";
  els.studioLoading.hidden = false;
  els.studioHost.hidden = true;
  setStatus("직접 편집 엔진 초기화 중…");

  const editor = await createEditor(els.studioHost, {
    studioUrl: getStudioUrl(),
    width: "100%",
    height: "100%",
    renderer: "canvas2d",
    handshakeTimeoutMs: 5000,
    requestTimeoutMs: 60000,
  });

  state.editor = editor;
  els.studioLoading.hidden = true;
  els.studioHost.hidden = false;
  setStatus("직접 편집 준비 완료");
  return editor;
}

function downloadBytes(bytes, fileName, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function openFile(file) {
  if (!file || state.loading) return;

  const format = getFormat(file.name);
  if (!format) {
    toast("HWP 또는 HWPX 파일을 선택해주세요.");
    return;
  }

  state.loading = true;
  els.openButton.disabled = true;
  els.emptyOpenButton.disabled = true;
  els.saveButton.disabled = true;
  els.printButton.disabled = true;
  els.documentName.textContent = file.name;
  els.documentMeta.textContent = "편집기에서 문서를 여는 중…";
  els.formatInfo.textContent = `${format.toUpperCase()} · Direct Edit`;

  try {
    const editor = await ensureEditor();
    setStatus(`${format.toUpperCase()} 문서 분석 중…`);
    const buffer = await file.arrayBuffer();
    const result = await editor.loadFile(buffer, file.name, {
      skipUnsavedGuard: false,
      suppressDialogs: true,
    });

    state.currentFile = file;
    state.currentFormat = format;
    state.pageCount = Number(result?.pageCount || 0);

    // v0.4.1: 문서 로드 완료 후 초기 안내 레이어가 편집기를 가리지 않도록 재확정한다.
    els.emptyState.hidden = true;
    els.emptyState.style.display = "none";
    els.editorViewport.hidden = false;
    els.editorViewport.style.display = "block";
    els.studioLoading.hidden = true;
    els.studioHost.hidden = false;

    els.documentMeta.textContent =
      `${state.pageCount || "?"}페이지 · 문서 위에서 바로 클릭해 편집 · 서식/표 도구 사용 가능`;
    els.saveButton.disabled = false;
    els.printButton.disabled = false;
    els.saveButton.textContent = format === "hwpx" ? "HWPX 저장" : "HWP 저장";
    setStatus("직접 편집 중");
    toast("이제 문서의 글자나 표 셀을 클릭해서 바로 수정할 수 있습니다.");
  } catch (error) {
    console.error(error);
    els.documentMeta.textContent = "문서를 열지 못했습니다.";
    setStatus("열기 실패");
    toast(error?.message || "문서를 열 수 없습니다.");
    if (!state.editor) {
      els.emptyState.hidden = false;
      els.emptyState.style.display = "flex";
      els.editorViewport.hidden = true;
      els.editorViewport.style.display = "none";
    }
  } finally {
    state.loading = false;
    els.openButton.disabled = false;
    els.emptyOpenButton.disabled = false;
    els.fileInput.value = "";
  }
}

async function saveDocument() {
  if (!state.editor || !state.currentFile || !state.currentFormat) return;

  try {
    els.saveButton.disabled = true;
    setStatus("문서 저장 중…");

    const base = state.currentFile.name.replace(/\.(hwp|hwpx)$/i, "");
    const outName = `${base}_edited.${state.currentFormat}`;

    if (state.currentFormat === "hwpx") {
      const bytes = await state.editor.exportHwpx();
      downloadBytes(bytes, outName, "application/vnd.hancom.hwpx");
    } else {
      const bytes = await state.editor.exportHwp();
      downloadBytes(bytes, outName, "application/x-hwp");
    }

    try {
      await state.editor.notifySaved(outName);
    } catch {
      // 구형 Studio와의 호환 경로: 다운로드 자체는 이미 완료됨.
    }

    setStatus("저장 완료");
    toast(`${outName} 저장을 시작했습니다.`);
  } catch (error) {
    console.error(error);
    setStatus("저장 실패");
    toast(error?.message || "저장에 실패했습니다.");
  } finally {
    els.saveButton.disabled = false;
  }
}

function printDocument() {
  if (!state.editor?.element?.contentWindow) return;
  try {
    state.editor.element.contentWindow.focus();
    state.editor.element.contentWindow.print();
  } catch (error) {
    console.error(error);
    toast("편집기 메뉴의 파일 → 인쇄 기능을 사용해주세요.");
  }
}

els.openButton.addEventListener("click", chooseFile);
els.emptyOpenButton.addEventListener("click", chooseFile);
els.fileInput.addEventListener("change", (event) => openFile(event.target.files?.[0]));
els.saveButton.addEventListener("click", saveDocument);
els.printButton.addEventListener("click", printDocument);

["dragenter", "dragover"].forEach((type) => {
  els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((type) => {
  els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragover");
  });
});

els.dropZone.addEventListener("drop", (event) => openFile(event.dataTransfer.files?.[0]));

window.addEventListener("keydown", (event) => {
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key.toLowerCase() === "s" && state.currentFile) {
    event.preventDefault();
    saveDocument();
  }
});

setStatus("HWP/HWPX 직접 편집기 준비");
