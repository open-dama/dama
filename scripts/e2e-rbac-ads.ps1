# Authenticated E2E for RBAC CRUD + ad playback (10s) + schedule + eligibility.
# Requires: API up (default :8080), DAMA_ALLOW_E2E_AUTH=1
# Override host when :8080 is blocked (e.g. Windows excluded port range): DAMA_E2E_API=http://127.0.0.1:18080
$ErrorActionPreference = "Stop"
$apiHost = if ($env:DAMA_E2E_API) { $env:DAMA_E2E_API.Trim().TrimEnd("/") } else { "http://127.0.0.1:8080" }
$base = "$apiHost/api/v1"

function Invoke-Json($Method, $Path, $Body, $Token) {
  $headers = @{ "Content-Type" = "application/json" }
  if ($Token) { $headers["Authorization"] = "Bearer $Token" }
  $params = @{
    Uri = "$base$Path"
    Method = $Method
    Headers = $headers
    UseBasicParsing = $true
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }
  $res = Invoke-WebRequest @params
  return ($res.Content | ConvertFrom-Json)
}

# Console playback PUT replaces the full ad_playback value. Always echo Phase A
# lobby rotate + Phase B soft idle + freq caps from the prior GET or validation fails.
function New-PlaybackPutBody($pb, $NonSkippable, $FirstShow, $Interval) {
  return @{
    non_skippable_seconds = [int]$NonSkippable
    first_show_after_game_seconds = [int]$FirstShow
    default_interval_seconds = [int]$Interval
    lobby_rotate_enabled = [bool]$pb.lobby_rotate_enabled
    lobby_rotate_interval_seconds = [int]$pb.lobby_rotate_interval_seconds
    lobby_soft_interstitial_enabled = [bool]$pb.lobby_soft_interstitial_enabled
    lobby_idle_threshold_seconds = [int]$pb.lobby_idle_threshold_seconds
    freq_cap_campaign_per_hour = [int]$pb.freq_cap_campaign_per_hour
    freq_cap_campaign_per_day = [int]$pb.freq_cap_campaign_per_day
    freq_cap_campaign_per_session = [int]$pb.freq_cap_campaign_per_session
    freq_cap_placement_per_hour = [int]$pb.freq_cap_placement_per_hour
    freq_cap_placement_per_day = [int]$pb.freq_cap_placement_per_day
    freq_cap_placement_per_session = [int]$pb.freq_cap_placement_per_session
    freq_cap_min_gap_seconds = [int]$pb.freq_cap_min_gap_seconds
  }
}

Write-Host "== health =="
$hz = Invoke-WebRequest "$apiHost/healthz" -UseBasicParsing
if ($hz.Content -notmatch "ok") { throw "healthz failed" }

Write-Host "== mint superadmin =="
$auth = Invoke-Json POST "/auth/e2e/session" @{
  username = "e2e_superadmin"
  email = "e2e_superadmin@example.com"
  role = "superadmin"
} $null
$token = $auth.access_token
if (-not $token) { throw "no access_token (is DAMA_ALLOW_E2E_AUTH=1?)" }

Write-Host "== normalize platform non_skippable to seed default 10 =="
$cab0 = Invoke-Json GET "/console/ads/playback" $null $token
$pb0seed = $cab0.playback
Invoke-Json PUT "/console/ads/playback" (New-PlaybackPutBody $pb0seed 10 $pb0seed.first_show_after_game_seconds $pb0seed.default_interval_seconds) $token | Out-Null

Write-Host "== playback public (non_skippable must be 10) =="
$pb = Invoke-Json GET "/ads/playback" $null $null
if ([int]$pb.non_skippable_seconds -ne 10) { throw ("expected non_skippable 10 got " + $pb.non_skippable_seconds) }
if ($null -eq $pb.lobby_rotate_enabled) { throw "lobby_rotate_enabled missing" }
if ([int]$pb.lobby_rotate_interval_seconds -lt 1) { throw "lobby_rotate_interval_seconds missing" }
if ($null -eq $pb.lobby_soft_interstitial_enabled) { throw "lobby_soft_interstitial_enabled missing" }
# Phase B ship gate: soft interstitial stays admin opt-in (migration default false).
if ([bool]$pb.lobby_soft_interstitial_enabled -ne $false) {
  throw "lobby_soft_interstitial_enabled must default false (opt-in)"
}
if ([int]$pb.lobby_idle_threshold_seconds -lt 1) { throw "lobby_idle_threshold_seconds missing" }
if ($null -eq $pb.freq_cap_campaign_per_session) { throw "freq_cap_campaign_per_session missing" }
if ($null -eq $pb.freq_cap_placement_per_session) { throw "freq_cap_placement_per_session missing" }
if ($null -eq $pb.freq_cap_min_gap_seconds) { throw "freq_cap_min_gap_seconds missing" }
if (-not $pb.player_chrome.sponsored_label) { throw "player_chrome missing" }
if (-not $pb.player_chrome.placement_in_match) { throw "placement_in_match missing" }
if (-not $pb.schedule_chrome.publisher_page_title) { throw "publisher_page_title missing" }
if (-not $pb.schedule_chrome.toast_schedule_saved) { throw "toast_schedule_saved missing" }
if (-not $pb.schedule_chrome.ph_title) { throw "publisher form chrome missing" }
if (-not $pb.schedule_chrome.create_action) { throw "create_action missing" }
if (-not $pb.schedule_chrome.publisher_dash_title) { throw "publisher_dash_title missing" }
if (-not $pb.schedule_chrome.publisher_analytics_title) { throw "publisher_analytics_title missing" }
if (-not $pb.schedule_chrome.publisher_invoice_action) { throw "publisher_invoice_action missing" }
if (-not $pb.schedule_chrome.publisher_manage_campaigns_href) { throw "publisher_manage_campaigns_href missing" }
if (-not $pb.schedule_chrome.first_show_label) { throw "first_show_label missing" }
if (-not $pb.schedule_chrome.daily_cap_label) { throw "daily_cap_label missing" }
Write-Host ("non_skippable_seconds=" + $pb.non_skippable_seconds)

