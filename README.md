# Alarmm

퇴근까지 남은 시간, 출퇴근 기록, 연차·월차 잔여와 휴가 일정을 보여주는 모바일 우선 웹 앱입니다. Home, Settings, Vacation은 Figma의 `YESEO.IM` 디자인을 기준으로 구현했으며 데스크톱에서는 440px 앱 캔버스로 표시됩니다.

## 실행

의존성을 설치한 뒤 Cloudflare Worker 로컬 서버를 실행합니다.

```bash
npm install
npm run dev
```

그다음 터미널에 표시되는 로컬 주소에 접속하세요.

## 구성

- `public/index.html`: 실시간 시계·진행 게이지, 오늘 현황, 출퇴근길 실시간 버스, 점심 메뉴
- `public/calendar.html`: 월간 출근 달력, 누적 근무시간과 월별 기록
- `public/vacation.html`: 날짜·시간 범위형 연차, 반차·반반차·시간차·비차감 휴가 신청 내역
- `public/settings.html`: 입사일, 근무·점심 시간과 휴가 정책 설정
- `public/styles.css`, `public/styles-v2.css`: Figma 기반 반응형 440px 모바일 캔버스와 화면별 스타일
- `public/app.js`: 시간 계산, 설정 저장, 근무기록과 휴가 신청 로직
- `public/motion.js`: Anime.js v4 기반 진입, 스크롤, 버튼, 세그먼트, 패널 모션
- `public/vacation-core.js`: 입사일 기준 휴가 발생·소멸·차감 계산
- `worker/index.mjs`: Cloudflare Worker 정적 자산·API 라우팅 진입점
- `worker/bus-arrivals.mjs`: 서울시 버스 API 프록시
- `bus-api-core.mjs`: 정류소 설정 검증과 서울시 버스 XML 응답 변환
- `public/assets/figma/`: 현재 Figma 파일에서 내려받은 원본 SVG 리소스

설정, 근무기록과 휴가 신청은 브라우저 `localStorage`에 저장됩니다. 생일을 설정하면 해당 날짜의 오후 반차 일정이 자동 반영됩니다.

## 실시간 버스 API

Cloudflare Worker 프로젝트의 **Settings → Variables and Secrets**에서 아래 암호화 변수를 등록하세요.

- `SEOUL_BUS_API_KEY` (필수): 공공데이터포털의 `서울특별시_버스도착정보조회 서비스` 활용신청을 완료한 일반 인증키(Encoding 또는 Decoding)
- `BUS_COMMUTE_STOPS_JSON` (선택): 출근길 정류소·노선 재정의
- `BUS_HOME_STOPS_JSON` (선택): 퇴근길 정류소·노선 재정의

정류소 변수는 다음 형태의 JSON 배열입니다. 최대 5개 정류소, 정류소별 최대 10개 노선을 조회합니다.

```json
[
  {
    "arsId": "04540",
    "direction": "성수SKV1센터1동 방면",
    "routes": ["성동10"]
  }
]
```

기본값은 Figma에 표시된 출근길 `04540 / 성동10`, 퇴근길 `04210 / 302·2012·2222`입니다. 브라우저는 `/api/bus-arrivals`만 호출하므로 API 키가 클라이언트 코드에 노출되지 않습니다. API는 30초마다 다시 동기화하고, 화면의 분·초 카운트다운은 매초 갱신합니다.

API가 `인증모듈 에러코드(20)`을 반환하면 변수 이름뿐 아니라 공공데이터포털의 해당 서비스 활용 상태가 `승인`인지 확인해야 합니다. 다른 공공데이터 서비스의 인증키는 같은 계정에서 발급했더라도 이 API에 사용할 수 없습니다.

Workers Builds의 기본 배포 명령을 그대로 사용할 수 있습니다.

```bash
npx wrangler deploy
```

## 검사

```bash
npm test
```
