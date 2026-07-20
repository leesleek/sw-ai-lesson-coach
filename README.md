# SW·AI 수업 설계 코치 v4.8 — 무료 배포판

코드 수정은 완료되어 있다. 직접 해야 하는 작업은 네 가지뿐이다.

## 1. Supabase 무료 프로젝트 생성

Supabase에서 새 Free 프로젝트를 만든다.

## 2. 테이블 생성

Supabase `SQL Editor`에서 다음 파일의 내용을 실행한다.

```text
supabase/setup.sql
```

## 3. GitHub에 업로드

```powershell
git init
git add .
git commit -m "Deploy SW AI lesson design coach"
git branch -M main
git remote add origin https://github.com/본인계정/저장소.git
git push -u origin main
```

## 4. Render 무료 배포

Render에서 `New → Blueprint`를 선택하고 GitHub 저장소를 연결한다. 다음 네 환경변수만 입력한다.

```text
OPENAI_API_KEY
ADMIN_PASSWORD
SUPABASE_URL
SUPABASE_SECRET_KEY
```

`render.yaml`은 Free 플랜으로 구성되어 있으며 Persistent Disk가 없어 카드 등록이 필요하지 않다.

배포 후:

```text
https://배포주소.onrender.com/api/health
```

정상 응답에서 다음 값이 보여야 한다.

```json
{
  "ok": true,
  "progressStore": "supabase",
  "openaiConfigured": true,
  "supabaseConfigured": true
}
```