Write-Host "== me/permissions =="
$me = Invoke-Json GET "/console/me/permissions" $null $token
$manageKey = [string]$me.chrome.manage_permission_key
if (-not $manageKey) { throw "manage_permission_key missing" }
if ($me.permissions -notcontains $manageKey) { throw "superadmin lacks manage permission from chrome" }
if (-not $me.chrome.page_title) { throw "rbac chrome missing on me/permissions" }
if (-not $me.chrome.toast_catalog_saved) { throw "rbac toast chrome missing" }
if (-not $me.ads_chrome.lacks_permissions) { throw "ads_chrome missing" }
if (-not $me.ads_chrome.runtime_permission_key) { throw "runtime_permission_key missing" }
if (-not $me.ads_chrome.campaigns_permission_key) { throw "campaigns_permission_key missing" }

Write-Host "== rbac forbidden without manage permission (admin role) =="
$adminAuth = Invoke-Json POST "/auth/e2e/session" @{
  username = "e2e_admin_norbac"
  email = "e2e_admin_norbac@example.com"
  role = "admin"
} $null
$adminTok = $adminAuth.access_token
$rbacForbidden = $false
try {
  Invoke-Json GET "/console/rbac" $null $adminTok | Out-Null
} catch { $rbacForbidden = $true }
if (-not $rbacForbidden) { throw "expected admin without rbac.manage to be forbidden on /console/rbac" }

Write-Host "== rbac snapshot + catalog CRUD (roles) =="
$snap = Invoke-Json GET "/console/rbac" $null $token
if (-not $snap.chrome.page_title) { throw "rbac snapshot chrome missing" }
$probeRole = "e2e_role_" + [guid]::NewGuid().ToString("N").Substring(0, 6)
$rolesBefore = @($snap.roles)
$rolesWithProbe = $rolesBefore + $probeRole
Invoke-Json PUT "/console/rbac/catalog" @{
  roles = $rolesWithProbe
  console_roles = @($snap.console_roles)
  publisher_roles = @($snap.publisher_roles)
  default_role = $snap.default_role
} $token | Out-Null
$snap2 = Invoke-Json GET "/console/rbac" $null $token
if ($snap2.roles -notcontains $probeRole) { throw "catalog add role failed" }
Invoke-Json PUT "/console/rbac/catalog" @{
  roles = $rolesBefore
  console_roles = @($snap.console_roles)
  publisher_roles = @($snap.publisher_roles)
  default_role = $snap.default_role
} $token | Out-Null
$snap3 = Invoke-Json GET "/console/rbac" $null $token
if ($snap3.roles -contains $probeRole) { throw "catalog remove role failed" }

Write-Host "== rbac refuse remove role still assigned to users =="
# superadmin token user holds role superadmin; removing it from catalog must fail closed.
$rolesWithoutSuper = @($snap3.roles | Where-Object { $_ -ne "superadmin" })
if ($rolesWithoutSuper.Count -ge 1 -and ($snap3.roles -contains "superadmin")) {
  $denied = $false
  try {
    Invoke-Json PUT "/console/rbac/catalog" @{
      roles = $rolesWithoutSuper
      console_roles = @($snap3.console_roles | Where-Object { $_ -ne "superadmin" })
      publisher_roles = @($snap3.publisher_roles)
      default_role = $snap3.default_role
    } $token | Out-Null
  } catch {
    $denied = $true
  }
  if (-not $denied) { throw "expected catalog remove of in-use superadmin to fail" }
  $snapGuard = Invoke-Json GET "/console/rbac" $null $token
  if ($snapGuard.roles -notcontains "superadmin") { throw "superadmin role was removed despite users" }
}

Write-Host "== rbac upsert + update permission =="
$key = "e2e.probe." + [guid]::NewGuid().ToString("N").Substring(0, 8)
$perm = Invoke-Json PUT "/console/rbac/permissions" @{
  key = $key
  title = "E2E probe"
  description = "temporary"
} $token
if ($perm.key -ne $key) { throw "upsert permission failed" }
$perm2 = Invoke-Json PUT "/console/rbac/permissions" @{
  key = $key
  title = "E2E probe updated"
  description = "temporary-updated"
} $token
if ($perm2.title -ne "E2E probe updated") { throw "update permission failed" }

Write-Host "== rbac refuse delete protected permission =="
$snapProt = Invoke-Json GET "/console/rbac" $null $token
$protected = @($snapProt.chrome.protected_permission_keys)
if ($protected.Count -lt 1) { throw "protected_permission_keys missing" }
$protKey = [string]$protected[0]
$delProtDenied = $false
try {
  Invoke-Json DELETE "/console/rbac/permissions/$protKey" $null $token | Out-Null
} catch { $delProtDenied = $true }
if (-not $delProtDenied) { throw "expected protected permission delete to fail" }
$snapProt2 = Invoke-Json GET "/console/rbac" $null $token
$protKeys2 = @($snapProt2.permissions | ForEach-Object { $_.key })
if ($protKeys2 -notcontains $protKey) { throw "protected permission was deleted" }

