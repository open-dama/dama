import 'dart:async';

import 'package:dama_mobile/features/wallet/wallet_cubit.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

/// After external Chapa/Paddle browser checkout, refresh wallet on app resume.
/// Webhook still credits; this only updates local balance UX.
class WalletCheckoutResumeRefresher extends StatefulWidget {
  const WalletCheckoutResumeRefresher({super.key, required this.child});

  final Widget child;

  @override
  State<WalletCheckoutResumeRefresher> createState() =>
      _WalletCheckoutResumeRefresherState();
}

class _WalletCheckoutResumeRefresherState
    extends State<WalletCheckoutResumeRefresher> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || !mounted) return;
    // Fail closed if provider was disposed mid-resume (never crash enroll/join hosts).
    try {
      unawaited(context.read<WalletCubit>().refresh(force: true));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
