import { createEditor } from "@rhwp/editor";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  editor: null,
  currentFile: null,
  currentFormat: null,
  pageCount: 0,
  currentPage: 1,
  loading: false,
  dirty: false,
  monitorTimer: null,
  monitorBusy: false,
  chromeHidden: false,
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
  dirtyBadge: $("#dirtyBadge"),
  quickRibbon: $("#quickRibbon"),
  lineSpacingSelect: $("#lineSpacingSelect"),
  studioChromeButton: $("#studioChromeButton"),
  statusText: $("#statusText"),
  pageStatus: $("#pageStatus"),
  saveStatus: $("#saveStatus"),
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

function setDocumentUiVisible(visible) {
  els.emptyState.hidden = visible;
  els.emptyState.style.display = visible ? "none" : "flex";
  els.editorViewport.hidden = !visible;
  els.editorViewport.style.display = visible ? "block" : "none";
  els.quickRibbon.hidden = !visible;
}

async function ensureEditor() {
  if (state.editor) return state.editor;

  setDocumentUiVisible(true);
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

function updateDirtyUi(dirty) {
  state.dirty = Boolean(dirty);
  els.dirtyBadge.hidden = false;
  els.dirtyBadge.textContent = state.dirty ? "● 저장 안 됨" : "✓ 저장됨";
  els.dirtyBadge.classList.toggle("is-dirty", state.dirty);
  els.saveStatus.hidden = false;
  els.saveStatus.textContent = state.dirty ? "변경사항 있음" : "저장 완료";
  els.saveStatus.classList.toggle("is-dirty", state.dirty);
}

function updatePageUi(page, count) {
  state.currentPage = Number(page || 1);
  state.pageCount = Number(count || state.pageCount || 0);
  els.pageStatus.hidden = false;
  els.pageStatus.textContent = state.pageCount
    ? `${state.currentPage} / ${state.pageCount}쪽`
    : `${state.currentPage}쪽`;
}

function updateTableButtonStates(context = {}) {
  const inTable = Boolean(context.inTable || context.inCellSelectionMode || context.inTableObjectSelection);
  const inCellSelection = Boolean(context.inCellSelectionMode);
  $$(".table-command").forEach((button) => {
    button.disabled = !inTable;
  });
  $$(".merge-command").forEach((button) => {
    button.disabled = !inCellSelection;
  });
}

async function refreshCommandStates() {
  if (!state.editor || !state.currentFile || state.monitorBusy) return;
  state.monitorBusy = true;
  try {
    const [docState, selection, context, undoEnabled, redoEnabled] = await Promise.all([
      state.editor.getDocumentState().catch(() => null),
      state.editor.getSelectionContext().catch(() => null),
      state.editor.commands.context().catch(() => ({})),
      state.editor.commands.isEnabled("edit:undo").catch(() => false),
      state.editor.commands.isEnabled("edit:redo").catch(() => false),
    ]);

    if (docState) {
      updateDirtyUi(docState.dirty);
      updatePageUi(selection?.page || state.currentPage, docState.pageCount || state.pageCount);
      els.documentMeta.textContent =
        `${docState.pageCount || state.pageCount || "?"}페이지 · ${docState.dirty ? "저장되지 않은 변경사항 있음" : "저장됨"} · 직접 편집`;
    } else if (selection) {
      updatePageUi(selection.page, state.pageCount);
    }

    const undo = $('[data-command="edit:undo"]');
    const redo = $('[data-command="edit:redo"]');
    if (undo) undo.disabled = !undoEnabled;
    if (redo) redo.disabled = !redoEnabled;
    updateTableButtonStates(context || {});
  } finally {
    state.monitorBusy = false;
  }
}

function startStateMonitor() {
  stopStateMonitor();
  refreshCommandStates();
  state.monitorTimer = window.setInterval(refreshCommandStates, 700);
}

function stopStateMonitor() {
  if (state.monitorTimer) {
    clearInterval(state.monitorTimer);
    state.monitorTimer = null;
  }
}

async function executeStudioCommand(commandId, params = undefined, allowDialog = false) {
  if (!state.editor || !state.currentFile) return;
  try {
    const enabled = await state.editor.commands.isEnabled(commandId).catch(() => true);
    if (!enabled) {
      toast("현재 선택 상태에서는 사용할 수 없는 기능입니다.");
      return;
    }
    const result = await state.editor.commands.execute(
      commandId,
      params,
      { allowDialog }
    );
    if (result && result.ok === false) {
      toast(result.message || "현재 상태에서는 실행할 수 없습니다.");
      return;
    }
    window.setTimeout(refreshCommandStates, 120);
  } catch (error) {
    console.error("[quick-ribbon]", commandId, error);
    toast(error?.message || "편집 명령 실행에 실패했습니다.");
  }
}

async function toggleStudioChrome() {
  if (!state.editor) return;
  try {
    const current = await state.editor.chrome.get();
    const nextHidden = current.menu || current.toolbar;
    await state.editor.chrome.set({
      menu: !nextHidden,
      toolbar: !nextHidden,
      statusbar: true,
    });
    state.chromeHidden = nextHidden;
    els.studioChromeButton.textContent = nextHidden ? "기본 도구 보이기" : "기본 도구 숨기기";
    toast(nextHidden ? "Studio 기본 메뉴/도구를 숨겼습니다." : "Studio 기본 메뉴/도구를 표시했습니다.");
  } catch (error) {
    console.error(error);
    toast("기본 도구 표시 상태를 바꾸지 못했습니다.");
  }
}

async function openFile(file) {
  if (!file || state.loading) return;

  const format = getFormat(file.name);
  if (!format) {
    toast("HWP 또는 HWPX 파일을 선택해주세요.");
    return;
  }

  state.loading = true;
  stopStateMonitor();
  els.openButton.disabled = true;
  els.emptyOpenButton.disabled = true;
  els.saveButton.disabled = true;
  els.printButton.disabled = true;
  els.documentName.textContent = file.name;
  els.documentMeta.textContent = "편집기에서 문서를 여는 중…";
  els.formatInfo.textContent = `${format.toUpperCase()} · Quick Ribbon`;

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
    state.currentPage = 1;

    setDocumentUiVisible(true);
    els.studioLoading.hidden = true;
    els.studioHost.hidden = false;
    els.quickRibbon.hidden = false;

    els.documentMeta.textContent =
      `${state.pageCount || "?"}페이지 · 문서 위에서 바로 클릭해 편집 · 빠른 리본 사용 가능`;
    els.saveButton.disabled = false;
    els.printButton.disabled = false;
    els.saveButton.textContent = format === "hwpx" ? "HWPX 저장" : "HWP 저장";
    els.dirtyBadge.hidden = false;
    updateDirtyUi(false);
    updatePageUi(1, state.pageCount);
    setStatus("직접 편집 중");
    startStateMonitor();
    toast("빠른 편집 리본이 활성화되었습니다.");
  } catch (error) {
    console.error(error);
    els.documentMeta.textContent = "문서를 열지 못했습니다.";
    setStatus("열기 실패");
    toast(error?.message || "문서를 열 수 없습니다.");
    if (!state.editor) {
      setDocumentUiVisible(false);
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
      // notifySaved를 지원하지 않는 구형 Studio에서도 다운로드 자체는 완료된다.
    }

    updateDirtyUi(false);
    setStatus("저장 완료");
    toast(`${outName} 저장을 시작했습니다.`);
    window.setTimeout(refreshCommandStates, 150);
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
els.studioChromeButton.addEventListener("click", toggleStudioChrome);

$$("[data-command]").forEach((button) => {
  button.addEventListener("click", () => {
    executeStudioCommand(
      button.dataset.command,
      undefined,
      button.dataset.dialog === "true"
    );
  });
});

els.lineSpacingSelect.addEventListener("change", () => {
  const value = Number(els.lineSpacingSelect.value);
  if (!value) return;
  executeStudioCommand("format:line-spacing", { value }, false);
});

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

window.addEventListener("focus", refreshCommandStates);

window.addEventListener("keydown", (event) => {
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key.toLowerCase() === "s" && state.currentFile) {
    event.preventDefault();
    saveDocument();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});

setStatus("HWP/HWPX 직접 편집기 준비");
