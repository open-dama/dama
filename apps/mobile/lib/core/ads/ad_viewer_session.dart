import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

/// Stable device viewer id + one app-process session id shared by lobby + in-match.
/// Session caps must use the same key across placements in one process.
class AdViewerSession {
  AdViewerSession._();

  static String? _processSessionKey;

  /// Survives app restarts (SharedPreferences).
  static Future<String> viewerKey() async {
    const key = 'dama_ad_viewer';
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(key);
    if (existing != null && existing.isNotEmpty) return existing;
    final created =
        'mobile_${DateTime.now().microsecondsSinceEpoch}_${Random().nextInt(1 << 30)}';
    await prefs.setString(key, created);
    return created;
  }

  /// Lives for this app process only. Shared by GeoAdSlot + InMatchAdOverlay.
  static Future<String> sessionKey() async {
    if (_processSessionKey != null && _processSessionKey!.isNotEmpty) {
      return _processSessionKey!;
    }
    final created =
        'sess_${DateTime.now().microsecondsSinceEpoch}_${Random().nextInt(1 << 30)}';
    _processSessionKey = created;
    return created;
  }
}
