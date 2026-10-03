# Web HWP Editor

브라우저에서 HWP / HWPX를 직접 작성·열기·편집·저장하는 Local-first 웹 에디터입니다.

## Live

https://kdc916.github.io/Web-HWP-Editor/

## 현재 안정 기준

v0.5.0 – New Document & Table Reliability

### 새 문서
- HWP 파일을 먼저 열 필요 없이 새 문서 버튼으로 빈 HWP 문서 생성
- 첫 화면에서 새 문서 시작
- 상단 헤더와 Quick Ribbon에서도 새 문서 생성
- 새 문서를 HWP로 바로 저장

### 쪽
- Quick Ribbon에 새 쪽 추가
- 현재 커서 위치에서 page:break 실행
- Ctrl+Enter과 동일한 HWP 쪽 나누기

### 표
- Quick Ribbon에 표 만들기 추가
- 줄/칸 추가·삭제
- 셀 합치기
- 셀 나누기
- 셀 너비/높이 같게
- 표/셀 속성

### 표/셀 나누기 신뢰성 수정
기존 v0.4.x는 공개 태그 v0.8.6의 사전 빌드 WASM을 사용했습니다.

v0.5.0부터는 rhwp의 수정 커밋을 정확한 SHA로 고정하고 WASM과 Studio를 GitHub Actions에서 같은 소스로 직접 빌드합니다.

Pinned core:
6b3faf77d8085441f9f26d88d65a49791e910352

이 커밋에는 upstream #4138 셀 분할 회귀 가드가 포함되어 있습니다.

분할 뒤 셀 폭이 줄었는데도 예전 폭 기준 line segment가 남아 발생하던 다음 문제를 보정하는 경로가 포함됩니다.
- 글자가 셀 경계에서 잘리는 문제
- 셀 내부 줄 배치가 틀어지는 문제
- vpos 흐름이 무너지는 문제
- 분할 후 페이지네이션이 달라지는 문제

### 로컬 처리
- 외부 편집 사이트 iframe을 사용하지 않음
- Studio와 WASM을 동일 GitHub Pages origin에 self-host
- 사용자가 연 문서 파일은 서버 업로드 API로 전송하지 않음

## 기술 구조
- Web HWP Editor v0.5 shell
- Quick Ribbon
- @rhwp/editor 0.8.6 bridge
- self-hosted rhwp Studio from pinned commit
- fresh rhwp WASM from the same pinned commit

브리지 파일은 v0.8.6 tag와 pinned commit에서 동일한 SHA임을 확인한 뒤 유지했습니다.

자세한 개발 이력은 DEVELOPMENT_HANDOFF.md를 참고하세요.
