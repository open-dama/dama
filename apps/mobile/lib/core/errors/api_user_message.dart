import 'dart:convert';

import 'package:dama_mobile/core/types/types.dart';

/// User-facing API/chrome messaging helpers (web/admin chromeOnlyToast parity).

/// True when [msg] looks like a raw API JSON envelope - never show in UI.
bool isRawApiJsonEnvelope(String msg) {
  final t = msg.trim();
  if (t.isEmpty) return false;
  // Full JSON body OR chrome text that accidentally appended a JSON blob.
  if (t.contains('"error_key"') || t.contains("'error_key'")) return true;
  if ((t.startsWith('{') || t.startsWith('[')) &&
      (t.contains('"error"') || t.contains("'error'"))) {
    return true;
  }
  return false;
}

/// Returns trimmed chrome/user copy, or null when empty / JSON envelope.
String? chromeOnlyUserMessage(String? msg) {
  final t = (msg ?? '').trim();
  if (t.isEmpty || isRawApiJsonEnvelope(t)) return null;
  return t;
}

/// Map checkout provider `error_key` → wallet chrome (single professional string).
String checkoutChromeMessage({
  required String responseBody,
  required String? checkoutFailed,
  required String? checkoutUnavailable,
}) {
  final failed = (checkoutFailed ?? '').trim();
  final unavailable = (checkoutUnavailable ?? '').trim();
  final fallback = failed.isNotEmpty ? failed : unavailable;
  try {
    final decoded = _tryDecodeMap(responseBody);
    if (decoded == null) return fallback;
    final key = (decoded['error_key']?.toString() ?? '').trim();
    if (key == 'checkout_unavailable' || key == 'checkout_failed') {
      if (failed.isNotEmpty) return failed;
      if (unavailable.isNotEmpty) return unavailable;
    }
    // Never surface raw `error` JSON body - chrome fallback only.
    return fallback;
  } catch (_) {
    return fallback;
  }
}

/// Parse REST `error_key` from a response body (never return raw JSON to UI).
String apiErrorKeyFromBody(String responseBody) {
  final decoded = _tryDecodeMap(responseBody);
  if (decoded != null) {
    final key = (decoded['error_key']?.toString() ?? '').trim();
    if (key.isNotEmpty) return key;
  }
  // Hybrid chrome+JSON or unparsed bodies - pull error_key via regex.
  final t = responseBody.trim();
  final m = RegExp(r'"error_key"\s*:\s*"([^"]+)"').firstMatch(t) ??
      RegExp(r"'error_key'\s*:\s*'([^']+)'").firstMatch(t);
  if (m != null) return (m.group(1) ?? '').trim();
  // Legacy English-only age bodies without a parseable key.
  final lower = t.toLowerCase();
  if (lower.contains('age verification') || lower.contains('age_required')) {
    return 'age_required';
  }
  return '';
}

const _cashGateKeys = {
  'age_required',
  'phone_kyc',
  'jurisdiction',
  'cash_disabled',
  'unavailable',
  'country_required',
  'locate_required',
  'locate_stale',
};

/// True when REST `error_key` is a cash/RMG gate (never map to enroll_failed).
bool isCashGateErrorKey(String key) => _cashGateKeys.contains(key.trim());

/// Map cash/RMG gate `error_key` → cash chrome (enroll/join/wallet parity).
/// Known cash keys never fall through to enroll_failed / raw API English.
String cashGateChromeFromBody({
  required String responseBody,
  required CashRmgChrome? cashChrome,
  required String fallback,
}) {
  final fb = fallback.trim();
  final key = apiErrorKeyFromBody(responseBody);
  if (key.isEmpty) return fb;
  if (cashChrome == null) {
    // Known gate without chrome yet: empty (caller opens age/phone UI; never enroll_failed).
    return _cashGateKeys.contains(key) ? '' : fb;
  }
  switch (key) {
    case 'age_required':
      // DOB gate owns age UX - never snack age_required_error / enroll_failed.
      return '';
    case 'phone_kyc':
      return cashChrome.phoneKycRequiredError.trim();
    case 'jurisdiction':
      return cashChrome.jurisdictionBlockedError.trim();
    case 'cash_disabled':
    case 'unavailable':
      final disabled = cashChrome.cashDisabledError.trim();
      if (disabled.isNotEmpty) return disabled;
      return cashChrome.cashRmgUnavailable.trim();
    case 'country_required':
      return cashChrome.countryRequiredError.trim();
    case 'locate_required':
      return cashChrome.locateRequiredError.trim();
    case 'locate_stale':
      return cashChrome.locateStaleError.trim();
    default:
      return fb;
  }
}

Map<String, dynamic>? _tryDecodeMap(String raw) {
  final t = raw.trim();
  if (!t.startsWith('{')) return null;
  final parsed = jsonDecode(t);
  if (parsed is Map<String, dynamic>) return parsed;
  if (parsed is Map) {
    return parsed.map((k, v) => MapEntry(k.toString(), v));
  }
  return null;
}
