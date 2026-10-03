import { createEditor } from "@rhwp/editor";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  editor: null,
  hasDocument: false,
  sourceFile: null,
  fileName: null,
  currentFormat: null,
  isNewDocument: false,
  pageCount: 0,
  currentPage: 1,
  loading: false,
  dirty: false,
  monitorTimer: null,
  monitorBusy: false,
};

const els = {
  fileInput: $("#fileInput"),
  newButton: $("#newButton"),
  openButton: $("#openButton"),
  ribbonNewButton: $("#ribbonNewButton"),
  ribbonOpenButton: $("#ribbonOpenButton"),
  emptyNewButton: $("#emptyNewButton"),
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
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
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

const EMBEDDED_STUDIO_BUILD = "v0.5.4-newdoc-safe";

function getStudioUrl() {
  return new URL(
    import.meta.env.BASE_URL + "studio-v052/?build=" + encodeURIComponent(EMBEDDED_STUDIO_BUILD),
    window.location.origin
  ).href;
}

function getBlankTemplateUrl() {
  return new URL(
    import.meta.env.BASE_URL + "blank2010.hwp",
    window.location.origin
  ).href;
}

async function retireLegacyStudioServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const legacyScope = new URL(import.meta.env.BASE_URL + "studio/", window.location.origin).href;
    await Promise.all(
      registrations
        .filter((registration) => registration.scope.startsWith(legacyScope))
        .map((registration) => registration.unregister())
    );
  } catch (error) {
    console.warn("[studio-cache] legacy service worker cleanup skipped", error);
  }
}

function setEditorSurfaceVisible(visible) {
  els.emptyState.hidden = visible;
  els.emptyState.style.display = visible ? "none" : "flex";
  els.editorViewport.hidden = !visible;
  els.editorViewport.style.display = visible ? "block" : "none";
  els.quickRibbon.hidden = !visible || !state.hasDocument;
}

