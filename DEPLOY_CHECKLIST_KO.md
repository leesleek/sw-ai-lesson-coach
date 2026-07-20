# 직접 해야 하는 작업

1. Supabase에서 Free 프로젝트 생성
2. SQL Editor에서 `supabase/setup.sql` 실행
3. Supabase Project URL과 Secret Key 복사
4. OpenAI API Key와 관리자 비밀번호 준비
5. GitHub에 이 폴더 업로드
6. Render에서 New → Blueprint → GitHub 저장소 선택
7. 환경변수 4개 입력
   - OPENAI_API_KEY
   - ADMIN_PASSWORD
   - SUPABASE_URL
   - SUPABASE_SECRET_KEY
8. 배포 주소의 `/api/health` 확인
