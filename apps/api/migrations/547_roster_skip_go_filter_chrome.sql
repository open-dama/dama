-- Soft-fill chrome for cup roster skip/go filters (lobby + admin/manage Players).
-- Idempotent. Labels only - paging uses existing pagination_chrome + list_page_size.

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'detail_players_filter_all',
  COALESCE(NULLIF(trim(value->>'detail_players_filter_all'), ''), 'All'),
  'detail_players_filter_status_label',
  COALESCE(NULLIF(trim(value->>'detail_players_filter_status_label'), ''), 'Status'),
  'detail_players_filter_checked_in_label',
  COALESCE(NULLIF(trim(value->>'detail_players_filter_checked_in_label'), ''), 'Check-in'),
  'detail_players_filter_checked_in',
  COALESCE(NULLIF(trim(value->>'detail_players_filter_checked_in'), ''), 'Checked in'),
  'detail_players_filter_not_checked_in',
  COALESCE(NULLIF(trim(value->>'detail_players_filter_not_checked_in'), ''), 'Not checked in')
),
  updated_at = NOW()
WHERE key IN ('tournament_chrome', 'events_admin_chrome');

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'players_filter_all',
  COALESCE(NULLIF(trim(value->>'players_filter_all'), ''), 'All'),
  'players_filter_status_label',
  COALESCE(NULLIF(trim(value->>'players_filter_status_label'), ''), 'Status'),
  'players_filter_checked_in_label',
  COALESCE(NULLIF(trim(value->>'players_filter_checked_in_label'), ''), 'Check-in'),
  'players_filter_checked_in',
  COALESCE(NULLIF(trim(value->>'players_filter_checked_in'), ''), 'Checked in'),
  'players_filter_not_checked_in',
  COALESCE(NULLIF(trim(value->>'players_filter_not_checked_in'), ''), 'Not checked in')
),
  updated_at = NOW()
WHERE key = 'events_organizer_chrome';

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'lobby_roster_filter_all',
  COALESCE(NULLIF(trim(value->>'lobby_roster_filter_all'), ''), 'All'),
  'lobby_roster_filter_checked_in',
  COALESCE(NULLIF(trim(value->>'lobby_roster_filter_checked_in'), ''), 'Checked in'),
  'lobby_roster_filter_not_checked_in',
  COALESCE(NULLIF(trim(value->>'lobby_roster_filter_not_checked_in'), ''), 'Not checked in')
),
  updated_at = NOW()
WHERE key IN ('tournaments_player_chrome', 'events_player_chrome');
