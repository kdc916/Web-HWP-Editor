import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { documentFormat, downloadName, assertLoadedDocument, fetchDocumentBytes } from '../js/document-utils.js';

test('file types are case insensitive and reject disguised extensions', () => {
  assert.equal(documentFormat('자료.HWPX'), 'hwpx');
  assert.equal(documentFormat('자료.hwp.exe'), null);
  assert.equal(documentFormat(), null);
});
test('repeated saves do not accumulate edited suffixes', () => {
  assert.equal(downloadName('새 문서.hwp','hwp',true),'새 문서.hwp');
  assert.equal(downloadName('보고서_edited.hwp','hwp',false),'보고서_edited.hwp');
});
test('invalid successful-looking load responses are rejected', () => {
  for (const pageCount of [undefined,NaN,Infinity,0,-1,1.5,'1']) assert.throws(()=>assertLoadedDocument({pageCount}));
  assert.doesNotThrow(()=>assertLoadedDocument({pageCount:1}));
});
test('download deadline covers stalled headers and stalled response bodies', async () => {
  const server = http.createServer((req,res)=>{
    if(req.url==='/body') { res.writeHead(200);res.write('first byte'); }
    else if(req.url==='/empty') { res.end(); }
    else if(req.url==='/missing') {res.writeHead(404);res.end();}
    else if(req.url==='/ok') res.end('document');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const path of ['/headers','/body']) await assert.rejects(fetchDocumentBytes(url+path,{timeoutMs:150}),/시간이 초과/);
    await assert.rejects(fetchDocumentBytes(url+'/empty'),/비어/);
    await assert.rejects(fetchDocumentBytes(url+'/missing'),/404/);
    assert.equal(new TextDecoder().decode(await fetchDocumentBytes(url+'/ok')),'document');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
