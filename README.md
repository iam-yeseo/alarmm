# Alarmm

퇴근까지 남은 시간, 출퇴근 기록, 연차·월차 잔여와 휴가 일정을 보여주는 모바일 우선 웹 앱입니다.

## 실행

별도 설치 없이 정적 서버에서 열면 됩니다.

```bash
python3 -m http.server 4173
```

그다음 `http://localhost:4173`에 접속하세요.

## 구성

- `index.html`: 실시간 시계, 퇴근 카운트다운, 진행률, 근무기록
- `vacation.html`: 연차·월차 잔여, 반차·반반차·비차감 휴가 신청 내역
- `settings.html`: 근무 시작/종료, 점심시간, 야근, 입사일과 당겨쓰기 설정
- `styles.css`: Figma 기반 440px 모바일 캔버스 스타일
- `app.js`: 시간 계산, 설정 저장, 근무기록과 휴가 신청 로직
- `vacation-core.js`: 입사일 기준 휴가 발생·소멸·차감 계산
- `assets/`: Figma에서 내려받은 원본 SVG 리소스

설정, 근무기록과 휴가 신청은 브라우저 `localStorage`에 저장됩니다.

## 검사

```bash
node --check app.js
node tests/vacation-core.test.js
```
