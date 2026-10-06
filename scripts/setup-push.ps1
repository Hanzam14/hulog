# One-time hosted Web Push setup for Hulog. Run it yourself after `npx supabase login`.
# It makes the VAPID keys and the cron secret, stores them as Supabase Edge Function
# secrets, deploys `notify`, and copies the cron SQL to your clipboard.
# Private values are never printed or written to the repo.
param([string]$ProjectRef = 'zvavdpxlmbskbumxntfi')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$keys = npx --yes web-push generate-vapid-keys --json | ConvertFrom-Json
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$cron = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')

npx supabase secrets set --project-ref $ProjectRef `
    "NOTIFY_CRON_SECRET=$cron" `
    "VAPID_SUBJECT=https://hulog.vercel.app" `
    "VAPID_PUBLIC_KEY=$($keys.publicKey)" `
    "VAPID_PRIVATE_KEY=$($keys.privateKey)"
if ($LASTEXITCODE -ne 0) { throw 'Setting function secrets failed. Did you run npx supabase login?' }

npx supabase functions deploy notify --project-ref $ProjectRef --use-api
if ($LASTEXITCODE -ne 0) { throw 'Deploying the notify function failed.' }

$sql = @"
create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
select vault.create_secret('https://$ProjectRef.supabase.co', 'hulog_project_url');
select vault.create_secret('$cron', 'hulog_notify_cron_secret');
select cron.schedule(
  'hulog-notify-every-15-minutes',
  '*/15 * * * *',
  `$`$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'hulog_project_url') || '/functions/v1/notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'hulog_notify_cron_secret')
      ),
      body := '{}'::jsonb
    );
  `$`$
);
"@
Set-Clipboard -Value $sql

Write-Host ''
Write-Host 'Done. Secrets set and notify deployed.'
Write-Host 'The cron SQL is on your clipboard: paste it in Supabase SQL Editor and Run.'
Write-Host "Public key for Vercel VITE_VAPID_PUBLIC_KEY (safe to share): $($keys.publicKey)"
