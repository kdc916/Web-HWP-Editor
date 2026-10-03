# Web HWP Editor - Development Handoff

## 프로젝트 목표
Mac/Windows 설치 없이 브라우저에서 HWP/HWPX 문서를 빠르게 열고 수정할 수 있는 Local-first 편집기.

핵심 UX:

```text
파일 드래그 → 원본에 가까운 화면 확인 → 수정 → HWPX/PDF 저장
```

## 현재 안정 기준

### v0.2.0 - Rendering Fidelity
기준일: 2026-10-03

#### HWPX Package
- JSZip으로 원본 패키지를 메모리에 유지
- `Contents/header.xml` 파싱
- `Contents/content.hpf` manifest 파싱
- `Contents/section*.xml` 파싱
- `BinData` 이미지 Object URL 생성
- 수정 시 section XML만 갱신하고 나머지 패키지는 보존

#### Character Rendering
- charPrIDRef → header.xml `charPr` 연결
- height → CSS font-size
- textColor / shadeColor
- bold / italic
- underline / strikeout
- fontRef → HANGUL/LATIN fontface 매핑
- spacing → letter-spacing
- ratio → scaleX 근사 표시

#### Paragraph Rendering
- paraPrIDRef → header.xml `paraPr` 연결
- LEFT / RIGHT / CENTER / JUSTIFY
- lineSpacing PERCENT
- margin left/right/prev/next
- intent → text-indent

#### Page Rendering
- section `secPr/pagePr` width/height
- page margin left/right/top/bottom
- HWPUNIT → CSS px 변환: 96 / 7200

#### Table Rendering
- `hp:cellSpan` colSpan / rowSpan
- `hp:cellSz` width / height
- subList vertAlign
- 셀 텍스트 편집

#### Images
- `content.hpf` item id → href 매핑
- section `binaryItemIDRef` 탐색
- ZIP `BinData`를 Blob URL로 표시
- 새 문서 로드 시 이전 Blob URL 해제

#### UX
- Drag & Drop
- Undo / Redo
- Zoom
- Cmd/Ctrl + S
- Browser Print / PDF
- 로컬 파일 처리 안내

## 배포

GitHub Pages 예상 주소:

`https://kdc916.github.io/Web-HWP-Editor/`

자동 배포 파일:

`.github/workflows/pages.yml`

워크플로는 `main` push 및 수동 실행을 지원한다.

### Pages 관련 주의
연결된 GitHub 자동화 권한은 저장소 파일/워크플로 변경은 가능하지만 Repository Settings > Pages 활성화 자체를 바꾸는 Administration API는 사용할 수 없다.
Pages가 비활성 상태라 첫 workflow가 실패하면 GitHub 웹 UI에서 아래 1회 설정 필요:

`Settings → Pages → Build and deployment → Source → GitHub Actions`

이후 main push는 자동 배포된다.

## v0.2 구현 원칙

### 원본 보존 우선
아직 지원하지 않는 XML 노드를 재생성하지 않는다.

```text
원본 ZIP
  ↓
필요 XML만 DOMParser로 해석
  ↓
사용자가 수정한 text node만 변경
  ↓
section XML 직렬화
  ↓
원본 ZIP에 되삽입
```

이 방식으로 도형, 차트, 메타데이터 등 미지원 요소를 최대한 손대지 않는다.

## 알려진 제약
1. 여러 run이 섞인 문단은 run별 편집이다.
2. Enter로 신규 문단 생성하지 않는다.
3. 표 테두리/배경은 borderFill 해석 전이라 CSS 기본 테두리로 표시한다.
4. 이미지 anchor, wrap, crop, rotation은 아직 완전 반영하지 않는다.
5. 정확한 페이지 나눔 엔진은 미구현이다.
6. HWPX serializer round-trip은 다양한 실제 한컴 문서 샘플로 계속 검증해야 한다.

## 다음 패치

### v0.3 - Editing Tools
우선순위:
1. 선택 영역 글자 서식 툴바
2. 글꼴 / 크기 / 굵게 / 기울임 / 밑줄 / 색상 변경을 실제 charPr에 반영
3. 문단 정렬 / 줄간격 변경을 paraPr에 반영
4. Find / Replace
5. 새 문단 삽입 / 삭제
6. 표 행/열 추가/삭제
7. 표 셀 병합 / 분할
8. 이미지 삽입

### v0.3.1 - Table Fidelity
- borderFill 파싱
- 셀 배경색
- 4방향 테두리 굵기/형식/색상
- cellMargin

### v0.3.2 - Layout
- pageBreak / section break를 실제 페이지 카드로 분리
- header/footer 표시
- 이미지 treatAsChar / position 일부 반영

### v0.4 - HWP Import
- HWP 5.x OLE Compound File parser 또는 검증된 WASM parser 통합
- HWP → Internal Document Model
- 초기 HWP는 읽기/Import 우선
- 저장은 HWPX

