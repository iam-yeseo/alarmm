# Alarmm

퇴근까지 남은 시간, 출퇴근 기록, 연차·월차 잔여와 휴가 일정을 보여주는 모바일 우선 웹 앱입니다. Home, Settings, Vacation은 Figma의 `YESEO.IM` 디자인을 기준으로 구현했으며 데스크톱에서는 440px 앱 캔버스로 표시됩니다.

## 실행

별도 설치 없이 정적 서버에서 열면 됩니다.

```bash
python3 -m http.server 4173
```

그다음 `http://localhost:4173`에 접속하세요.

## 구성

- `index.html`: 실시간 시계, 오늘 현황, 퇴근길 버스, 점심 메뉴
- `calendar.html`: 월간 출근 달력, 누적 근무시간과 월별 기록
- `vacation.html`: 날짜 범위형 연차·월차, 반차·반반차·비차감 휴가 신청 내역
- `settings.html`: 입사일, 근무·점심 시간과 휴가 정책 설정
- `styles.css`, `styles-v2.css`: Figma 기반 반응형 440px 모바일 캔버스와 화면별 스타일
- `app.js`: 시간 계산, 설정 저장, 근무기록과 휴가 신청 로직
- `motion.js`: Anime.js v4 기반 진입, 스크롤, 버튼, 세그먼트, 패널 모션
- `vacation-core.js`: 입사일 기준 휴가 발생·소멸·차감 계산
- `assets/figma/`: 현재 Figma 파일에서 내려받은 원본 SVG 리소스

설정, 근무기록과 휴가 신청은 브라우저 `localStorage`에 저장됩니다. 생일을 설정하면 해당 날짜의 오후 반차 일정이 자동 반영됩니다.

## 검사

```bash
node --check app.js
node tests/vacation-core.test.js
```
