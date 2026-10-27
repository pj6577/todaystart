# 이미지·릴리즈 자료 분류

2026-10-27, 0.9.3 기준. 설치 ZIP은 `build/chrome-mv3-prod`의 실행 파일과 빌드가 참조하는 자산만 패키징한다. 기존 문서의 이미지 링크와 과거 버전 자료를 보존하기 위해 원본 파일의 경로를 일괄 이동하지 않는다.

| 구분 | 위치 | 용도 | 설치 ZIP |
| --- | --- | --- | --- |
| 현재 앱 아이콘 | `assets/icon.png`, 빌드에서 생성한 크기별 아이콘 | 확장 프로그램·앱 화면 아이콘 | 포함 |
| 현재 UI 자산 | `assets/branding/PretendardVariable.woff2`, `discord-mark-white.svg`, `assets/dashboard/encouragement-plane.png` | 글꼴·커뮤니티 버튼·응원 배너 | 포함 |
| 현재 플랫폼 로고 | `assets/platforms`에서 앱이 참조하는 SVG·PNG | 지원 경로 표시와 대시보드 브랜드 목록 | 참조한 파일만 포함 |
| 라이선스 | `assets/branding/Pretendard-OFL.txt` | 포함된 폰트의 배포 조건 | 포함 |
| 제작 원본·홍보용 서체 | `assets/dashboard/encouragement-plane-source.png`, `assets/icon.svg`, Bricolage·Geist·SUIT 서체 및 출처 문서 | 이미지 재제작·스토어 디자인 | 제외 |
| 기능 검증 캡처 | `docs/screenshots`, `docs/warning-route-verification` | 버전별 동작 확인과 기록 | 제외 |
| 과거 스토어 디자인·참고 자료 | `docs/store-source`, `docs/store-references`, `release/store-*`, `release/todaystart-store-*` | 이전 디자인·스토어 등록 이미지 | 제외 |
| 버전이 명시된 홍보 이미지 | `release/promo-screenshots-0.9.2`, 관련 홍보 ZIP·목업 폴더 | 0.9.2 시점의 홍보 자료. 새 버전의 캡처로 간주하지 않음 | 제외 |
| 과거 설치 파일 | `release/todaystart-0.9.2.zip` 및 이전 버전 ZIP | 버전별 보관 | 새 ZIP에 중첩하지 않음 |
| 작업 중간 산출물 | `output`, `.tmp`, `test-results` | 생성 이미지·임시 캡처·검사 결과·외부 도구 복사본 | 제외 |

플랫폼 로고의 출처는 `assets/platforms/README.md`, 브랜드·서체의 출처는 `assets/branding/README.md`에 기록되어 있다. 장식용 브랜드 목록이 자동 수집 지원 사이트를 의미하지는 않는다.

최신 로컬 설치 파일은 `release/todaystart-0.9.3.zip`이다. 비공개 Git 저장소에는 소스·검사와 선별한 문서를 올리고 설치 ZIP은 제외한다. 원격 릴리즈 에셋 게시와 공개 저장소 전환은 별도 작업이다.

## Git에 포함하는 문서 이미지

README와 현재 검증 자료에 필요한 대표 이미지만 `docs/images`에 복사하고 촬영 버전·출처를 함께 기록한다. `docs/screenshots` 등 대량 과거 캡처와 스토어·목업 자료는 로컬 경로를 보존하면서 Git에서 제외한다. `output`, `.tmp`, 빌드와 버전별 배포 ZIP도 제외한다.
