# 오늘시작 심벌

오늘시작 원본 심벌에는 루트 [LICENSE](../../LICENSE)가 적용됩니다. 서체·Discord 심벌은 각 권리자의 조건을 따르며 [제3자 안내](../../THIRD_PARTY_NOTICES.md)와 동봉한 서체 고지를 확인하세요.

최종 원본은 `../icon.svg`입니다. 생성형 이미지의 캐릭터 시안은 채택하지 않았으며, 최종 심벌은 SVG로 직접 제작했습니다.

열린 틀은 모아 둔 지원 기록을, 오른쪽 위로 떨어져 나온 사각형은 다음 기회로 나아가는 한 칸을 나타냅니다. 작은 도구 모음에서도 구분되도록 단색 면과 넓은 간격을 사용했습니다. 심벌은 `#CB593B`, 아이콘 바탕은 `#FFF8EE`입니다.

조사한 공식 자료:
- [토스 브랜드 리소스 센터](https://brand.toss.im/): 심벌·로고타입·앱 아이콘과 단색 사용을 확인.
- [Linear Brand Guidelines](https://linear.app/brand): 로고 주변 여백, 작은 레이아웃에서의 심벌 사용을 확인.
- [Headspace 브랜드 개편](https://organizations.headspace.com/blog/headspace-unveils-refreshed-brand-and-expands-offerings-for-lifelong-mental-health-support): 간단한 형태와 따뜻한 색상 사용을 확인.

참고 로고 자체는 오늘시작 심벌이나 배포 파일에 사용하지 않습니다.

`node scripts/make-icon.cjs`로 앱용 PNG와 스토어용 128/512px PNG를 만듭니다. `npm run build` 후 `node scripts/store-assets.cjs`로 임시 브라우저 프로필에서 가상 기록을 넣어 스토어용 1280×800 화면을 캡처합니다. 실제 사용자 프로필이나 지원 기록은 사용하지 않습니다.

v2 스토어 이미지는 `release/store-v2`에 보존합니다. `node scripts/store-assets.cjs --retina`로 앱 화면을 2배 해상도로 저장하고, `node scripts/capture-store-live.cjs`로 공개 잡코리아 검색에 가상의 이전 지원을 표시한 데모를 촬영합니다. `node scripts/compose-store.cjs`는 큰 제목, 기능 설명, 브라우저 목업을 합성하고 1280×800 RGB PNG로 저장합니다. 레이아웃의 범위·문구 겹침 검사와 시각 검토를 함께 수행했습니다. 글꼴은 Pretendard와 Bricolage Grotesque를 사용하며 모두 SIL Open Font License로 배포됩니다.

v3에서 배경과 타이포그래피를 다시 제작했습니다. 당시 업로드 자료는 `release/store-v3`이며 `node scripts/compose-store-v3.cjs`로 만듭니다. 바탕은 흰색과 밝은 무채색 회색, 글꼴은 SUIT입니다. 참고한 공식 소개 이미지와 선택한 구성 원칙은 `docs/store-art-direction-v3.md`에 기록했습니다. 기존 v2는 이전 시안으로 보존합니다.

이전 목업 v2는 0.6.20 기준으로 `release/mockup-v2-0.6.20`에 별도 보관합니다. `node scripts/capture-mockup-v2.cjs`로 임시 프로필에서 UI를 캡처하고 `node scripts/compose-mockup-v2.cjs`로 5장의 업로드용·고해상도 이미지를 합성합니다. 한글은 Pretendard, 작은 순서 표시는 Geist Mono를 사용합니다. Geist Mono 원본과 SIL Open Font License는 canvas-design 스킬의 canvas-fonts 배포본에서 가져왔으며 `GeistMono-Regular.ttf`와 `GeistMono-OFL.txt`로 보관합니다. 실제 지원을 수행하거나 사용자 프로필에 접근하지 않습니다.

최신 한국어 기능 소개 시안은 `release/mockup-korean-0.6.20`이며 `node scripts/compose-mockup-korean.cjs`로 만듭니다. 사용자가 제공한 참고 이미지의 큰 이점 문구·기능별 UI 확대·카드 형태 요약을 해석해 새로 구성했습니다. UI는 기능을 이해하기 위한 재구성이며, 실제 픽셀 캡처와 구분해 이미지 하단에 표시합니다. 서체는 Pretendard이며 자동 입력·AI·추천 등 제공하지 않는 기능이나 성과 수치는 넣지 않았습니다.

0.6.13 앱 UI 서체: `PretendardVariable.woff2`를 로컬 번들로 사용합니다. 히어로 제목과 설명은 기존 시스템 서체를 유지합니다. 원본은 https://github.com/orioncactus/pretendard 의 배포본이며, `Pretendard-OFL.txt`를 빌드/설치 ZIP에 동봉합니다.