Write-Host "== rbac refuse strip protected grant from last role =="
$superGrants = @($snapProt2.role_permissions.superadmin)
if (-not $superGrants) { $superGrants = @() }
$superWithoutProt = @($superGrants | Where-Object { $_ -ne $protKey })
$stripDenied = $false
try {
  Invoke-Json PUT "/console/rbac/roles/superadmin/permissions" @{ permissions = $superWithoutProt } $token | Out-Null
} catch { $stripDenied = $true }
if (-not $stripDenied) { throw "expected strip of last protected grant to fail" }
$snapStrip = Invoke-Json GET "/console/rbac" $null $token
if ($snapStrip.role_permissions.superadmin -notcontains $protKey) { throw "protected grant was stripped from last role" }

Write-Host "== replace grants for admin (add probe) =="
$adminGrants = @($snapStrip.role_permissions.admin)
if (-not $adminGrants) { $adminGrants = @() }
if ($adminGrants -notcontains $key) { $adminGrants += $key }
Invoke-Json PUT "/console/rbac/roles/admin/permissions" @{ permissions = $adminGrants } $token | Out-Null
$snapGrants = Invoke-Json GET "/console/rbac" $null $token
if ($snapGrants.role_permissions.admin -notcontains $key) { throw "grant add failed" }

Write-Host "== delete probe permission =="
Invoke-Json DELETE "/console/rbac/permissions/$key" $null $token | Out-Null
$snapDel = Invoke-Json GET "/console/rbac" $null $token
$permKeys = @($snapDel.permissions | ForEach-Object { $_.key })
if ($permKeys -contains $key) { throw "delete permission failed" }
if ($snapDel.role_permissions.admin -contains $key) { throw "grant not cleaned after delete" }

Write-Host "== console ads playback get + bounds =="
$cab = Invoke-Json GET "/console/ads/playback" $null $token
$pb0 = $cab.playback
if ([int]$pb0.non_skippable_min -lt 1) { throw "bounds min missing" }
if ([int]$pb0.non_skippable_max -le [int]$pb0.non_skippable_min) { throw "bounds max invalid" }
if ([int]$pb0.impression_cap_min -lt 1) { throw "impression_cap_min missing" }
$first = [int]$pb0.first_show_after_game_seconds
$interval = [int]$pb0.default_interval_seconds

Write-Host "== flexible non-skippable: set 15 (admin CRUD) =="
$put15 = Invoke-Json PUT "/console/ads/playback" (New-PlaybackPutBody $pb0 15 $first $interval) $token
if ([int]$put15.non_skippable_seconds -ne 15) { throw "put 15 failed" }
if ([int]$put15.lobby_rotate_interval_seconds -ne [int]$pb0.lobby_rotate_interval_seconds) { throw "put wiped lobby_rotate_interval" }
if ([bool]$put15.lobby_soft_interstitial_enabled -ne [bool]$pb0.lobby_soft_interstitial_enabled) { throw "put wiped lobby_soft_interstitial_enabled" }
if ([int]$put15.lobby_idle_threshold_seconds -ne [int]$pb0.lobby_idle_threshold_seconds) { throw "put wiped lobby_idle_threshold" }
$pubPb = Invoke-Json GET "/ads/playback" $null $null
if ([int]$pubPb.non_skippable_seconds -ne 15) { throw "public playback not 15" }
if ($null -eq $pubPb.lobby_soft_interstitial_enabled) { throw "public lobby_soft missing" }
if ([int]$pubPb.lobby_idle_threshold_seconds -lt 1) { throw "public lobby_idle missing" }
if (-not $pubPb.schedule_chrome.save_campaign_schedule_action) { throw "schedule_chrome missing" }

Write-Host "== mint publisher + create campaign =="
$enums = Invoke-Json GET "/platform/enums" $null $null
$servable = $enums.servable_campaign_status
if (-not $enums.default_creative_type) { throw "default_creative_type missing" }
if (-not $enums.video_creative_type) { throw "video_creative_type missing" }
if (-not $enums.creative_types) { throw "creative_types missing" }
if ($enums.creative_types -notcontains $enums.default_creative_type) { throw "default creative not in list" }
if ($enums.creative_types -notcontains $enums.video_creative_type) { throw "video creative not in list" }

