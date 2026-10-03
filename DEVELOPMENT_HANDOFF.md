# Web HWP Editor - Development Handoff

## 프로젝트 목표
Mac/Windows 설치 없이 브라우저에서 HWP/HWPX 문서를 빠르게 열고 수정할 수 있는 Local-first 편집기.

핵심 UX:
```
파일 드래그 → 문서 확인 → 수정 → HWPX/PDF 저장
```

## 안정 기준
### v0.1.0
- 정적 HTML/CSS/JS
- HWPX ZIP 처리: JSZip
- XML 처리: Browser DOMParser/XMLSerializer
- 서버 전송 없음
- 일반 문단 및 표 셀 텍스트 편집
- 원본 패키지 기반 재저장

## 구조
```
index.html
styles.css
js/
  app.js        UI / editor state / history
  hwpx.js       HWPX package / XML adapter
README.md
DEVELOPMENT_HANDOFF.md
```

## v0.1 구현 방식
HWPX 전체 문서 모델을 새로 생성하지 않는다.

원본 ZIP 패키지를 메모리에 유지하고:
1. `Contents/section*.xml` 파싱
2. 화면에서 일반 문단과 표 셀을 편집
3. 대응되는 XML Text 노드만 수정
4. 나머지 파일/리소스는 그대로 보존
5. ZIP을 다시 HWPX로 생성

이 방식은 초기 버전에서 이미지, 스타일, 메타데이터 등 미지원 항목이 저장 시 사라지는 회귀를 최소화하기 위한 선택이다.

## 다음 개발 우선순위

### v0.2 - HWPX Rendering Fidelity
- `header.xml` 스타일 테이블 파싱
- charPr / paraPr 연결
- 폰트 크기/굵기/색상
- 정렬, 줄 간격, 들여쓰기
- 셀 rowspan/colspan
- 이미지 BinData 렌더링
- 페이지 사이즈/여백 반영

### v0.3 - Editing Tools
- 서식 툴바
- 문단 삽입/삭제
- 표 생성 및 행/열 조작
- 이미지 삽입
- Find/Replace
- 자동저장(LocalStorage/IndexedDB 작업본)

### v0.4 - HWP Import
- HWP 5.x OLE/Compound File parser 또는 검증된 WASM parser 조사/통합
- HWP → Internal Document Model
- HWP는 우선 읽기/Import만 지원
- 저장은 HWPX

### v0.5 - Export
- PDF
- DOCX
- 인쇄 최적화

### v0.6+
- HWP Writer
- 수식/도형/차트
- 각주/미주/머리말/꼬리말
- 변경 추적

## 중요 회귀 방지 규칙
- 미지원 XML 요소를 저장 과정에서 삭제하지 않는다.
- 원본 HWPX ZIP 내부 파일을 불필요하게 재생성하지 않는다.
- 파일 저장 후 한컴 한/글에서 재오픈 테스트를 수행한다.
- 한글 IME 입력/커서 동작을 Chrome, Edge, Safari에서 각각 검증한다.
- 대용량 문서는 메인 스레드 블로킹을 줄이기 위해 향후 Web Worker 도입.

## 테스트 문서 세트 권장
최소 6개:
1. 텍스트만 있는 1페이지
2. 여러 글자 서식
3. 표 1개
4. 병합 셀이 많은 표
5. 이미지 포함
6. 20페이지 이상 문서

각 문서에 대해:
- 원본 Open
- 편집
- Save
- 한컴 한/글에서 Re-open
- XML diff
순으로 검증한다.

## 제품 방향
'한컴 한/글 복제'보다 **빠른 HWP/HWPX 수정 웹 도구**에 집중한다.

차별점 후보:
- 서버 업로드 없음
- HWP/HWPX 즉시 수정
- 일괄 PDF/DOCX 변환
- 공문서/이력서 등 자주 쓰는 양식 빠른 수정
- 이후 선택 영역 AI 교정/요약 기능은 별도 옵션으로 확장
