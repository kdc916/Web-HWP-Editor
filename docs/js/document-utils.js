export const APP_VERSION = '0.5.5';

export function documentFormat(name) {
  return String(name || '').toLowerCase().match(/\.(hwp|hwpx)$/)?.[1] || null;
}
export function downloadName(name, format, isNew) {
  const base = name.replace(/\.(hwp|hwpx)$/i, '').replace(/_edited$/, '');
  return `${base}${isNew ? '' : '_edited'}.${format}`;
}
export async function fetchDocumentBytes(url, { timeoutMs = 15000, label = '문서' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${label} 파일을 불러오지 못했습니다 (${response.status}).`);
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) throw new Error(`${label} 파일이 비어 있습니다.`);
    return buffer;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${label} 다운로드 시간이 초과되었습니다. 네트워크 연결을 확인한 뒤 다시 시도해주세요.`);
    throw error;
  } finally { clearTimeout(timer); }
}
export function assertLoadedDocument(result) {
  if (!Number.isSafeInteger(result?.pageCount) || result.pageCount < 1) throw new Error('문서가 정상적으로 열리지 않았습니다.');
}
