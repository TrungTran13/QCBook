# QC Field Book – bản web app riêng (Supabase + PWA)

App kiểm hàng / review mẫu chạy ở địa chỉ web của riêng bạn, cài lên màn hình chính như app, chạy được khi mất mạng, tự gửi dữ liệu lên Supabase khi có mạng.

## Trong thư mục này có gì

| File / thư mục | Dùng để |
|---|---|
| `index.html`, `app.js` | Giao diện và toàn bộ chức năng (lấy từ app cũ, thay phần lưu trữ đám mây bằng Supabase) |
| `config.js` | **Bạn sửa file này**: dán URL + key của project Supabase |
| `sw.js`, `manifest.webmanifest`, `icons/` | Cho phép cài lên màn hình chính và mở khi mất mạng |
| `vendor/` | Thư viện xuất PDF, PowerPoint và kết nối Supabase (để sẵn trong máy, không cần mạng) |
| `fonts/` | Font Be Vietnam Pro để PDF hiển thị đúng tiếng Việt |
| `supabase/schema.sql` | Lệnh SQL tạo bảng, RLS, bucket ảnh |
| `netlify.toml`, `.nojekyll` | Cấu hình cho Netlify / GitHub Pages |

---

## Bước 1 – Tạo project Supabase (miễn phí, không cần thẻ)

1. Vào **https://supabase.com** → **Start your project** → đăng ký.
   **Quan trọng:** dùng đúng email bạn sẽ dùng để đăng nhập app. Email gửi miễn phí của Supabase chỉ gửi tới thành viên trong tổ chức Supabase của bạn, và tối đa khoảng 2 email/giờ.
2. **New project**:
   - Name: `qc-field-book`
   - Database Password: bấm *Generate*, lưu lại ở chỗ an toàn (app không cần mật khẩu này)
   - Region: **Southeast Asia (Singapore)** – gần Việt Nam nhất
   - Plan: **Free** → **Create new project**, đợi 1–2 phút.

## Bước 2 – Chạy SQL tạo bảng, RLS và bucket ảnh

1. Menu trái → **SQL Editor** → **New query**.
2. Mở file `supabase/schema.sql`, copy **toàn bộ**, dán vào → bấm **Run**. Thấy "Success. No rows returned" là xong.
3. Kiểm tra:
   - **Table Editor**: có 5 bảng `templates`, `customers`, `reports`, `photos`, `settings` (mỗi bảng có nhãn RLS enabled).
   - **Storage**: có bucket `photos` (Private).

## Bước 3 – Lấy URL và key, dán vào `config.js`

1. Bấm nút **Connect** ở đầu trang project (hoặc **Project Settings → API Keys / Data API**).
2. Copy **Project URL** (dạng `https://abcdxyz.supabase.co`) và **anon public key** (`eyJ...`) hoặc **publishable key** (`sb_publishable_...`).
3. Mở `config.js` bằng Notepad / TextEdit, thay 2 dòng:
   ```js
   SUPABASE_URL: 'https://abcdxyz.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...'
   ```
   Không bao giờ dán key `service_role` / `secret` vào đây.

## Bước 4 – Đưa app lên mạng

### Cách A – GitHub Pages (khuyên dùng)

Nếu **chưa có** tài khoản GitHub: vào https://github.com/signup → nhập email, mật khẩu, tên người dùng (ví dụ `trungqc`) → xác nhận email. Miễn phí, không cần thẻ.

1. Đăng nhập GitHub → góc trên phải **+** → **New repository**.
   - Repository name: `qc-field-book`
   - Chọn **Public** (gói miễn phí chỉ bật Pages cho repo public; repo chỉ chứa code, **không** chứa dữ liệu hay ảnh của bạn – dữ liệu nằm trong Supabase, được khoá bằng đăng nhập + RLS)
   - **Create repository**.