$pub = Invoke-Json POST "/auth/e2e/session" @{
  username = "e2e_publisher"
  email = "e2e_publisher@example.com"
  role = "advertiser"
} $null
$pubToken = $pub.access_token
$pubUserId = [string]$pub.user.id
if (-not $pubUserId) { $pubUserId = [string]$pub.user_id }
if (-not $pubUserId) { throw "publisher user id missing" }
# Marketplace create fee needs wallet balance (credit via DB; same pattern as other e2e).
$pricing = Invoke-Json GET "/ads/pricing" $null $pubToken
$createFee = [double]$pricing.campaign_create_fee_amount
$feeCur = [string]$pricing.campaign_create_fee_currency
if (-not $feeCur) { $feeCur = "ETB" }
$creditAmt = [Math]::Max(500, [Math]::Ceiling($createFee) + 100)
$dbUrl = $env:DAMA_DATABASE_URL
if (-not $dbUrl) { $dbUrl = $env:DATABASE_URL }
if (-not $dbUrl) { throw "DAMA_DATABASE_URL required to credit e2e publisher wallet" }
$env:DAMA_DATABASE_URL = $dbUrl
$env:DATABASE_URL = $dbUrl
$py = @"
import os, psycopg2
url = os.environ.get('DAMA_DATABASE_URL') or os.environ.get('DATABASE_URL')
conn = psycopg2.connect(url)
c = conn.cursor()
uid = '$pubUserId'
# Cash gate: age + phone KYC required for campaign create when marketplace settle uses cash.
c.execute(
  '''UPDATE users
     SET age_verified_at = COALESCE(age_verified_at, NOW()),
         phone_kyc_verified_at = COALESCE(phone_kyc_verified_at, NOW()),
         primary_phone = COALESCE(NULLIF(trim(primary_phone), ''), '+251911000999')
     WHERE id = %s::uuid''',
  (uid,),
)
c.execute(
  '''INSERT INTO wallets (user_id, currency, balance, updated_at)
     VALUES (%s::uuid, %s, %s, NOW())
     ON CONFLICT (user_id, currency) DO UPDATE
     SET balance = wallets.balance + EXCLUDED.balance, updated_at = NOW()''',
  (uid, '$feeCur', float($creditAmt)),
)
conn.commit()
conn.close()
print('wallet_credited')
"@
python -c $py
if ($LASTEXITCODE -ne 0) { throw "e2e wallet credit failed" }
# Clear prior e2e viewer impressions so freq caps / min-gap from earlier runs
# cannot fail closed on fresh eligibility (same fixed e2e-viewer-* keys).
python (Join-Path $PSScriptRoot "_e2e_clear_impressions.py")
if ($LASTEXITCODE -ne 0) { throw "e2e impression cleanup failed" }

# Cash locate gate: stamp a fresh geo_ip_records row for this publisher.
Invoke-Json POST "/geo/locate" @{} $pubToken | Out-Null

# Cash/RMG jurisdiction allowlist requires an allowed pin country (ET).
# Addis pin required (server rejects country-only geo_targets).
$geoCountry = "ET"
$floor = [double]$pricing.floor_cpm
if ($floor -le 0) { $floor = 0.01 }
$bid = [Math]::Max($floor + 0.01, 1.0)
$campTitle = "E2E in-match campaign " + [guid]::NewGuid().ToString("N").Substring(0, 8)
$camp = Invoke-Json POST "/ads/campaigns" @{
  title = $campTitle
  creative_type = $enums.default_creative_type
  creative_url = "https://example.com/e2e-ad.png"
  geo_targets = @(@{ country = $geoCountry; lat = 9.03; lng = 38.74 })
  daily_spend_cap = 50
  buying_type = "auction"
  bid_cpm = $bid
} $pubToken
$campId = $camp.id
if (-not $campId) { throw "campaign create failed" }
Invoke-Json PATCH "/ads/campaigns/$campId/status" @{ status = $servable } $pubToken | Out-Null

Write-Host "== in-match impression requires schedule_enabled =="
$pbPlaceEarly = Invoke-Json GET "/ads/playback" $null $null
$placeEarly = [string]$pbPlaceEarly.player_chrome.placement_in_match
$impSchedDenied = $false
try {
  Invoke-Json POST "/ads/campaigns/$campId/impression" @{
    viewer_key = "e2e-viewer-no-sched"
    session_key = "e2e-sess-no-sched"
    placement = $placeEarly
  } $null | Out-Null
} catch { $impSchedDenied = $true }
if (-not $impSchedDenied) { throw "expected in-match impression without schedule to fail" }

Write-Host "== first-show gate (before_first_show) =="
Invoke-Json PATCH "/console/ads/campaigns/$campId/schedule" @{
  schedule_enabled = $true
  first_show_after_seconds = 120
  interval_seconds = 60
  non_skippable_seconds = $null
  daily_impression_cap = 100
  weekly_impression_cap = $null
  monthly_impression_cap = $null
  yearly_impression_cap = $null
} $token | Out-Null
$eligEarly = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 5
  viewer_key = "e2e-viewer-early"
  session_key = "e2e-sess-early"
  country = $geoCountry
} $null
if ($eligEarly.show -eq $true) { throw ("expected before_first_show block got " + ($eligEarly | ConvertTo-Json -Compress)) }
if ([string]$eligEarly.reason -ne "before_first_show") { throw ("expected reason before_first_show got " + $eligEarly.reason) }

Write-Host "== interval gate (interval_not_elapsed) =="
Invoke-Json PATCH "/console/ads/campaigns/$campId/schedule" @{
  schedule_enabled = $true
  first_show_after_seconds = 0
  interval_seconds = 300
  non_skippable_seconds = $null
  daily_impression_cap = 100
  weekly_impression_cap = $null
  monthly_impression_cap = $null
  yearly_impression_cap = $null
} $token | Out-Null
# elapsed must clear the API cold-open floor (15s) so the interval gate is what blocks.
$eligInterval = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 20
  seconds_since_last_ad = 10
  viewer_key = "e2e-viewer-interval"
  session_key = "e2e-sess-interval"
  country = $geoCountry
} $null
if ($eligInterval.show -eq $true) { throw ("expected interval_not_elapsed block got " + ($eligInterval | ConvertTo-Json -Compress)) }
if ([string]$eligInterval.reason -ne "interval_not_elapsed") { throw ("expected reason interval_not_elapsed got " + $eligInterval.reason) }

Write-Host "== admin enable schedule (platform non-skip 15, no campaign override) =="
Invoke-Json PATCH "/console/ads/campaigns/$campId/schedule" @{
  schedule_enabled = $true
  first_show_after_seconds = 0
  interval_seconds = 60
  non_skippable_seconds = $null
  daily_impression_cap = 100
  weekly_impression_cap = $null
  monthly_impression_cap = $null
  yearly_impression_cap = $null
} $token | Out-Null

