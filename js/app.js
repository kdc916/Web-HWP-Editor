import { createEditor } from '../vendor/editor/index.js';
import { APP_VERSION, documentFormat, downloadName, fetchDocumentBytes, assertLoadedDocument } from './document-utils.js';
const $$ = selector => [...document.querySelectorAll(selector)];
const els = Object.fromEntries($$('[id]').map(el => [el.id, el]));
const state = { editor: null, busy: false, saving: false, hasDocument: false, fileName: '', format: 'hwp', isNew: false, dirty: false, monitoring: false, timer: null, generation: 0 };
const assetUrl = path => new URL(path, document.baseURI).href;
function toast(message) {
  els.toast.textContent = message; els.toast.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => els.toast.classList.remove('show'), 5000);
}
function status(message) { els.statusText.textContent = message; }
// Storage can be unavailable in private/restricted browser contexts.
const ribbonPreferenceKey = 'webhwp.quickRibbon';
let ribbonExpanded = false;
try { ribbonExpanded = localStorage.getItem(ribbonPreferenceKey) === 'true'; } catch {}
function renderRibbon() {
  const expanded = state.hasDocument && ribbonExpanded;
  els.quickRibbon.hidden = !expanded;
  els.ribbonToggleButton.setAttribute('aria-expanded', String(expanded));
  els.ribbonToggleButton.textContent = expanded ? '빠른 도구 숨기기' : '빠른 도구 보기';
}
function surface(visible) {
  els.emptyState.hidden = visible; els.editorViewport.hidden = !visible; renderRibbon();
}
function controls() {
  els.ribbonToggleButton.disabled = !state.hasDocument;
  els.studioHost.inert = state.busy || state.saving;
  els.studioChromeButton.disabled = !state.editor || state.busy || state.saving;
  for (const id of ['newButton', 'emptyNewButton', 'openButton', 'emptyOpenButton']) els[id].disabled = state.busy || state.saving;
  els.saveButton.disabled = els.printButton.disabled = !state.hasDocument || state.busy || state.saving;
  els.lineSpacingSelect.disabled = !state.hasDocument || state.busy || state.saving;
  if (state.busy || state.saving) $$('[data-command]').forEach(button => { button.disabled = true; });
}
function dirtyUi(dirty) {
  state.dirty = state.isNew || dirty;
  els.dirtyBadge.hidden = els.saveStatus.hidden = !state.hasDocument;
  els.dirtyBadge.textContent = state.isNew ? '● 새 문서 · 저장 필요' : state.dirty ? '● 저장 안 됨' : '✓ 저장됨';
  els.saveStatus.textContent = state.dirty ? '변경사항 있음' : '저장 완료';
  els.dirtyBadge.classList.toggle('is-dirty', state.dirty); els.saveStatus.classList.toggle('is-dirty', state.dirty);
}
async function refresh() {
  if (!state.editor || !state.hasDocument || state.busy || state.saving || state.monitoring) return;
  state.monitoring = true;
  const generation = state.generation;
  try {
    const [doc, selection, commands] = await Promise.all([state.editor.getDocumentState(), state.editor.getSelectionContext(), state.editor.commands.list()]);
    if (state.busy || state.saving || generation !== state.generation) return;
    dirtyUi(doc.dirty); els.pageStatus.hidden = false;
    els.pageStatus.textContent = `${selection.page || 1} / ${doc.pageCount}쪽`;
    els.documentMeta.textContent = `${doc.pageCount}페이지 · ${state.dirty ? '저장되지 않은 변경사항 있음' : '저장됨'}`;
    const map = new Map(commands.map(command => [command.id, command]));
    for (const button of $$('[data-command]')) {
      button.disabled = map.get(button.dataset.command)?.enabled !== true;
      button.setAttribute('aria-disabled', String(button.disabled));
    }
  } catch (error) { console.warn('편집 상태 조회 실패', error); }
  finally { state.monitoring = false; }
}
function monitor() { clearInterval(state.timer); state.timer = setInterval(refresh, 500); refresh(); }
function focusEditor() { state.editor?.element.contentDocument?.querySelector('textarea')?.focus({ preventScroll: true }); }
async function ensureEditor() {
  if (state.editor) return state.editor;
  surface(true); els.studioLoading.hidden = false; els.studioHost.hidden = false;
  status('편집기를 준비하는 중…');
  const studioUrl = assetUrl(`./studio/?build=${APP_VERSION}&renderer=canvas2d`);
  await fetchDocumentBytes(studioUrl, { label: '편집기' });
  const editor = await createEditor(els.studioHost, {
    studioUrl, width: '100%', height: '100%',
    renderer: 'canvas2d', handshakeTimeoutMs: 20000, requestTimeoutMs: 30000,
  });
  state.editor = editor;
  const doc = editor.element.contentDocument;
  doc.addEventListener('webhwp:table-error', event => toast(event.detail));
  doc.addEventListener('keydown', event => {
    const mod = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    const action = mod && key === 's' && !event.shiftKey ? saveDocument : mod && key === 'o' ? chooseFile : event.altKey && !mod && key === 'n' ? createNewDocument : null;
    if (action) {
      event.preventDefault(); event.stopImmediatePropagation(); action();
    }
  }, true);
  doc.addEventListener('drop', event => {
    if (event.dataTransfer?.files[0]) { event.preventDefault(); event.stopImmediatePropagation(); loadDocument(event.dataTransfer.files[0]); }
  }, true);
  doc.addEventListener('click', event => {
    const id = event.target.closest('[data-cmd]')?.dataset.cmd;
    const action = { 'file:new-doc': createNewDocument, 'file:open': chooseFile, 'file:save': saveDocument }[id];
    if (action) {
      event.preventDefault(); event.stopImmediatePropagation();
      doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); action();
    }
  }, true);
  els.studioLoading.hidden = true;
  return editor;
}
async function confirmReplace() {
  if (!state.hasDocument) return true;
  const doc = await state.editor.getDocumentState();
  return !(doc.dirty || state.isNew) || window.confirm('저장하지 않은 내용이 있습니다. 현재 문서를 닫고 계속할까요?');
}
async function loadDocument(file, isNew = false) {
  if (state.busy || state.saving) return;
  const name = isNew ? '새 문서.hwp' : file?.name;
  const format = documentFormat(name);
  if (!format) { toast('HWP 또는 HWPX 파일을 선택해주세요.'); els.fileInput.value = ''; return; }
  state.busy = true; state.generation++; controls();
  let loaded = false;
  try {
    if (!(await confirmReplace())) return;
    const editor = await ensureEditor();
    status(isNew ? '새 문서를 만드는 중…' : '문서를 여는 중…');
    const buffer = isNew ? await fetchDocumentBytes(assetUrl('./blank2010.hwp')) : await file.arrayBuffer();
    const result = await editor.loadFile(buffer, name, { skipUnsavedGuard: true, suppressDialogs: true });
    assertLoadedDocument(result);
    Object.assign(state, { hasDocument: true, fileName: name, format, isNew });
    els.documentName.textContent = name; els.formatInfo.textContent = format.toUpperCase();
    els.saveButton.textContent = format.toUpperCase() + ' 저장';
    surface(true); dirtyUi(isNew); status(isNew ? '새 문서 편집 중' : '문서 편집 중');
    els.lineSpacingSelect.value = '';
    toast(isNew ? '새 문서를 만들었습니다. 바로 입력하세요.' : '문서를 열었습니다.'); loaded = true;
  } catch (error) {
    console.error('문서 열기 실패', error); status('문서 열기 실패'); toast(error.message || '문서를 열지 못했습니다.');
    if (!state.hasDocument) surface(false);
  } finally {
    state.busy = false; els.studioLoading.hidden = true; els.fileInput.value = ''; controls();
    if (state.hasDocument) monitor();
    if (loaded) focusEditor();
  }
}
function createNewDocument() { return loadDocument(null, true); }
function chooseFile() { if (!state.busy && !state.saving) els.fileInput.click(); }
function download(bytes, name, mime) {
  if (!bytes?.byteLength) throw new Error('저장할 문서 데이터가 비어 있습니다.');
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const anchor = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function saveDocument() {
  if (!state.hasDocument || state.busy || state.saving) return;
  state.saving = true; state.generation++; controls();
  try {
    status('문서 저장 중…');
    const name = downloadName(state.fileName, state.format, state.isNew);
    const bytes = state.format === 'hwpx' ? await state.editor.exportHwpx() : await state.editor.exportHwp();
    download(bytes, name, state.format === 'hwpx' ? 'application/vnd.hancom.hwpx' : 'application/x-hwp');
    await state.editor.notifySaved(name);
    state.fileName = name; state.isNew = false; els.documentName.textContent = name;
    dirtyUi(false); status('저장 파일 다운로드 완료'); toast(`${name} 다운로드를 시작했습니다.`);
  } catch (error) { console.error('저장 실패', error); status('저장 상태를 확인해주세요'); toast(error.message || '저장하지 못했습니다.'); }
  finally { state.saving = false; controls(); refresh(); }
}
async function execute(id, params, allowDialog = false) {
  if (!state.hasDocument || state.busy || state.saving) return;
  try {
    if (!(await state.editor.commands.isEnabled(id))) { toast('표 안에 커서를 놓거나 편집할 셀을 먼저 선택하세요.'); return; }
    const result = await state.editor.commands.execute(id, params, { allowDialog });
    if (result?.ok === false) throw new Error(result.message || '현재 선택 상태에서는 실행할 수 없습니다.');
    if (!allowDialog) focusEditor(); await refresh();
  } catch (error) { toast(error.message || '명령을 실행하지 못했습니다.'); }
}
async function toggleChrome() {
  try {
    const current = await state.editor.chrome.get(), visible = !(current.menu || current.toolbar);
    await state.editor.chrome.set({ menu: visible, toolbar: visible, statusbar: true });
    els.studioChromeButton.textContent = visible ? '편집기 메뉴 숨기기' : '편집기 메뉴 보기';
  } catch (error) { toast(error.message); }
}
for (const id of ['newButton', 'emptyNewButton']) els[id].addEventListener('click', createNewDocument);
for (const id of ['openButton', 'emptyOpenButton']) els[id].addEventListener('click', chooseFile);
els.fileInput.addEventListener('change', event => { if (event.target.files[0]) loadDocument(event.target.files[0]); });
els.saveButton.addEventListener('click', saveDocument);
els.printButton.addEventListener('click', () => execute('file:print', undefined, true));
els.studioChromeButton.addEventListener('click', toggleChrome);
els.ribbonToggleButton.addEventListener('click', () => {
  ribbonExpanded = !ribbonExpanded;
  try { localStorage.setItem(ribbonPreferenceKey, String(ribbonExpanded)); } catch {}
  renderRibbon();
});
$$('[data-command]').forEach(button => {
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => execute(button.dataset.command, undefined, button.dataset.dialog === 'true'));
});
els.lineSpacingSelect.addEventListener('change', () => {
  const value = Number(els.lineSpacingSelect.value);
  if (value) execute('format:line-spacing', { value });
  els.lineSpacingSelect.value = '';
});
for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) els.dropZone.addEventListener(type, event => {
  event.preventDefault(); els.dropZone.classList.toggle('dragover', type === 'dragenter' || type === 'dragover');
  if (type === 'drop' && event.dataTransfer?.files[0]) loadDocument(event.dataTransfer.files[0]);
});
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveDocument(); }
});
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('focus', refresh);
if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.filter(r => [assetUrl('./studio/'), assetUrl('./studio-v052/')].includes(r.scope)).map(r => r.unregister()))).catch(console.warn);
surface(false); controls();
status(location.protocol === 'file:' ? '로컬 실행은 npm start 또는 GitHub Pages 주소를 사용해주세요.' : '새 문서를 만들거나 HWP/HWPX 파일을 여세요.');
