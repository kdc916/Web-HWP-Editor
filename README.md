# Web HWP Editor

설치 없이 브라우저에서 HWPX 문서를 열고 수정하는 **Local-first 웹 편집기**입니다.

> 문서 파일 자체는 서버로 업로드하지 않고 사용자의 브라우저 메모리에서 처리합니다.

## Live

GitHub Pages 배포 주소:

**https://kdc916.github.io/Web-HWP-Editor/**

## 현재 안정 기준

**v0.2.0 – Rendering Fidelity**

### v0.2.0 구현
- HWPX 파일 선택 / Drag & Drop
- `Contents/header.xml` 서식 테이블 파싱
- `charPr` 기반 글자 크기 / 색상 / 굵게 / 기울임 / 밑줄 / 취소선 / 글꼴 / 자간 표시
- `paraPr` 기반 문단 정렬 / 줄 간격 / 여백 / 들여쓰기 표시
- `secPr/pagePr` 기반 실제 페이지 크기 및 여백 반영
- `cellSpan` 기반 표 `rowspan` / `colspan` 표시
- `content.hpf` manifest → `BinData` 이미지 연결 및 브라우저 렌더링
- 텍스트 및 표 셀 수정
- 원본 HWPX ZIP 패키지 기반 재저장
- Undo / Redo
- 확대 / 축소
- Cmd/Ctrl + S 저장
- 브라우저 PDF / 인쇄
- GitHub Pages 자동 배포 워크플로

### 이전 v0.1.0
- HWPX ZIP 로드
- `Contents/section*.xml` 탐색
- 일반 문단 / 표 셀 텍스트 편집
- 원본 리소스 보존형 저장 기반

## 현재 한계
- `.hwp` 바이너리 파일은 아직 미지원
- 여러 서식 Run이 섞인 문단은 Run 단위로 클릭해 편집하는 방식
- Enter로 새 문단 생성은 아직 미지원
- 표의 정확한 BorderFill, 셀 배경색 등은 후속 패치 대상
- 그림 위치/텍스트 감싸기/도형/차트/수식은 원본 수준 렌더링 미지원
- 페이지 자동 줄바꿈/페이지네이션은 아직 브라우저의 실제 레이아웃과 한컴 결과가 완전히 동일하지 않음
- JSZip은 CDN에서 불러오므로 앱 최초 로드에는 인터넷 연결이 필요함

## 로컬 실행
별도 빌드가 필요 없는 정적 웹 앱입니다.

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080` 접속.

## 구조

```text
index.html
styles.css
js/
  app.js
  hwpx.js
.github/
  workflows/
    pages.yml
.nojekyll
README.md
DEVELOPMENT_HANDOFF.md
```

## 설계 원칙
1. 문서 파일은 서버에 업로드하지 않는다.
2. 지원하지 않는 HWPX 요소는 저장 시 가능한 한 원본 ZIP 내부에 그대로 보존한다.
3. HWPX를 우선 편집 포맷으로 완성한 다음 `.hwp` Import를 확장한다.
4. 브라우저 화면과 한컴 출력 차이는 실제 샘플 문서를 통한 회귀 테스트로 줄인다.

자세한 개발 계획과 변경 이력은 [DEVELOPMENT_HANDOFF.md](./DEVELOPMENT_HANDOFF.md)를 참고하세요.
