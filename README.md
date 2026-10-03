# Web HWP Editor

브라우저에서 HWP / HWPX를 직접 작성·열기·편집·저장하는 Local-first 웹 에디터입니다.

## Live

https://kdc916.github.io/Web-HWP-Editor/

## 배포 구조

GitHub Pages는 **Actions 자동 배포가 아니라 `main / docs` 정적 배포**를 사용합니다.

- 소스 코드: repository root
- 실제 배포본: `/docs`
- 일반 커밋 시 Actions 실행 없음
- 검증된 빌드 결과만 `docs/`로 교체
- Pages는 `main` 브랜치의 `/docs`를 그대로 서비스

### GitHub Pages 설정

Repository → **Settings → Pages**

- Build and deployment: **Deploy from a branch**
- Branch: **main**
- Folder: **/docs**
- Save

## 현재 배포본

현재 `docs/`에는 마지막으로 정상 검증된 **stable-static-v0.5.0** 배포본이 들어 있습니다.

v0.5.1 표 무결성 수정은 개발 소스에 남겨두고, 회귀 검증 후 정적 배포본으로 교체합니다.

## 왜 Actions 자동 배포를 제거했나

기존 구성은 매 커밋마다 아래 작업을 모두 실행했습니다.

- npm / Vite build
- rhwp upstream fetch
- Rust compile
- WASM build
- table regression tests
- Studio build
- GitHub Pages deploy

이 구조는 개발 중 작은 수정에도 전체 빌드를 반복하고, upstream fixture나 Rust 환경 문제로 배포가 자주 막혔습니다.

이제는 **개발/테스트와 실제 웹 배포를 분리**합니다. Pages는 단순 정적 호스팅만 담당합니다.