2. Trong repo mới → link **uploading an existing file** (hoặc **Add file → Upload files**).
   Kéo **toàn bộ nội dung bên trong** thư mục `qc-field-book` (gồm cả các thư mục `vendor`, `fonts`, `icons`, `supabase` và file `.nojekyll`) thả vào → **Commit changes**.
   (Trên Mac, file `.nojekyll` bị ẩn: bấm Cmd+Shift+. trong Finder để thấy. Thiếu file này app vẫn chạy.)
3. Repo → **Settings** → **Pages** → *Source*: **Deploy from a branch** → Branch: **main**, thư mục **/(root)** → **Save**.
4. Đợi 1–2 phút, trang Pages hiện địa chỉ: `https://<tên-người-dùng>.github.io/qc-field-book/`. Đây là địa chỉ app.

Cập nhật app sau này: upload đè file mới vào repo, rồi mở `sw.js` sửa dòng `VERSION` (ví dụ `...-2`) để điện thoại nhận bản mới ngay.

### Cách B – Netlify (không cần GitHub)

1. Vào https://app.netlify.com/signup → đăng ký bằng email.
2. Vào https://app.netlify.com/drop → kéo **cả thư mục** `qc-field-book` thả vào.
3. Netlify cho địa chỉ dạng `https://ten-ngau-nhien.netlify.app` → **Site configuration → Change site name** để đổi tên dễ nhớ.
4. Cập nhật: vào site → **Deploys** → kéo thả lại thư mục.

## Bước 5 – Khai báo địa chỉ app cho đăng nhập email

Trong Supabase:

1. **Authentication → URL Configuration**
   - **Site URL**: địa chỉ app, ví dụ `https://trungqc.github.io/qc-field-book/`
   - **Redirect URLs** → **Add URL**: thêm đúng địa chỉ đó → **Save**.
2. **Authentication → Emails** (Email Templates) → **Magic Link** → thêm mã 6 số vào nội dung, ví dụ:
   ```html
   <h2>QC Field Book</h2>
   <p><a href="{{ .ConfirmationURL }}">Bấm vào đây để đăng nhập</a></p>
   <p>Hoặc nhập mã: <b>{{ .Token }}</b></p>
   ```
   → **Save**. Mã này cần cho iPad/iPhone khi app đã cài lên màn hình chính (bấm link trong email sẽ mở Safari, không mở app).

## Bước 6 – Đăng nhập lần đầu và khoá lại chỉ cho mình bạn

1. Mở địa chỉ app → nhập email → **Send sign-in email** → bấm link trong email, hoặc gõ mã 6 số vào app.
2. Sau khi đăng nhập được, quay lại Supabase → **Authentication → Sign In / Providers** → phần **User Signups** → **tắt "Allow new users to sign up"** → **Save**. Từ giờ không ai tạo được tài khoản mới; bạn vẫn đăng nhập bình thường.
3. (Tuỳ chọn, chặt hơn) trong `schema.sql` mục 5 có đoạn chỉ cho phép đúng 1 email – bỏ dấu `--`, thay email, chạy lại trong SQL Editor.

## Bước 7 – Cài lên màn hình chính (PWA)

- **iPad / iPhone**: mở địa chỉ app bằng **Safari** → nút **Chia sẻ** → **Thêm vào MH chính**. Mở app từ biểu tượng mới → đăng nhập lại **bằng mã 6 số** (app cài trên màn hình chính có bộ nhớ riêng với Safari).
- **Android / máy tính (Chrome, Edge)**: Settings trong app → **Install app**, hoặc menu trình duyệt → **Cài đặt ứng dụng**.
- Lần đầu dùng camera, cho phép quyền **Camera**.

## Bước 8 – Nhập dữ liệu từ app cũ trên claude.ai

