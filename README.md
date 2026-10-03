# Web HWP Editor v0.5.4

브라우저에서 HWP/HWPX를 열고 직접 편집·저장하는 웹 편집기입니다. 문서 데이터는 서버에 업로드하지 않습니다.

## v0.5.4 핵심 개선
- 새 문서 초기화 안정화 및 실패/재시도 처리
- 저장하지 않은 문서 교체 보호
- 상대 경로 기반 GitHub Pages 배포
- 표 전체 선택, 셀 높이/너비 균등화 개선
- 병합/나누기 잘못된 선택 차단 및 오류 안내
- 저장 중 중복 실행 방지, Ctrl+S 통합
- HWP/HWPX 저장 및 인쇄 명령 연결
- 표 계산 단위 테스트 및 브라우저 회귀 테스트 구조 추가

## 배포
GitHub **Settings → Pages → Deploy from a branch → main / docs** 를 사용합니다.
별도 GitHub Actions 빌드는 필요하지 않습니다.

## 개발
```sh
npm start
npm run build
npm test
```

자세한 내용은 `DEPLOY.md`, `TEST_REPORT.md`, `DEVELOPMENT_HANDOFF.md`를 참고하세요.