Write-Host "== eligibility must use admin-changed 15 =="
# past cold-open floor (campaign first_show=0 is floored to 15 server-side)
$elig = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 20
  viewer_key = "e2e-viewer-flex"
  session_key = "e2e-sess-flex"
  country = $geoCountry
} $null
if (-not $elig.show) { throw ("expected show=true got " + ($elig | ConvertTo-Json -Compress)) }
if ([int]$elig.non_skippable_seconds -ne 15) { throw ("expected non_skippable 15 got " + $elig.non_skippable_seconds) }
if ($elig.campaign.id -ne $campId) { throw "wrong campaign" }

Write-Host "== campaign override non-skippable to 12 =="
Invoke-Json PATCH "/console/ads/campaigns/$campId/schedule" @{
  schedule_enabled = $true
  first_show_after_seconds = 0
  interval_seconds = 60
  non_skippable_seconds = 12
  daily_impression_cap = 100
  weekly_impression_cap = $null
  monthly_impression_cap = $null
  yearly_impression_cap = $null
} $token | Out-Null
$elig2 = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 20
  seconds_since_last_ad = 999
  viewer_key = "e2e-viewer-flex2"
  session_key = "e2e-sess-flex2"
  country = $geoCountry
} $null
if (-not $elig2.show) { throw "expected show after override" }
if ([int]$elig2.non_skippable_seconds -ne 12) { throw ("expected override 12 got " + $elig2.non_skippable_seconds) }
if ($elig2.campaign.id -ne $campId) { throw "wrong campaign on override" }

Write-Host "== restore platform non-skippable to 10 =="
$put10 = Invoke-Json PUT "/console/ads/playback" (New-PlaybackPutBody $pb0 10 $first $interval) $token
if ([int]$put10.non_skippable_seconds -ne 10) { throw "restore 10 failed" }
if ([int]$put10.lobby_rotate_interval_seconds -ne [int]$pb0.lobby_rotate_interval_seconds) { throw "restore wiped lobby_rotate_interval" }
if ([bool]$put10.lobby_soft_interstitial_enabled -ne [bool]$pb0.lobby_soft_interstitial_enabled) { throw "restore wiped lobby_soft" }
if ([int]$put10.lobby_idle_threshold_seconds -ne [int]$pb0.lobby_idle_threshold_seconds) { throw "restore wiped lobby_idle" }

Write-Host "== Phase A lobby rotate round-trip (disable then restore) =="
$rotOffBody = New-PlaybackPutBody $pb0 10 $first $interval
$rotOffBody.lobby_rotate_enabled = $false
$rotOff = Invoke-Json PUT "/console/ads/playback" $rotOffBody $token
if ($rotOff.lobby_rotate_enabled -ne $false) { throw "lobby rotate disable failed" }
$rotOnBody = New-PlaybackPutBody $pb0 10 $first $interval
$rotOnBody.lobby_rotate_enabled = [bool]$pb0.lobby_rotate_enabled
$rotRestored = Invoke-Json PUT "/console/ads/playback" $rotOnBody $token
if ([bool]$rotRestored.lobby_rotate_enabled -ne [bool]$pb0.lobby_rotate_enabled) {
  throw "lobby rotate restore failed"
}

Write-Host "== Phase B soft interstitial round-trip (enable then restore) =="
$softOnBody = New-PlaybackPutBody $pb0 10 $first $interval
$softOnBody.lobby_soft_interstitial_enabled = $true
$softOn = Invoke-Json PUT "/console/ads/playback" $softOnBody $token
if ($softOn.lobby_soft_interstitial_enabled -ne $true) { throw "soft enable failed" }
$softOffBody = New-PlaybackPutBody $pb0 10 $first $interval
$softOffBody.lobby_soft_interstitial_enabled = [bool]$pb0.lobby_soft_interstitial_enabled
$softOffBody.lobby_idle_threshold_seconds = [int]$pb0.lobby_idle_threshold_seconds
$softRestored = Invoke-Json PUT "/console/ads/playback" $softOffBody $token
if ([bool]$softRestored.lobby_soft_interstitial_enabled -ne [bool]$pb0.lobby_soft_interstitial_enabled) {
  throw "soft restore failed"
}

Write-Host "== Phase C lobby_takeover package seeded =="
$prog = Invoke-Json GET "/console/progression" $null $token
$pkgs = @($prog.ad_packages)
$takeover = $pkgs | Where-Object { ([string]$_.code).ToLower() -eq "lobby_takeover" } | Select-Object -First 1
if (-not $takeover) { throw "lobby_takeover package missing" }
if ($takeover.lobby_takeover -ne $true) { throw "lobby_takeover flag false" }
if ([string]$takeover.placement -ne "lobby") { throw "lobby_takeover placement not lobby" }
if ($takeover.exclusive -ne $true) { throw "lobby_takeover exclusive must be true" }
if ([string]$takeover.buying_type -ne "reservation") { throw "lobby_takeover buying_type must be reservation" }

