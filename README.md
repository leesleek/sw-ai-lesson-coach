# SW·AI 수업 설계 코치 v5.1 — WebSocket 수정판

## 수정 내용

Render의 Node.js 20 환경에서 Supabase 클라이언트가 초기화될 때 발생한 오류를 수정하였다.

```text
Error: Node.js 20 detected without native WebSocket support.
```

적용 사항:

- `ws` 패키지 추가
- `server.js`에 `import ws from "ws"` 추가
- Supabase `createClient` 옵션에 `realtime.transport: ws` 추가
- `express`, `openai`, `@supabase/supabase-js`, `dotenv`, `ws` 의존성을 명시
- `package-lock.json` 재생성
- Render 빌드 명령은 `npm install` 유지

## 적용

변경 파일을 프로젝트에 덮어쓴 뒤:

```powershell
git add .
git commit -m "Fix Supabase WebSocket on Node 20"
git pull --rebase origin main
git push origin main
```

Render에서:

```text
Manual Deploy → Clear build cache & deploy
```
