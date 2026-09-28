# Video Vault

Video Vault is an installable web app/PWA for organizing, uploading, searching and playing personal videos.

## Included

- Video picker and drag/drop
- Categories and tags
- Search and sorting
- Video playback
- 10-band equalizer with presets
- Installable PWA
- Optional private Supabase cloud storage
- GitHub Pages deployment workflow

## Important

GitHub Pages hosts the app, not your video collection.

To actually free space on your phone, tablet or computer, connect Supabase Storage. Do not delete an original video until its cloud copy has finished uploading and you have successfully played that uploaded copy.

## GitHub Pages

In this repository open:

**Settings → Pages → Source → GitHub Actions**

After that, pushes to `main` deploy automatically.

Expected site address:

`https://themechanic916.github.io/video-vault-2/`

## Supabase setup

Create a Supabase project, enable Email/Password authentication, then run this SQL in Supabase SQL Editor:

```sql
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  size bigint not null default 0,
  mime text,
  category text not null default 'Uncategorized',
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.videos enable row level security;

create policy "read own videos"
on public.videos for select
using (auth.uid() = user_id);

create policy "insert own videos"
on public.videos for insert
with check (auth.uid() = user_id);

create policy "delete own videos"
on public.videos for delete
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('video-vault', 'video-vault', false)
on conflict (id) do nothing;

create policy "read own stored videos"
on storage.objects for select
using (
  bucket_id = 'video-vault'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "upload own stored videos"
on storage.objects for insert
with check (
  bucket_id = 'video-vault'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "delete own stored videos"
on storage.objects for delete
using (
  bucket_id = 'video-vault'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

Then open Video Vault → **Settings** and enter your Supabase Project URL and anon/publishable key.

Until Supabase is connected, the app works in local-preview mode only.