async function ensureEditor() {
  if (state.editor) return state.editor;

  els.emptyState.hidden = true;
  els.emptyState.style.display = "none";
  els.editorViewport.hidden = false;
  els.editorViewport.style.display = "block";
  els.quickRibbon.hidden = true;
  els.studioLoading.hidden = false;
  // Studio must remain measurable while the iframe/canvas initializes.
  // The loading layer covers it visually, but display:none can produce a zero-size editor.
  els.studioHost.hidden = false;
  setStatus("직접 편집 엔진 초기화 중…");

  const editor = await createEditor(els.studioHost, {
    studioUrl: getStudioUrl(),
    width: "100%",
    height: "100%",
    renderer: "canvas2d",
    handshakeTimeoutMs: 8000,
    requestTimeoutMs: 90000,
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

function updateDirtyUi(docDirty) {
  const effectiveDirty = Boolean(docDirty || state.isNewDocument);
  state.dirty = effectiveDirty;
  els.dirtyBadge.hidden = !state.hasDocument;
  if (!state.hasDocument) return;

  if (state.isNewDocument) {
    els.dirtyBadge.textContent = "● 새 문서 · 저장 필요";
  } else {
    els.dirtyBadge.textContent = effectiveDirty ? "● 저장 안 됨" : "✓ 저장됨";
  }
  els.dirtyBadge.classList.toggle("is-dirty", effectiveDirty);

  els.saveStatus.hidden = false;
  if (state.isNewDocument) {
    els.saveStatus.textContent = "새 문서";
  } else {
    els.saveStatus.textContent = effectiveDirty ? "변경사항 있음" : "저장 완료";
  }
  els.saveStatus.classList.toggle("is-dirty", effectiveDirty);
}

function updatePageUi(page, count) {
  state.currentPage = Number(page || 1);
  state.pageCount = Number(count || state.pageCount || 0);
  els.pageStatus.hidden = !state.hasDocument;
  if (!state.hasDocument) return;
  els.pageStatus.textContent = state.pageCount
    ? state.currentPage + " / " + state.pageCount + "쪽"
    : state.currentPage + "쪽";
}

function updateTableButtonStates(context) {
  const ctx = context || {};
  const inTable = Boolean(ctx.inTable || ctx.inCellSelectionMode || ctx.inTableObjectSelection);
  const inCellSelection = Boolean(ctx.inCellSelectionMode);

  $$(".table-command").forEach((button) => {
    button.disabled = !inTable;
  });
  $$(".merge-command").forEach((button) => {
    button.disabled = !inCellSelection;
  });
  $$(".table-create-command").forEach((button) => {
    button.disabled = !state.hasDocument || inTable;
  });
}

async function refreshCommandStates() {
  if (!state.editor || !state.hasDocument || state.monitorBusy) return;
  state.monitorBusy = true;

  try {
    const commandButtons = $$("[data-command]");
    const [docState, selection, commandList] = await Promise.all([
      state.editor.getDocumentState().catch(() => null),
      state.editor.getSelectionContext().catch(() => null),
      state.editor.commands.list().catch(() => []),
    ]);

    if (docState) {
      if (!state.currentFormat) state.currentFormat = docState.format || "hwp";
      updateDirtyUi(docState.dirty);
      updatePageUi(selection ? selection.page : state.currentPage, docState.pageCount || state.pageCount);
      let stateText = "저장됨";
      if (state.isNewDocument) stateText = "새 문서 · 아직 저장되지 않음";
      else if (docState.dirty) stateText = "저장되지 않은 변경사항 있음";
      els.documentMeta.textContent =
        (docState.pageCount || state.pageCount || "?") + "페이지 · " + stateText + " · 직접 편집";
    } else if (selection) {
      updatePageUi(selection.page, state.pageCount);
    }

    const commandMap = new Map(commandList.map((command) => [command.id, command]));
    for (const button of commandButtons) {
      const commandId = button.dataset.command;
      if (!commandId) continue;
      const command = commandMap.get(commandId);
      button.disabled = !command || command.enabled !== true;
      button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
      if (!command) button.dataset.commandMissing = "true";
      else delete button.dataset.commandMissing;
    }
  } finally {
    state.monitorBusy = false;
  }
}
function startStateMonitor() {
  stopStateMonitor();
  refreshCommandStates();
  state.monitorTimer = window.setInterval(refreshCommandStates, 900);
}

function stopStateMonitor() {
  if (state.monitorTimer) {
    clearInterval(state.monitorTimer);
    state.monitorTimer = null;
  }
}

async function executeStudioCommand(commandId, params, allowDialog) {
  if (!state.editor || !state.hasDocument) return false;

  try {
    const enabled = await state.editor.commands.isEnabled(commandId).catch(() => true);
    if (!enabled) {
      toast("현재 선택 상태에서는 사용할 수 없는 기능입니다.");
      return false;
    }

    const beforePages = state.pageCount;
    const result = await state.editor.commands.execute(
      commandId,
      params,
      { allowDialog: Boolean(allowDialog) }
    );

    if (result && result.ok === false) {
      toast(result.message || "현재 상태에서는 실행할 수 없습니다.");
      return false;
    }

    if (commandId === "page:break") {
      toast("현재 위치에서 새 쪽을 시작했습니다.");
    } else if (commandId === "table:create") {
      toast("표 만들기 설정을 열었습니다.");
    } else if (commandId === "table:cell-split") {
      toast("셀 나누기 설정을 열었습니다. 구조/줄배치 회귀검사가 적용됩니다.");
    } else if (commandId === "table:cell-height-equal") {
      toast("선택한 셀의 행 높이를 실제 HWP 저장 그리드로 맞췄습니다.");
    } else if (commandId === "table:cell-width-equal") {
      toast("선택한 셀의 열 너비를 실제 HWP 저장 그리드로 맞췄습니다.");
    }

    window.setTimeout(async () => {
      await refreshCommandStates();
      if (commandId === "page:break" && state.pageCount <= beforePages) {
        window.setTimeout(refreshCommandStates, 500);
      }
    }, 150);

    return true;
  } catch (error) {
    console.error("[quick-ribbon]", commandId, error);
    toast(error && error.message ? error.message : "편집 명령 실행에 실패했습니다.");
    return false;
  }
}

async function waitForDocumentEpochChange(previousEpoch, timeoutMs) {
  const started = performance.now();
  const timeout = timeoutMs || 6000;

  while (performance.now() - started < timeout) {
    try {
      const current = await state.editor.getDocumentState();
      if (
        current &&
        (previousEpoch == null || current.documentEpoch !== previousEpoch) &&
        current.pageCount >= 1
      ) {
        return current;
      }
    } catch {
      // 새 문서 생성 중 일시적인 상태 조회 실패는 재시도한다.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return null;
}

async function createNewDocument() {
  if (state.loading) return;

  state.loading = true;
  stopStateMonitor();
  els.newButton.disabled = true;
  els.emptyNewButton.disabled = true;
  els.saveButton.disabled = true;
  els.printButton.disabled = true;

  try {
    const editor = await ensureEditor();
    setStatus("빈 HWP 문서 불러오는 중…");
    els.documentName.textContent = "새 문서.hwp";
    els.documentMeta.textContent = "검증된 빈 HWP 템플릿을 준비하는 중…";

    const response = await fetch(getBlankTemplateUrl(), {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("빈 HWP 템플릿을 불러오지 못했습니다. HTTP " + response.status);
    }

    const buffer = await response.arrayBuffer();
    const result = await editor.loadFile(buffer, "새 문서.hwp", {
      // There is nothing to protect before the first document is loaded.
      // Skipping the guard avoids an invisible first-load confirmation inside Studio.
      skipUnsavedGuard: !state.hasDocument,
      suppressDialogs: true,
    });

    state.hasDocument = true;
    state.sourceFile = null;
    state.fileName = "새 문서.hwp";
    state.currentFormat = "hwp";
    state.isNewDocument = true;
    state.pageCount = Number(result && result.pageCount ? result.pageCount : 1);
    state.currentPage = 1;

    setEditorSurfaceVisible(true);
    els.quickRibbon.hidden = false;
    els.studioLoading.hidden = true;
    els.studioHost.hidden = false;
    els.documentName.textContent = "새 문서.hwp";
    els.documentMeta.textContent =
      state.pageCount + "페이지 · 새 문서 · 바로 입력 가능";
    els.formatInfo.textContent = "HWP · Blank Template";
    els.saveButton.disabled = false;
    els.saveButton.textContent = "HWP 저장";
    els.printButton.disabled = false;

    updateDirtyUi(true);
    updatePageUi(1, state.pageCount);
    setStatus("새 문서 편집 중");
    startStateMonitor();
    toast("빈 HWP 문서를 열었습니다. 바로 입력을 시작하세요.");
  } catch (error) {
    console.error("[new-document]", error);
    setStatus("새 문서 생성 실패");
    toast(error && error.message ? error.message : "새 문서를 만들 수 없습니다.");

    if (!state.hasDocument) {
      setEditorSurfaceVisible(false);
      els.documentName.textContent = "새 문서를 만들거나 파일을 열어주세요";
      els.documentMeta.textContent =
        "HWP 파일 없이 빈 문서부터 바로 시작할 수 있습니다.";
    }
  } finally {
    state.loading = false;
    els.newButton.disabled = false;
    els.emptyNewButton.disabled = false;
    if (state.hasDocument) {
      els.saveButton.disabled = false;
      els.printButton.disabled = false;
    }
  }
}

async function toggleStudioChrome() {
  if (!state.editor) return;

  try {
    const current = await state.editor.chrome.get();
    const nextHidden = Boolean(current.menu || current.toolbar);

    await state.editor.chrome.set({
      menu: !nextHidden,
      toolbar: !nextHidden,
      statusbar: true,
    });

    els.studioChromeButton.textContent =
      nextHidden ? "기본 도구 보이기" : "기본 도구 숨기기";

    toast(
      nextHidden
        ? "Studio 기본 메뉴/도구를 숨겼습니다."
        : "Studio 기본 메뉴/도구를 표시했습니다."
    );
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
  els.formatInfo.textContent = format.toUpperCase() + " · Core Fix";

  try {
    const editor = await ensureEditor();
    setStatus(format.toUpperCase() + " 문서 분석 중…");

    const buffer = await file.arrayBuffer();
    const result = await editor.loadFile(buffer, file.name, {
      skipUnsavedGuard: false,
      suppressDialogs: true,
    });

    state.hasDocument = true;
    state.sourceFile = file;
    state.fileName = file.name;
    state.currentFormat = format;
    state.isNewDocument = false;
    state.pageCount = Number(result && result.pageCount ? result.pageCount : 0);
    state.currentPage = 1;

    setEditorSurfaceVisible(true);
    els.quickRibbon.hidden = false;
    els.studioLoading.hidden = true;
    els.studioHost.hidden = false;

    els.documentMeta.textContent =
      (state.pageCount || "?") + "페이지 · 최신 표/셀 보정 코어 · 빠른 리본 사용 가능";
    els.saveButton.disabled = false;
    els.printButton.disabled = false;
    els.saveButton.textContent = format === "hwpx" ? "HWPX 저장" : "HWP 저장";

    updateDirtyUi(false);
    updatePageUi(1, state.pageCount);
    setStatus("직접 편집 중");
    startStateMonitor();

    toast("문서를 열었습니다. 표/셀 분할 보정 코어가 적용되었습니다.");
  } catch (error) {
    console.error(error);
    els.documentMeta.textContent = "문서를 열지 못했습니다.";
    setStatus("열기 실패");
    toast(error && error.message ? error.message : "문서를 열 수 없습니다.");

    if (!state.hasDocument) setEditorSurfaceVisible(false);
  } finally {
    state.loading = false;
    els.openButton.disabled = false;
    els.emptyOpenButton.disabled = false;
    els.fileInput.value = "";
  }
}

async function saveDocument() {
  if (!state.editor || !state.hasDocument || !state.currentFormat) return;

  try {
    els.saveButton.disabled = true;
    setStatus("문서 저장 중…");

    const sourceName = state.fileName || ("새 문서." + state.currentFormat);
    const base = sourceName.replace(/\.(hwp|hwpx)$/i, "");
    const outName = state.isNewDocument
      ? base + "." + state.currentFormat
      : base + "_edited." + state.currentFormat;

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
      // 다운로드 자체는 이미 완료됨.
    }

    state.fileName = outName;
    state.isNewDocument = false;
    els.documentName.textContent = outName;

    updateDirtyUi(false);
    setStatus("저장 완료");
    toast(outName + " 저장을 시작했습니다.");
    window.setTimeout(refreshCommandStates, 180);
  } catch (error) {
    console.error(error);
    setStatus("저장 실패");
    toast(error && error.message ? error.message : "저장에 실패했습니다.");
  } finally {
    els.saveButton.disabled = false;
  }
}

function printDocument() {
  if (!state.editor || !state.editor.element || !state.editor.element.contentWindow) return;

  try {
    state.editor.element.contentWindow.focus();
    state.editor.element.contentWindow.print();
  } catch (error) {
    console.error(error);
    toast("편집기 메뉴의 파일 → 인쇄 기능을 사용해주세요.");
  }
}

els.newButton.addEventListener("click", createNewDocument);
els.emptyNewButton.addEventListener("click", createNewDocument);
els.ribbonNewButton.addEventListener("click", createNewDocument);

els.openButton.addEventListener("click", chooseFile);
els.emptyOpenButton.addEventListener("click", chooseFile);
els.ribbonOpenButton.addEventListener("click", chooseFile);

els.fileInput.addEventListener("change", (event) => openFile(event.target.files && event.target.files[0]));
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

els.dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer && event.dataTransfer.files
    ? event.dataTransfer.files[0]
    : null;
  openFile(file);
});

window.addEventListener("focus", refreshCommandStates);

window.addEventListener("keydown", (event) => {
  const mod = event.metaKey || event.ctrlKey;

  if (mod && event.key.toLowerCase() === "s" && state.hasDocument) {
    event.preventDefault();
    saveDocument();
  }

  if (mod && event.key === "Enter" && state.hasDocument) {
    if (document.activeElement !== (state.editor && state.editor.element)) {
      event.preventDefault();
      executeStudioCommand("page:break");
    }
  }
});

window.addEventListener("beforeunload", (event) => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});

retireLegacyStudioServiceWorkers();
setEditorSurfaceVisible(false);
setStatus("새 문서 또는 HWP/HWPX 열기 준비");
