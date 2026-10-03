# Web HWP Editor

브라우저에서 **HWP / HWPX를 문서 화면 그대로 직접 편집**하는 웹 에디터입니다.

## Live

**https://kdc916.github.io/Web-HWP-Editor/**

## 현재 안정 기준

**v0.4.2 – Quick Ribbon & Editor State**

self-hosted `rhwp-studio 0.8.6`의 편집 코어는 유지하면서, Web HWP Editor 바깥 UI에 자주 쓰는 기능을 바로 실행할 수 있는 Quick Ribbon을 추가했습니다.

### Quick Ribbon
- Undo / Redo
- 굵게 / 기울임 / 밑줄
- 글자 크기 증가 / 감소
- 글자 모양
- 왼쪽 / 가운데 / 오른쪽 / 양쪽 정렬
- 줄간격 100~200%
- 문단 모양
- 줄/칸 추가 / 삭제
- 셀 합치기 / 나누기
- 셀 너비 / 높이 같게
- 표/셀 속성
- 폭 맞춤 / 쪽 맞춤
- Studio 기본 메뉴/도구 표시 토글

### 상태 표시
- 현재 페이지 / 전체 페이지
- 저장됨 / 저장 안 됨
- 문서 변경 상태 실시간 반영
- 저장하지 않은 상태에서 브라우저 종료 시 경고
- 표 선택 상태에 따라 표 버튼 자동 활성/비활성화

### 직접 편집
- 문서 화면 직접 클릭 / 캐럿 이동
- 한글 IME 직접 입력
- 텍스트 선택 / 삭제 / 복사 / 붙여넣기
- HWP / HWPX 저장

## 구조

```text
Web HWP Editor shell
  ├─ Quick Ribbon
  └─ @rhwp/editor MessageChannel
       └─ same-origin /studio/
            └─ rhwp-studio 0.8.6 + @rhwp/core 0.8.6 WASM
```

외부 편집 사이트를 호출하지 않으며 사용자 문서는 서버 업로드 API로 전송하지 않습니다.

자세한 개발 계획과 누적 변경 이력은 [DEVELOPMENT_HANDOFF.md](./DEVELOPMENT_HANDOFF.md)를 참고하세요.
