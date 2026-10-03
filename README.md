# Web HWP Editor

브라우저에서 HWPX 문서를 열고 간단히 수정할 수 있는 **Local-first 웹 편집기**입니다.

## 현재 버전
**v0.1.0 MVP**

### 구현
- HWPX 파일 선택 / Drag & Drop
- 브라우저 내부에서 ZIP 패키지 분석
- `Contents/section*.xml` 탐색
- 일반 문단 텍스트 편집
- 표 셀 텍스트 편집
- 원본 HWPX 패키지의 나머지 리소스를 유지한 상태로 다시 저장
- Undo / Redo
- 확대 / 축소
- Cmd/Ctrl + S 저장
- 서버 업로드 없는 로컬 처리

### 현재 한계
- `.hwp` 바이너리 파일은 아직 미지원
- HWPX 원본의 정확한 페이지 배치, 글꼴, 자간, 장평, 도형, 차트, 각주/미주 렌더링은 미구현
- 현재 편집 화면은 문서 구조를 단순화한 MVP 렌더러
- 복잡한 표의 병합 셀은 시각적으로 원본과 다를 수 있음
- JSZip은 CDN을 사용하므로 최초 접속 시 네트워크가 필요함

## 실행
별도 빌드 과정이 없습니다. 정적 서버에서 루트 폴더를 서비스하면 됩니다.

예:
```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080` 접속.

GitHub Pages에서도 그대로 사용할 수 있습니다.

## 설계 원칙
1. 문서는 서버에 업로드하지 않는다.
2. HWPX 패키지의 미지원 리소스는 가능한 한 손대지 않는다.
3. v0.x 단계에서는 HWPX를 주 편집 포맷으로 사용한다.
4. HWP는 향후 Import → Internal Model → HWPX 저장 순으로 확장한다.

자세한 개발 계획은 [DEVELOPMENT_HANDOFF.md](./DEVELOPMENT_HANDOFF.md)를 참고하세요.