1. Mở app cũ trên claude.ai → **Settings → Download backup (.json)**.
2. Mở app mới (nên dùng máy tính nếu file lớn) → **Settings → Import backup (.json)** → chọn file.
3. App nhập báo cáo, template, khách hàng (kèm kiểu slide, logo), cài đặt và ảnh; ảnh được nén lại ~250 KB rồi tự tải lên Supabase. Biểu tượng đám mây trên thanh trên cùng cho biết trạng thái; mục *Account & cloud sync* ghi số ảnh còn chờ gửi.
4. Mở app trên iPad, đăng nhập: báo cáo hiện ngay, ảnh tự tải về máy để dùng khi mất mạng.

Chỉ cần nhập **một lần trên một máy**; các máy khác tự nhận qua Supabase.

---

## Cách app lưu dữ liệu

- Mọi thao tác lưu ngay vào máy (IndexedDB). Ảnh lưu dạng **ArrayBuffer** (không dùng Blob) và được **đọc lại kiểm tra** ngay sau mỗi lần lưu; nếu hỏng app báo để chụp lại.
- Có mạng + đã đăng nhập: app tự gửi thay đổi lên Supabase (sau mỗi lần sửa ~1,5 giây, khi mở lại app, khi có mạng trở lại, và mỗi phút).
- Ảnh: bản gốc (~250 KB, cạnh dài ≤ 1600 px), bản đã vẽ ghi chú (nếu có) và thumbnail (~15 KB) trong bucket `photos`, đường dẫn `<user_id>/<photo_id>/...`.
- Xoá báo cáo/ảnh trên một máy thì máy khác cũng xoá theo.

## Giới hạn gói Free nên biết

- Lưu trữ file 1 GB ≈ 3.500 ảnh (ảnh có vẽ ghi chú tốn gấp đôi). Database 500 MB – dư cho hàng chục nghìn báo cáo.
- Băng thông ~5 GB/tháng: mỗi máy mới tải toàn bộ ảnh về một lần.
- **Project bị tạm dừng nếu 1 tuần không có hoạt động.** Khi đó app vẫn chạy offline bình thường; vào supabase.com → project → **Restore** là đồng bộ lại.
- Email đăng nhập: tối đa khoảng 2 email/giờ. Phiên đăng nhập được giữ lâu, thường không phải đăng nhập lại.

## Khác với bản trên claude.ai

- Bỏ: lưu vào Google Drive và gửi Gmail trực tiếp (chỉ chạy được bên trong claude.ai).
- **Email report (PDF)**: mở bảng chia sẻ của máy (Mail, Gmail, Zalo…) với file PDF đính kèm.
- **Google Slides**: xuất `.pptx`, tải lên Google Drive → *Mở bằng Google Trang trình bày*; mũi tên, khung, chữ, số vẫn là hình riêng sửa được.
- PDF xếp cố định tối đa 4 ảnh/trang (2 × 2). Sửa lỗi cũ: ảnh có ghi chú ở vị trí thứ 2 trở đi trong một mục bị mất nét vẽ khi xuất PDF.
- Khách hàng → *Slide style* có nút **Use Article style** (Montserrat, `#FF6559`, header "Article PD: … - Review # n - …", nhãn "Wrike Link"); tải logo Article lên ở đó nếu backup chưa có.

## Gỡ lỗi nhanh

| Thông báo trong app | Cách xử lý |
|---|---|
| *Cloud sync is off: put your Supabase URL…* | Chưa sửa `config.js` (Bước 3) |
| *tables are missing / photo bucket is missing* | Chạy lại `schema.sql` (Bước 2) |
| *cannot reach Supabase* | Mất mạng, hoặc project bị tạm dừng → Restore |
| Không nhận được email | Email đăng nhập phải trùng email tài khoản Supabase; đợi rồi thử lại (giới hạn ~2 email/giờ); xem thư rác |
| Bấm link email báo lỗi redirect | Thêm đúng địa chỉ app vào Redirect URLs (Bước 5) |
| Điện thoại vẫn chạy bản cũ | Tăng `VERSION` trong `sw.js`, đóng hẳn app rồi mở lại |
