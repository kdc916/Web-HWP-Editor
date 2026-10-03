# Web HWP Editor

브라우저에서 **HWP / HWPX를 문서 화면 그대로 직접 편집**하는 웹 에디터입니다.

## Live

**https://kdc916.github.io/Web-HWP-Editor/**

## 현재 안정 기준

**v0.4.1 – Direct WYSIWYG Editing Hotfix**

v0.3의 “더블클릭 → 팝업 textarea” 편집을 제거하고, self-hosted `rhwp-studio 0.8.6` 편집 UI를 Web HWP Editor 내부에 통합했습니다.

### 지원 편집
- 문서 화면 직접 클릭 / 캐럿 이동
- 한글 IME 직접 입력
- 텍스트 선택 / 삭제 / 복사 / 붙여넣기
- Undo / Redo
- 글꼴 / 글자 크기
- 굵게 / 기울임 / 밑줄 / 취소선 / 글자색
- 문단 정렬 및 문단 서식
- 표 행 추가 / 삭제
- 표 열 추가 / 삭제
- 셀 병합 / 셀 나누기
- 표 / 셀 속성 편집
- HWP 저장
- HWPX 저장

## 구조

```text
Web HWP Editor
  └─ same-origin iframe
      └─ self-hosted rhwp-studio v0.8.6
          └─ rhwp WASM v0.8.6
```

외부 편집 사이트를 iframe으로 호출하지 않습니다. GitHub Actions가 rhwp v0.8.6 소스를 고정 버전으로 빌드하고 Web HWP Editor의 `/studio/` 아래에 같이 배포합니다.

## 개인정보

사용자가 연 HWP/HWPX 파일은 Web HWP Editor 서버에 업로드하지 않습니다. 브라우저에서 같은 origin으로 배포된 Studio/WASM 메모리 안에서 처리합니다.

## 배포

main push 시 GitHub Actions가:
1. Web HWP Editor shell 빌드
2. rhwp v0.8.6 checkout
3. WASM 빌드
4. rhwp-studio 빌드
5. `dist/studio/`에 self-host
6. Source ZIP 생성
7. GitHub Pages 배포

자세한 내용은 [DEVELOPMENT_HANDOFF.md](./DEVELOPMENT_HANDOFF.md)를 참고하세요.


## v0.4.1 Hotfix
- HWP 로드 후 페이지 수는 정상 인식되지만 초기 파일 드롭 안내 화면이 편집기 위에 남아 있던 UI 레이어 버그 수정
- `hidden` 상태를 CSS와 JS 양쪽에서 강제해 실제 Studio 편집 화면이 즉시 노출되도록 보강
- 문서 로드 완료 시 Studio host visibility를 다시 확정
