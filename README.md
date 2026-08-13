# Alarmm

퇴근까지 남은 시간과 오늘의 근무 진행률을 보여주는 모바일 우선 웹 앱입니다.

## 실행

별도 설치 없이 정적 서버에서 열면 됩니다.

```bash
python3 -m http.server 4173
```

그다음 `http://localhost:4173`에 접속하세요.

## 구성

- `index.html`: 실시간 시계, 퇴근 카운트다운, 진행률, 근무기록
- `settings.html`: 근무 시작/종료, 점심시간, 야근 설정
- `styles.css`: Figma 기반 440px 모바일 캔버스 스타일
- `app.js`: 시간 계산, 설정 저장, 근무기록 로직
- `assets/`: Figma에서 내려받은 원본 SVG 리소스

설정과 근무기록은 브라우저 `localStorage`에 저장됩니다.
