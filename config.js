// ============================================================
//  Điền 2 giá trị lấy từ Supabase → Project Settings → API
//  (hoặc nút "Connect" ở đầu trang project).
//  - SUPABASE_URL      : dạng https://abcdxyz.supabase.co
//  - SUPABASE_ANON_KEY : "anon public" key (eyJ...) hoặc "publishable key" (sb_publishable_...)
//  Hai giá trị này được phép công khai: dữ liệu vẫn được bảo vệ bằng RLS + đăng nhập.
//  TUYỆT ĐỐI không dán "service_role" / "secret" key vào đây.
// ============================================================
window.QC_CONFIG = {
  SUPABASE_URL: 'https://fhwiviohfmgqyyxmlnfr.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_bAvN5fw6VdTpd0Pne-A_OA_Kj5hWW-F'
};
