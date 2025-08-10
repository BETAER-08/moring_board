# RoutineBus (모닝 대시보드)

아침 한 화면에서 **날씨 · 오늘 일정 · 자주 타는 버스 도착**을 확인하는 Expo(React Native) 앱.

## 주요 변경점
- 정류장에 실시간이 없어도 경유 노선은 항상 표시
- 공공데이터 API 호출 타임아웃 8초, 재시도, 실패 시 마지막 캐시 사용
- API 키를 `.env`로 이동

## 설치
```bash
npm i
npm i @react-native-async-storage/async-storage react-native-paper
```

## 환경변수
루트에 `.env` 파일 생성:
```
EXPO_PUBLIC_BUS_KEY=<국토교통부 버스 API 키>
EXPO_PUBLIC_WEATHER_KEY=<기상청 단기예보 API 키>
```

## 실행
```bash
npm run start
```