Write-Host "== Phase C lobby_takeover reject non-lobby placement =="
# Validation-only probe: must fail closed before persist (catalog unchanged).
$badDenied = $false
try {
  Invoke-Json PUT "/console/progression" @{
    ad_packages = @(
      @{
        code = "lobby_takeover"
        title = "Lobby takeover"
        buying_type = "reservation"
        fixed_cpm = 1
        flight_fee = 0
        min_tier = "starter"
        placement = "in_match"
        enabled = $true
        sort_order = 1
        exclusive = $true
        exclusive_category = "lobby_takeover"
        lobby_takeover = $true
      }
    )
  } $token | Out-Null
} catch { $badDenied = $true }
if (-not $badDenied) { throw "expected lobby_takeover with in_match placement to fail" }
# Confirm seed package still present after rejected PUT.
$progAfterBad = Invoke-Json GET "/console/progression" $null $token
$takeAfterBad = @($progAfterBad.ad_packages) | Where-Object { ([string]$_.code).ToLower() -eq "lobby_takeover" } | Select-Object -First 1
if (-not $takeAfterBad) { throw "lobby_takeover package missing after rejected PUT" }
if ([string]$takeAfterBad.placement -ne "lobby") { throw "lobby_takeover placement changed after rejected PUT" }

Write-Host "== Phase C lobby_takeover reject non-exclusive =="
$exclDenied = $false
try {
  Invoke-Json PUT "/console/progression" @{
    ad_packages = @(
      @{
        code = "lobby_takeover"
        title = "Lobby takeover"
        buying_type = "reservation"
        fixed_cpm = 1
        flight_fee = 0
        min_tier = "starter"
        placement = "lobby"
        enabled = $true
        sort_order = 1
        exclusive = $false
        exclusive_category = ""
        lobby_takeover = $true
      }
    )
  } $token | Out-Null
} catch { $exclDenied = $true }
if (-not $exclDenied) { throw "expected lobby_takeover without exclusive to fail" }

Write-Host "== Phase C lobby_takeover reject auction buying_type =="
$auctionDenied = $false
try {
  Invoke-Json PUT "/console/progression" @{
    ad_packages = @(
      @{
        code = "lobby_takeover"
        title = "Lobby takeover"
        buying_type = "auction"
        fixed_cpm = 1
        flight_fee = 0
        min_tier = "starter"
        placement = "lobby"
        enabled = $true
        sort_order = 1
        exclusive = $true
        exclusive_category = "lobby_takeover"
        lobby_takeover = $true
      }
    )
  } $token | Out-Null
} catch { $auctionDenied = $true }
if (-not $auctionDenied) { throw "expected lobby_takeover with auction buying_type to fail" }

Write-Host "== Phase C lobby_takeover reject empty buying_type =="
$emptyBuyDenied = $false
try {
  Invoke-Json PUT "/console/progression" @{
    ad_packages = @(
      @{
        code = "lobby_takeover"
        title = "Lobby takeover"
        buying_type = ""
        fixed_cpm = 1
        flight_fee = 0
        min_tier = "starter"
        placement = "lobby"
        enabled = $true
        sort_order = 1
        exclusive = $true
        exclusive_category = "lobby_takeover"
        lobby_takeover = $true
      }
    )
  } $token | Out-Null
} catch { $emptyBuyDenied = $true }
if (-not $emptyBuyDenied) { throw "expected lobby_takeover with empty buying_type to fail" }

Write-Host "== Phase C lobby_takeover reject by code when flag false =="
$codeFlagDenied = $false
try {
  Invoke-Json PUT "/console/progression" @{
    ad_packages = @(
      @{
        code = "lobby_takeover"
        title = "Lobby takeover"
        buying_type = "reservation"
        fixed_cpm = 1
        flight_fee = 0
        min_tier = "starter"
        placement = "in_match"
        enabled = $true
        sort_order = 1
        exclusive = $true
        exclusive_category = "lobby_takeover"
        lobby_takeover = $false
      }
    )
  } $token | Out-Null
} catch { $codeFlagDenied = $true }
if (-not $codeFlagDenied) { throw "expected code lobby_takeover with flag false + in_match to fail" }

Write-Host "== Phase C serve stamps lobby_takeover when package matches =="
# Any served row whose package_code is lobby_takeover must stamp lobby_takeover=true.
$stampServe = Invoke-Json GET "/ads/serve?viewer_key=e2e-takeover-stamp&session_key=e2e-takeover-sess&country=ET" $null $null
foreach ($row in @($stampServe.campaigns)) {
  if (([string]$row.package_code).ToLower() -eq "lobby_takeover" -and $row.lobby_takeover -ne $true) {
    throw "serve missing lobby_takeover stamp for package lobby_takeover"
  }
}

Write-Host "== placement keys from player_chrome (DB) =="
$pbPlace = Invoke-Json GET "/ads/playback" $null $null
$placeInMatch = [string]$pbPlace.player_chrome.placement_in_match
$placeLobby = [string]$pbPlace.player_chrome.placement_lobby
if (-not $placeInMatch -or -not $placeLobby) { throw "placement keys missing from player_chrome" }

Write-Host "== impression in_match (DB placement) =="
Invoke-Json POST "/ads/campaigns/$campId/impression" @{
  viewer_key = "e2e-viewer-flex"
  session_key = "e2e-sess-flex"
  placement = $placeInMatch
} $null | Out-Null

Write-Host "== daily cap blocks further eligibility =="
# Prior impressions already recorded for this campaign; cap=1 must exhaust it.
Invoke-Json PATCH "/console/ads/campaigns/$campId/schedule" @{
  schedule_enabled = $true
  first_show_after_seconds = 0
  interval_seconds = 60
  non_skippable_seconds = 10
  daily_impression_cap = 1
  weekly_impression_cap = $null
  monthly_impression_cap = $null
  yearly_impression_cap = $null
} $token | Out-Null
$eligCap = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 20
  seconds_since_last_ad = 999
  viewer_key = "e2e-viewer-cap-elig"
  session_key = "e2e-sess-cap-elig"
  country = $geoCountry
} $null
if ($eligCap.show -eq $true -and $eligCap.campaign.id -eq $campId) {
  throw "expected daily cap to block this campaign"
}
# When no other ET inventory exists, eligibility should report period_cap_reached.
if ($eligCap.show -ne $true) {
  if ([string]$eligCap.reason -ne "period_cap_reached") { throw ("expected reason period_cap_reached got " + $eligCap.reason) }
  if ([int]$eligCap.next_check_after_seconds -lt 1) { throw "expected next_check until period reset" }
}