### v0.5 - Export
- PDF 품질 개선
- DOCX Export
- 인쇄 페이지 분할

### v0.6+
- HWP Writer
- 수식/도형/차트
- 각주/미주
- 머리말/꼬리말
- 변경 추적

## 회귀 방지 규칙
- 미지원 XML 요소를 저장 과정에서 삭제하지 않는다.
- 원본 ZIP 내부 파일을 불필요하게 재생성하지 않는다.
- 저장 후 한컴 한/글에서 재오픈 테스트한다.
- Chrome / Edge / Safari에서 한글 IME를 테스트한다.
- 병합 셀/이미지/다중 run 문서는 별도 회귀 샘플로 유지한다.
- 대용량 문서는 향후 Web Worker로 옮긴다.

## 필수 테스트 문서
1. 텍스트 1페이지
2. 글꼴/크기/색상/굵기 다중 run
3. 가운데/오른쪽/양쪽 정렬 문단
4. 가로/세로 병합 표
5. PNG/JPG 포함 문서
6. 가로 용지 문서
7. 20페이지 이상 문서
8. 도형/차트가 있으나 텍스트만 수정하는 문서

테스트 순서:

```text
Original Open
→ Web Render 비교
→ Text Edit
→ HWPX Save
→ Hancom Re-open
→ XML Diff
```

## 누적 히스토리

### v0.1.0
- 프로젝트 최초 생성
- HWPX ZIP 로드
- section XML 파싱
- 문단/표 셀 텍스트 편집
- 원본 패키지 재저장
- Undo/Redo/Zoom

### v0.2.0
- header.xml 서식 파서
- charPr/paraPr 렌더링
- pagePr 페이지 크기/여백
- cellSpan 병합 표
- content.hpf/BinData 이미지
- PDF/인쇄
- GitHub Pages 자동 배포 구성


---

## v0.3.0 - General HWP Support
기준일: 2026-10-03

### 방향 변경
기존 계획에서는 HWP Import를 v0.4 이후로 두었지만 실제 사용 목적상 일반 `.hwp` 지원이 핵심이므로 우선순위를 앞으로 이동했다.

### 엔진
- `@rhwp/core 0.8.6`
- Rust + WASM
- MIT License
- HWP 5.0 OLE Compound parser
- SVG renderer
- HwpDocument edit / export API

### 배포 구조 변경
v0.2까지는 순수 정적 파일이었으나 v0.3부터 Vite 빌드를 사용한다.

```text
GitHub main
  ↓
npm install
  ↓
@rhwp/core/rhwp_bg.wasm → public/rhwp_bg.wasm
  ↓
Vite build
  ↓
dist/
  ↓
GitHub Pages
```

### HWP 열기
`js/hwp.js`가 담당한다.

- WASM 초기화
- Canvas.measureText 기반 `measureTextWidth` bridge 등록
- `new HwpDocument(Uint8Array)`
- `pageCount()`
- `renderPageSvg(page)`
- `hitTest(page,x,y)`

### HWP 텍스트 편집 v1
현재는 완전한 캐럿 에디터 대신 안정적인 target-based editor를 사용한다.

```text
HWP 페이지 더블클릭
  ↓
hitTest()
  ↓
본문 문단 / 표 셀 context 확인
  ↓
getParagraphLength + getTextRange
또는
getCellParagraphLength + getTextInCell
  ↓
팝업 textarea 편집
  ↓
deleteText + insertText
또는
deleteTextInCell + insertTextInCell
  ↓
페이지 재렌더링
  ↓
exportHwp()
```

중첩 셀에서 `cellPath`가 제공되면 ByPath API를 우선 사용한다.

### v0.3 한계
- SVG 위에서 바로 커서를 놓고 타이핑하는 WYSIWYG 캐럿 입력은 아직 미구현.
- HWP Undo/Redo는 아직 비활성. HWPX Undo/Redo는 기존 기능 유지.
- 텍스트 팝업 편집은 한 문단 단위다.
- 머리말/꼬리말/각주 직접 편집 UI는 아직 없음.
- 일부 특수 HWP 컨트롤은 hit-test 편집 대상에서 제외될 수 있음.

### 다음 우선순위: v0.3.1
1. 실제 HWP 샘플 회귀 테스트
2. HWP 표 셀 hitTest 보강
3. HWP Undo/Redo snapshot
4. 클릭 위치 캐럿 표시
5. 본문 직접 타이핑 + 한글 IME
6. 표 셀 직접 타이핑
7. HWP/HWPX 공통 서식 툴바

### 안정성 원칙
- 사용자 HWP 파일을 공개 저장소 테스트 fixture로 업로드하지 않는다.
- 외부 iframe 에디터에 문서 bytes를 넘기지 않는다.
- HWP 엔진과 WASM은 앱 자체 배포 artifact에 포함한다.
- 저장 전 원본 파일명과 편집 상태를 UI에 명시한다.


