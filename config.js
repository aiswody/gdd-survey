// Supabase 대시보드 > Project Settings > API Keys 의 Publishable key (또는 Legacy 탭의 anon key) 를 넣기.
// anon key는 브라우저에 공개되는 용도의 키라 여기 둬도 괜찮아요 (접근은 schema.sql의 RLS 규칙이 막아요).
// service_role key는 절대 여기에 넣지 마세요.
window.CONFIG = {
  SUPABASE_URL: "https://ckcngzyjsqyrbjygnelb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_UezWXfyjU8kRERLcpXyEvQ_5ZLfhcRN",
};
