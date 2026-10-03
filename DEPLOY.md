# GitHub에 올리는 방법

1. 저장소의 소스와 `docs` 폴더를 함께 업데이트합니다.
2. **Settings → Pages**에서 다음처럼 설정합니다.
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/docs**
3. Save 후 Pages 주소에서 화면 아래 버전이 **v0.5.5**인지 확인합니다.
4. 이전 화면이면 `Ctrl+Shift+R` 또는 `Ctrl+F5`로 강력 새로고침합니다.

v0.5.5부터 최상위 `index.html`은 `docs/`로 이동하는 안내 페이지입니다. 실제 편집기 화면 소스는 `app.html`, 배포 화면은 `docs/index.html`입니다.

## 로컬 실행

Node.js 20 이상 환경에서:

```sh
npm start
npm test
npm run build
```

`index.html`을 file:// 방식으로 직접 여는 것은 ES Module/WASM 보안 정책 때문에 권장하지 않습니다.

## 표 사용

- 표 전체 선택 → 셀 높이/너비 같게
- 일부 셀은 F5 두 번 + 방향키로 범위 선택 후 합치기/나누기
- 높이는 내용이 잘리지 않도록 필요한 최대 높이를 반영
- 너비는 선택 열의 전체 폭을 유지하며 정수 HWPUNIT로 분배
- 중첩 표의 구조 변경은 안전을 위해 차단