---

## v0.4.0 - Direct WYSIWYG Editing
기준일: 2026-10-03

### 사용자 피드백
v0.3의 HWP 렌더링은 정상이나, 셀 편집이 더블클릭 후 별도 팝업 textarea 방식이라 실제 워드프로세서 사용감과 거리가 있었다.

요구된 방향:
- 셀/문단을 화면에서 바로 편집
- 폰트
- 글자 크기
- 문단 서식
- 표 행/열 추가·삭제
- 셀 병합/나누기
- 다양한 HWP 편집 기능

### v0.4 결정
별도 팝업 편집 레이어를 확장하지 않는다.

rhwp 프로젝트의 완성형 `rhwp-studio 0.8.6`를 **같은 GitHub Pages 배포물 안에 self-host**하고 `@rhwp/editor 0.8.6` 브리지로 통합한다.

### 아키텍처

```text
index.html / js/app.js
        │
        │ @rhwp/editor MessageChannel
        ▼
/studio/ (same origin)
        │
        ├─ rhwp-studio UI
        ├─ keyboard / Korean IME
        ├─ selection / caret
        ├─ format toolbar
        ├─ table editing
        └─ rhwp WASM
```

### 이 방식의 이유
1. SVG 위에 임의 HTML textarea를 덧씌우는 방식은 selection/caret/IME/표/서식 동기화가 장기적으로 불안정하다.
2. rhwp-studio에는 이미 같은 WASM Document IR을 사용하는 실제 편집 엔진이 구현돼 있다.
3. 표 행/열 삽입·삭제, 셀 병합·분할, 글자/문단 서식 API를 다시 중복 구현할 필요가 없다.
4. 외부 공개 rhwp 페이지에 문서 bytes를 넘기지 않고 self-host 가능하다.

### 배포
Actions에서 upstream을 `v0.8.6` tag로 고정한다.

- wasm-pack 0.15.0 고정
- `wasm32-unknown-unknown` target
- `wasm-pack build --target web --out-dir pkg --release --locked`
- rhwp-studio TypeScript + Vite build
- `--base=/Web-HWP-Editor/studio/`
- external webfont 비활성
- 결과를 `dist/studio/`에 복사

### v0.4에서 사용자에게 보이는 변화
- HWP 편집 팝업 삭제
- 문서 안에서 직접 캐럿 이동/입력
- Studio 메뉴/툴바 사용
- 글꼴/사이즈/글자 서식
- 표 구조 편집
- Undo/Redo
- HWP/HWPX 모두 같은 고급 편집 코어 사용

### 회귀 기준
- 기존 실제 이력서 HWP가 열려야 한다.
- 페이지 레이아웃이 v0.3 수준 이상 유지되어야 한다.
- 표 셀 클릭 후 바로 입력 가능해야 한다.
- 한글 IME 조합이 팝업 없이 동작해야 한다.
- 저장한 HWP가 다시 열려야 한다.
- 표 행/열 조작 후 저장 round-trip을 확인한다.

### 다음 패치 후보
- Web HWP Editor 전용 리본 UI로 Studio 기본 UI 재스킨
- 사용자 지정 툴바 프리셋
- 표 편집 우클릭 메뉴 간소화
- 모바일 터치 selection 최적화
- 자동저장/로컬 복구 UX


---

## v0.4.1 - Direct Editor Visibility Hotfix
기준일: 2026-10-03

### 증상
- 일반 HWP 파일 파싱 성공
- 상단 메타데이터에 2페이지 등 페이지 수 정상 표시
- 그러나 본문에는 초기 "HWP 또는 HWPX 파일을 여기에 놓으세요" 화면이 계속 남음
- 실제 self-hosted Studio iframe이 아래에 존재하지만 초기 안내 레이어가 workspace 전체 높이를 차지해 가려짐

### 원인
`.empty-state`에 `display:flex`를 직접 지정하면서 HTML `hidden` 속성에만 의존했다.
브라우저/CSS 적용 조건에서 author stylesheet의 display 규칙이 hidden 표시 상태와 충돌할 수 있었고,
결과적으로 문서 로드는 완료됐지만 초기 안내 레이어가 사라지지 않았다.

### 수정
- 전역 `[hidden]{display:none!important}` 추가
- `.empty-state[hidden]`, `.editor-viewport[hidden]` 보강
- JS에서 `hidden`과 `style.display`를 동시에 설정
- HWP/HWPX loadFile 성공 직후 편집 화면 visibility를 다시 확정
- load 실패 시 초기 화면 복원도 display 상태까지 명시

### 회귀 체크
1. HWP 열기
2. 상단 페이지 수 표시
3. 초기 드롭 화면 즉시 제거
4. self-hosted Studio 메뉴/툴바/문서 페이지 표시
5. 셀 클릭 및 직접 입력
6. 저장
