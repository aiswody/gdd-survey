# 급똥 답사 메모

지하철 역에서 **몇 번 칸 몇 번 문으로 내리면 화장실이 제일 가까운지** 누구나 제보하는 웹사이트.
팀이 검수해서 승인한 경로만 공개돼요.

- `index.html` 제보 화면 (누구나)
- `admin.html` 검수 화면 (팀원만 로그인)
- `supabase/schema.sql` DB 테이블 + 접근 규칙 + 이미 답사한 충무로·종로3가 데이터
- 빌드 도구·라이브러리 없음. HTML/CSS/JS 파일 그대로 배포

```
index.html  index.js   제보 화면
admin.html  admin.js   검수 화면
api.js                 Supabase 호출 (fetch)
config.js              Supabase 주소와 공개 키
style.css              공통 디자인
supabase/schema.sql    DB 만들기
```

---

## 1. Supabase (DB) 만들기

1. https://supabase.com 가입 → **New project**
   - Region: **Northeast Asia (Seoul)** (한국 사용자라 가장 빠름)
   - Database Password는 따로 적어두기
2. 왼쪽 **SQL Editor** → `supabase/schema.sql` 내용을 통째로 붙여넣고 **Run**
   → 테이블 3개(stations, routes, admins)와 기존 답사 데이터 7개가 생겨요.
3. **Authentication → Sign In / Providers** 에서 **Allow new users to sign up 끄기**
   → 아무나 팀원 계정을 만들지 못하게 막아요.
4. **Authentication → Users → Add user → Create new user**
   - 본인과 친구 이메일/비밀번호로 한 명씩. **Auto Confirm User** 체크
5. 다시 **SQL Editor** 에서 두 사람을 팀원(검수 권한)으로 등록:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email in ('내이메일@example.com', '친구이메일@example.com');
   ```
6. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사해 `config.js` 에 넣기
   - anon 키는 원래 브라우저에 공개되는 키라 괜찮아요. 누가 뭘 할 수 있는지는 schema.sql의 규칙(RLS)이 정해요.
   - **service_role 키는 절대 넣지 마세요** (모든 규칙을 무시하는 관리자 키예요).

## 2. 내 컴퓨터에서 먼저 확인

```bash
python -m http.server 8000
```
왜: 파일을 더블클릭해서 열면(file://) 브라우저가 서버 요청을 막을 수 있어서, 간단한 로컬 서버로 열어요.
브라우저에서 http://localhost:8000 → 제보 화면, http://localhost:8000/admin.html → 검수 화면.

## 3. GitHub에 올리기 (Git)

Git은 코드의 변경 기록을 저장하는 도구, GitHub는 그 기록을 인터넷에 올려두는 곳이에요.
Vercel이 GitHub에 올라온 코드를 가져가서 배포해요.

1. https://github.com 가입 → 오른쪽 위 **+ → New repository**
   - 이름 예: `gdd-survey`, **Public/Private 아무거나**, README 추가는 체크하지 않기
2. 이 폴더에서 터미널을 열고 한 줄씩:

```bash
git init
```
이 폴더를 Git이 기록하는 폴더로 만들어요 (처음 한 번만).

```bash
git add .
```
현재 폴더의 모든 파일을 "이번에 저장할 목록"에 올려요.

```bash
git commit -m "답사 메모 첫 버전"
```
목록에 올린 파일들을 하나의 저장 지점(커밋)으로 기록해요. `-m` 뒤는 무엇을 바꿨는지 적는 메모예요.

```bash
git branch -M main
```
기본 줄기 이름을 `main` 으로 맞춰요 (GitHub 기본값과 같게).

```bash
git remote add origin https://github.com/내아이디/gdd-survey.git
```
이 폴더와 GitHub 저장소를 연결해요. 주소는 GitHub 저장소 화면에 나와 있어요 (처음 한 번만).

```bash
git push -u origin main
```
기록을 GitHub에 올려요. 처음엔 GitHub 로그인 창이 뜰 수 있어요.

**이후 수정할 때는** 이 세 줄만 반복하면 돼요:
```bash
git add .
```
```bash
git commit -m "무엇을 바꿨는지"
```
```bash
git push
```

## 4. Vercel로 배포

1. https://vercel.com → **Continue with GitHub** 로 가입
2. **Add New → Project** → 방금 만든 `gdd-survey` 저장소 **Import**
3. Framework Preset: **Other**, Build Command·Output Directory는 비워두기 → **Deploy**
4. `https://gdd-survey.vercel.app` 같은 주소가 생겨요. 이 주소를 친구와 사용자들에게 공유하면 끝.

이후로는 `git push` 할 때마다 Vercel이 알아서 새 버전을 배포해요.

## 5. 운영

- 팀원이 **admin.html 에서 로그인한 상태로** 제보 화면을 쓰면 "팀 모드"가 되어 검수 없이 바로 반영돼요.
- 일반 사용자 제보는 **검수 대기**로 쌓여요 → `주소/admin.html` 에서 승인·반려.
  처음 보는 역의 제보를 승인하면, 제보자가 적은 화장실 정보로 역이 자동으로 만들어져요.
- 내용 수정(오타 등)은 Supabase **Table Editor → routes** 에서 칸을 직접 고치면 돼요.
- 엑셀로 받기: 검수 화면 아래 **엑셀 파일 받기**(CSV) 또는 **표로 복사**(구글 시트 붙여넣기).
- 스팸 대비: 제보는 검수 후에만 공개, 글자 수 제한(DB 규칙), 봇용 숨은 입력칸, 같은 폰 15초 간격 제한.
  그래도 스팸이 많아지면 Cloudflare Turnstile(무료 봇 차단) 추가를 검토.
