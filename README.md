# Web HWP Editor

설치 없이 브라우저에서 **HWP 5.0 / HWPX** 문서를 열고 수정하는 Local-first 웹 편집기입니다.

> 문서 파일 자체는 서버로 업로드하지 않고 사용자의 브라우저 메모리에서 처리합니다.

## Live

**https://kdc916.github.io/Web-HWP-Editor/**

## 현재 안정 기준

**v0.3.0 – General HWP Support**

### 일반 .hwp
- HWP 5.0 OLE Compound 문서 열기
- Rust/WASM 기반 `@rhwp/core 0.8.6` 로컬 파싱
- 페이지 SVG 렌더링
- 표 / 이미지 / 도형 / 수식 등 엔진 렌더링 사용
- 페이지 이동 및 확대/축소
- 문단 또는 표 셀 더블클릭 → 텍스트 편집
- 수정 문서를 다시 `.hwp`로 저장
- 브라우저 PDF / 인쇄

### .hwpx
- 기존 v0.2 XML 편집 엔진 유지
- 글자/문단 서식 렌더링
- 표 병합 및 BinData 이미지
- 텍스트 / 표 셀 직접 편집
- HWPX 다시 저장

## HWP 편집 방법

1. `.hwp` 파일을 열거나 드래그합니다.
2. 수정할 문단 또는 표 셀을 **더블클릭**합니다.
3. 팝업에서 텍스트를 수정하고 **적용**합니다.
4. 상단의 **HWP 저장**을 누릅니다.

v0.3은 정확한 캐럿 기반 WYSIWYG 편집 전 단계입니다. 문단/표 셀의 텍스트를 한 단위로 수정하며 원래 서식과 표 구조는 엔진에서 유지합니다.

## 기술 구조

- Vite 8
- `@rhwp/core 0.8.6` — HWP/HWPX Rust + WebAssembly parser/renderer
- `jszip 3.10.1` — 기존 HWPX XML 편집 경로
- GitHub Actions → GitHub Pages 자동 배포

## 로컬 실행

```bash
npm install
mkdir -p public
cp node_modules/@rhwp/core/rhwp_bg.wasm public/rhwp_bg.wasm
npm run dev
```

## 개인정보 / 로컬 처리

- HWP 엔진과 WASM 파일은 Web HWP Editor 사이트에서 직접 로드됩니다.
- 사용자가 선택한 HWP/HWPX 파일은 앱 서버에 업로드하지 않습니다.
- HWP 편집에 외부 iframe 서비스를 사용하지 않습니다.

## 오픈소스 고지

HWP 5.0 지원에는 MIT 라이선스의 `@rhwp/core` 프로젝트를 사용합니다.
관련 라이선스 및 제3자 라이선스는 해당 프로젝트의 고지를 따릅니다.

자세한 개발 계획과 변경 이력은 [DEVELOPMENT_HANDOFF.md](./DEVELOPMENT_HANDOFF.md)를 참고하세요.
