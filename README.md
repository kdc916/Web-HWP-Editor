# Web HWP Editor

브라우저에서 HWP / HWPX를 직접 작성·열기·편집·저장하는 Local-first 웹 에디터입니다.

## Live

https://kdc916.github.io/Web-HWP-Editor/

## 현재 안정 기준

**v0.5.1 – Table Integrity & Regression Guard**

이번 버전은 표 편집 안정성에 집중합니다.

### 수정 대상

사용자 재현:
- 3×3 표 생성
- 셀 높이 같게
- 오른쪽 3개 셀 세로 병합
- 오른쪽 병합 셀 하단과 왼쪽 표 하단이 어긋남

원인은 구버전 Studio에서 화면용 local resize geometry와 HWP에 실제 저장되는 셀 width/height가 섞일 수 있었던 점입니다. 병합은 저장된 행 높이 합을 기준으로 계산하므로 두 기준이 다르면 병합 셀 높이가 달라질 수 있습니다.

### v0.5.1 변경

- embedded Studio를 `/studio-v051/`로 버전 격리
- embedded Studio의 PWA / Service Worker 제거
- 이전 `/studio/` Service Worker 자동 unregister
- 모든 Quick Ribbon 버튼을 실제 `commands.isEnabled()` 상태와 동기화
- `셀 높이/너비 같게`를 **표 전체 저장형 균등화**로 교체
- 일반 셀뿐 아니라 병합 셀도 row/column span 합으로 width/height 동기화
- 균등화는 Snapshot transaction으로 실행하여 Undo/Redo 지원
- 중첩표 등 안전한 독립 grid를 만들 수 없는 경우 추정하지 않고 동작 중단

### 표 회귀 테스트

배포 전에 CI에서 다음을 자동 검사합니다.

1. 서로 다른 3개 행 높이 생성
2. 표 전체 높이 균등화
3. 오른쪽 3개 셀 세로 병합
4. 병합 셀 저장 height == 걸친 행 height 합
5. 좌측 표 하단 == 우측 병합 셀 하단
6. HWP 저장 → 다시 열기 → 하단 재검증
7. 병합 셀 다시 나누기 → 각 행 y/height 재검증
8. 3×3 표에서 merge → split → row/column insert → row/column delete 후 모든 grid 좌표가 정확히 한 셀에만 포함되는지 검증
9. upstream #4138 split stale line segment 회귀
10. upstream #4323 merge text reflow 회귀

테스트 하나라도 실패하면 GitHub Pages 새 버전을 배포하지 않습니다.

### 기능

- 새 문서
- 새 쪽
- 표 만들기
- 줄/칸 추가·삭제
- 셀 합치기·나누기
- 표 전체 높이/너비 같게
- 글자/문단 서식
- HWP/HWPX 저장
- PDF/인쇄

### 엔진

Pinned rhwp core:

`6b3faf77d8085441f9f26d88d65a49791e910352`

WASM과 Studio를 같은 pinned source에서 빌드합니다.
