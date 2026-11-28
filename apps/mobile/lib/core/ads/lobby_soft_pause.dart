import 'package:flutter/foundation.dart';

/// Phase B: when soft interstitial is open, lobby tile rotation must pause
/// so only one lobby creative is active (web shell-chrome lobbySoftOpen parity).
class LobbySoftPause {
  LobbySoftPause._();

  static final ValueNotifier<bool> open = ValueNotifier<bool>(false);
}