Write-Host "== weekly cap blocks (same impression counts as weekly=1) =="
Invoke-Json PATCH "/console/ads/campaigns/$campId/schedule" @{
  schedule_enabled = $true
  first_show_after_seconds = 0
  interval_seconds = 60
  non_skippable_seconds = 10
  daily_impression_cap = $null
  weekly_impression_cap = 1
  monthly_impression_cap = $null
  yearly_impression_cap = $null
} $token | Out-Null
$eligWeek = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 20
  seconds_since_last_ad = 999
  viewer_key = "e2e-viewer-week-cap"
  session_key = "e2e-sess-week-cap"
  country = $geoCountry
} $null
if ($eligWeek.show -eq $true -and $eligWeek.campaign.id -eq $campId) {
  throw "expected weekly cap to block this campaign"
}
if ($eligWeek.show -ne $true -and [string]$eligWeek.reason -ne "period_cap_reached") {
  throw ("expected weekly period_cap_reached got " + $eligWeek.reason)
}

Write-Host "== monthly cap blocks (monthly=1) =="
Invoke-Json PATCH "/console/ads/campaigns/$campId/schedule" @{
  schedule_enabled = $true
  first_show_after_seconds = 0
  interval_seconds = 60
  non_skippable_seconds = 10
  daily_impression_cap = $null
  weekly_impression_cap = $null
  monthly_impression_cap = 1
  yearly_impression_cap = $null
} $token | Out-Null
$eligMonth = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 20
  seconds_since_last_ad = 999
  viewer_key = "e2e-viewer-month-cap"
  session_key = "e2e-sess-month-cap"
  country = $geoCountry
} $null
if ($eligMonth.show -eq $true -and $eligMonth.campaign.id -eq $campId) {
  throw "expected monthly cap to block this campaign"
}
if ($eligMonth.show -ne $true -and [string]$eligMonth.reason -ne "period_cap_reached") {
  throw ("expected monthly period_cap_reached got " + $eligMonth.reason)
}

Write-Host "== yearly cap blocks (yearly=1) =="
Invoke-Json PATCH "/console/ads/campaigns/$campId/schedule" @{
  schedule_enabled = $true
  first_show_after_seconds = 0
  interval_seconds = 60
  non_skippable_seconds = 10
  daily_impression_cap = $null
  weekly_impression_cap = $null
  monthly_impression_cap = $null
  yearly_impression_cap = 1
} $token | Out-Null
$eligYear = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 20
  seconds_since_last_ad = 999
  viewer_key = "e2e-viewer-year-cap"
  session_key = "e2e-sess-year-cap"
  country = $geoCountry
} $null
if ($eligYear.show -eq $true -and $eligYear.campaign.id -eq $campId) {
  throw "expected yearly cap to block this campaign"
}
if ($eligYear.show -ne $true -and [string]$eligYear.reason -ne "period_cap_reached") {
  throw ("expected yearly period_cap_reached got " + $eligYear.reason)
}

Write-Host "== session_key freq cap (campaign per session = 1) =="
# Period caps already exhausted this campaign; raise them so session cap is the gate.
Invoke-Json PATCH "/console/ads/campaigns/$campId/schedule" @{
  schedule_enabled = $true
  first_show_after_seconds = 0
  interval_seconds = 60
  non_skippable_seconds = 10
  daily_impression_cap = 100
  weekly_impression_cap = $null
  monthly_impression_cap = $null
  yearly_impression_cap = $null
} $token | Out-Null
$pbSess = Invoke-Json GET "/console/ads/playback" $null $token
$pbS0 = $pbSess.playback
$sessBody = New-PlaybackPutBody $pbS0 10 $pbS0.first_show_after_game_seconds $pbS0.default_interval_seconds
$sessBody.freq_cap_campaign_per_session = 1
$sessBody.freq_cap_placement_per_session = 0
$sessBody.freq_cap_min_gap_seconds = 0
Invoke-Json PUT "/console/ads/playback" $sessBody $token | Out-Null
$sessKey = "e2e-sess-" + [guid]::NewGuid().ToString("N")
$sessViewer = "e2e-viewer-sess-" + [guid]::NewGuid().ToString("N").Substring(0, 8)
Invoke-Json POST "/ads/campaigns/$campId/impression" @{
  viewer_key = $sessViewer
  session_key = $sessKey
  placement = $placeInMatch
} $null | Out-Null
$eligSess = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 20
  seconds_since_last_ad = 999
  viewer_key = $sessViewer
  session_key = $sessKey
  country = $geoCountry
} $null
if ($eligSess.show -eq $true -and $eligSess.campaign.id -eq $campId) {
  throw "expected session freq cap to block this campaign"
}
if ($eligSess.show -ne $true -and [string]$eligSess.reason -ne "viewer_freq_cap") {
  throw ("expected reason viewer_freq_cap got " + $eligSess.reason)
}
# Second impress with same session must be rejected (defense in depth on impression).
$impSessDenied = $false
try {
  Invoke-Json POST "/ads/campaigns/$campId/impression" @{
    viewer_key = $sessViewer
    session_key = $sessKey
    placement = $placeInMatch
  } $null | Out-Null
} catch { $impSessDenied = $true }
if (-not $impSessDenied) { throw "expected session-capped impression to fail" }

