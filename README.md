# 지하철 화장실 답사

지하철역에서 **몇 번 칸 몇 번 문으로 내리면 화장실이 가장 가까운지** 제보받는 웹사이트.
누구나 가입 없이 제보할 수 있고, 팀이 검수해서 승인한 경로만 공개됩니다.

- 사이트: https://gdd-survey.vercel.app
- 검수: https://gdd-survey.vercel.app/admin.html (팀원만)

## 구성

```
index.html  index.js   제보 화면
admin.html  admin.js   검수 화면 (승인·반려·삭제, CSV 내보내기)
api.js                 Supabase REST 호출 (fetch, 라이브러리 없음)
config.js              Supabase 주소와 Publishable key
style.css              공통 스타일
supabase/schema.sql    테이블, 권한, RLS 규칙, 초기 데이터
```

- 프론트: 빌드 없는 HTML/CSS/JS
- DB: Supabase (Postgres + RLS)
- 배포: Vercel (`main`에 push하면 자동 배포)

## 데이터

| 테이블 | 내용 |
|---|---|
| `stations` | 역 정보: 호선, 역명, 화장실 개수, 대변기 칸 수, 개찰구 안/밖, 양옆 역 |
| `routes` | 하차 경로: 방향, 하차 칸-문, 맞은편 문, 동선 단계(JSON), 소요 시간, 비고, 상태(pending/approved/rejected) |
| `admins` | 검수 권한이 있는 팀원 |

권한: 일반 사용자는 승인된 데이터 읽기와 `pending` 제보만 가능. 승인·수정·삭제는 `admins`만.

## 공공데이터 (`data/`)

역 선택, 양옆 역 자동 입력, 호선별 칸 수, 화장실 정보 미리 채우기에 사용.

| 파일 | 출처 |
|---|---|
| `raw/역간거리_*.csv` | [서울교통공사 역간거리 및 소요시간](https://data.seoul.go.kr/dataList/OA-12034/S/1/datasetView.do) (1~8호선 역 순서) |
| `raw/화장실_*_1-8호선_*.csv` | [서울교통공사 역사공중화장실정보](https://www.data.go.kr/data/15044453/fileData.do) |
| `raw/화장실_*_9호선2-3단계_*.csv` | [서울교통공사 9호선2·3단계 역사공중화장실정보](https://www.data.go.kr/data/15120811/fileData.do) |

9호선 역 순서와 칸 수는 `tools/build_data.py`에 직접 적어둠. CSV를 새로 받으면 `data/raw`에 넣고:

```bash
python tools/build_data.py
```
→ `data/subway.json` 갱신. 출처: 서울교통공사, 공공누리 1유형.

## 로컬 실행

```bash
python -m http.server 8000
```
http://localhost:8000 에서 확인.

## 팀원 추가

1. Supabase → Authentication → Users → Add user (Auto Confirm 체크)
2. SQL Editor에서:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = '팀원이메일';
   ```

## 주의

- `config.js`의 Publishable key는 공개용이라 커밋해도 됩니다.
- Secret key, DB 비밀번호는 절대 커밋하지 않습니다.
