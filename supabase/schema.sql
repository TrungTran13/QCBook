-- =====================================================================
--  QC Field Book – Supabase schema
--  Chạy toàn bộ file này 1 lần trong Supabase → SQL Editor → New query → Run.
--  Chạy lại nhiều lần cũng an toàn (dùng "if not exists" / "or replace").
-- =====================================================================

-- ---------- 1. Bảng dữ liệu ----------
-- Mỗi bảng lưu 1 loại tài liệu dưới dạng JSON (data), kèm:
--   updated     : thời điểm sửa trên máy (ms) – dùng để so mới/cũ khi đồng bộ
--   deleted     : true = đã xoá (giữ "bia mộ" để máy khác cũng xoá theo)
--   modified_at : giờ máy chủ, tự cập nhật – app dùng để chỉ tải phần thay đổi

create table if not exists public.templates (
  user_id     uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id          text   not null,
  data        jsonb,
  updated     bigint not null default 0,
  deleted     boolean not null default false,
  modified_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.customers (
  user_id     uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id          text   not null,
  data        jsonb,
  updated     bigint not null default 0,
  deleted     boolean not null default false,
  modified_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.reports (
  user_id     uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id          text   not null,
  data        jsonb,
  updated     bigint not null default 0,
  deleted     boolean not null default false,
  modified_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Ảnh: chỉ lưu thông tin (đường dẫn file trong Storage, chú thích, nét vẽ ghi chú).
-- File ảnh thật nằm trong bucket "photos".
create table if not exists public.photos (
  user_id     uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id          text   not null,
  data        jsonb,
  updated     bigint not null default 0,
  deleted     boolean not null default false,
  modified_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Cài đặt: 1 dòng cho mỗi người dùng (id luôn = 'main')
create table if not exists public.settings (
  user_id     uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  id          text   not null default 'main',
  data        jsonb,
  updated     bigint not null default 0,
  deleted     boolean not null default false,
  modified_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- 2. Tự cập nhật modified_at mỗi khi ghi ----------
create or replace function public.qc_touch() returns trigger
language plpgsql as $$
begin
  new.modified_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['templates','customers','reports','photos','settings'] loop
    execute format('drop trigger if exists qc_touch on public.%I', t);
    execute format('create trigger qc_touch before insert or update on public.%I
                    for each row execute function public.qc_touch()', t);
    execute format('create index if not exists %I on public.%I (user_id, modified_at)',
                   t || '_user_mod_idx', t);
  end loop;
end $$;

-- ---------- 3. RLS: mỗi người chỉ thấy / sửa dữ liệu của chính mình ----------
do $$
declare t text;
begin
  foreach t in array array['templates','customers','reports','photos','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = (select auth.uid()))
                    with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- 4. Storage: bucket riêng tư "photos" ----------
-- Ảnh lưu theo đường dẫn  <user_id>/<photo_id>/<loại>-<mã>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg','image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png'];

drop policy if exists "qc photos select" on storage.objects;
drop policy if exists "qc photos insert" on storage.objects;
drop policy if exists "qc photos update" on storage.objects;
drop policy if exists "qc photos delete" on storage.objects;

create policy "qc photos select" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "qc photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "qc photos update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "qc photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- 5. (Tuỳ chọn) Khoá cứng: chỉ 1 email được dùng ----------
-- Bỏ dấu "--" ở 2 dòng dưới và thay email của bạn nếu muốn chặn mọi email khác,
-- kể cả khi lỡ quên tắt "Allow new users to sign up".
-- create or replace function public.qc_only_me() returns trigger language plpgsql security definer as $$
-- begin if lower(new.email) <> lower('EMAIL_CUA_BAN@gmail.com') then raise exception 'Not allowed'; end if; return new; end $$;
-- drop trigger if exists qc_only_me on auth.users; create trigger qc_only_me before insert on auth.users for each row execute function public.qc_only_me();

-- Xong. Kiểm tra: Table Editor sẽ thấy 5 bảng; Storage sẽ thấy bucket "photos" (Private).