Write-Host "== lobby session_key freq cap via serve =="
# Fresh viewer/session; lobby placement impress then serve must omit this campaign.
$lobbySessKey = "e2e-lobby-sess-" + [guid]::NewGuid().ToString("N")
$lobbyViewer = "e2e-viewer-lobby-" + [guid]::NewGuid().ToString("N").Substring(0, 8)
$serveQ = "viewer_key=$lobbyViewer&session_key=$lobbySessKey&country=$geoCountry"
$serveBefore = Invoke-Json GET "/ads/serve?$serveQ" $null $null
$serveIdsBefore = @()
if ($serveBefore.campaigns) { $serveIdsBefore = @($serveBefore.campaigns | ForEach-Object { [string]$_.id }) }
elseif ($serveBefore -is [System.Array]) { $serveIdsBefore = @($serveBefore | ForEach-Object { [string]$_.id }) }
if ($serveIdsBefore -notcontains $campId) {
  throw "expected lobby serve to include campaign before session impress"
}
Invoke-Json POST "/ads/campaigns/$campId/impression" @{
  viewer_key = $lobbyViewer
  session_key = $lobbySessKey
  placement = $placeLobby
} $null | Out-Null
$serveAfter = Invoke-Json GET "/ads/serve?$serveQ" $null $null
$serveIdsAfter = @()
if ($serveAfter.campaigns) { $serveIdsAfter = @($serveAfter.campaigns | ForEach-Object { [string]$_.id }) }
elseif ($serveAfter -is [System.Array]) { $serveIdsAfter = @($serveAfter | ForEach-Object { [string]$_.id }) }
if ($serveIdsAfter -contains $campId) {
  throw "expected lobby serve to omit session-capped campaign"
}

Write-Host "== console playback PUT rejects partial body =="
$partialDenied = $false
try {
  Invoke-Json PUT "/console/ads/playback" @{
    non_skippable_seconds = 10
    first_show_after_game_seconds = [int]$pbS0.first_show_after_game_seconds
    default_interval_seconds = [int]$pbS0.default_interval_seconds
  } $token | Out-Null
} catch { $partialDenied = $true }
if (-not $partialDenied) { throw "expected partial playback PUT to fail" }

# Restore prior freq caps (full replace).
Invoke-Json PUT "/console/ads/playback" (New-PlaybackPutBody $pbS0 10 $pbS0.first_show_after_game_seconds $pbS0.default_interval_seconds) $token | Out-Null

Write-Host "== serve empty without viewer_key or session_key =="
$serveNoKeys = Invoke-Json GET "/ads/serve?country=$geoCountry" $null $null
$serveNoKeyIds = @()
if ($serveNoKeys.campaigns) { $serveNoKeyIds = @($serveNoKeys.campaigns) }
elseif ($serveNoKeys -is [System.Array]) { $serveNoKeyIds = @($serveNoKeys) }
if (@($serveNoKeyIds).Count -gt 0) { throw "expected empty campaigns without viewer/session keys" }
$serveNoSess = Invoke-Json GET "/ads/serve?viewer_key=e2e-nokeys-viewer&country=$geoCountry" $null $null
$serveNoSessIds = @()
if ($serveNoSess.campaigns) { $serveNoSessIds = @($serveNoSess.campaigns) }
elseif ($serveNoSess -is [System.Array]) { $serveNoSessIds = @($serveNoSess) }
if (@($serveNoSessIds).Count -gt 0) { throw "expected empty campaigns without session_key" }

Write-Host "== impression rejects without session_key =="
$impNoSessDenied = $false
try {
  Invoke-Json POST "/ads/campaigns/$campId/impression" @{
    viewer_key = "e2e-viewer-nokeys"
    placement = $placeLobby
  } $null | Out-Null
} catch { $impNoSessDenied = $true }
if (-not $impNoSessDenied) { throw "expected impression without session_key to fail" }

Write-Host "== impression rejects without viewer_key =="
$impNoViewerDenied = $false
try {
  Invoke-Json POST "/ads/campaigns/$campId/impression" @{
    session_key = "e2e-sess-noviewer"
    placement = $placeLobby
  } $null | Out-Null
} catch { $impNoViewerDenied = $true }
if (-not $impNoViewerDenied) { throw "expected impression without viewer_key to fail" }

Write-Host "== eligibility requires viewer_key + session_key =="
$eligNoKeys = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 20
  seconds_since_last_ad = 999
  country = $geoCountry
} $null
if ($eligNoKeys.show -eq $true) { throw "expected eligibility without keys to not show" }
if ([string]$eligNoKeys.reason -ne "viewer_keys_required") {
  throw ("expected reason viewer_keys_required got " + $eligNoKeys.reason)
}
$eligNoSess = Invoke-Json POST "/ads/in-match/eligibility" @{
  game_elapsed_seconds = 20
  seconds_since_last_ad = 999
  viewer_key = "e2e-viewer-elig-nokeys"
  country = $geoCountry
} $null
if ($eligNoSess.show -eq $true) { throw "expected eligibility without session_key to not show" }
if ([string]$eligNoSess.reason -ne "viewer_keys_required") {
  throw ("expected reason viewer_keys_required got " + $eligNoSess.reason)
}

Write-Host "== me/permissions includes ads_chrome =="
$me2 = Invoke-Json GET "/console/me/permissions" $null $token
if (-not $me2.ads_chrome.lacks_permissions) { throw "ads_chrome.lacks_permissions missing" }

Write-Host "E2E OK"
