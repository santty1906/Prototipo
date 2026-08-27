-- =============================================================================
-- Storage: the `profile-documents` bucket
-- =============================================================================
-- PRIVATE bucket. There is no public URL for these files — the app mints a
-- short-lived signed URL per view, which is also where an access check will go
-- once auth exists.
--
-- Object layout: documents/{document_id}.pdf
-- The object name is the document UUID, never the user's filename. That removes
-- path traversal, unicode and collision handling in one move; the original name
-- lives in `documents.file_name` and is purely presentational.
--
-- If your Supabase project blocks writes to the storage schema from migrations,
-- create the bucket by hand in the dashboard with the same settings instead.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-documents',
  'profile-documents',
  false,
  26214400,                   -- 25 MB
  array['application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No policies on storage.objects: like the tables, the bucket is server-only.
-- Uploads use a signed upload token and downloads use a signed URL, both minted
-- server-side with the service-role key, so neither needs an anon-key policy.
