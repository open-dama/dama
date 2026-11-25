import 'dart:ui';

import 'package:dama_mobile/core/theme/dama_theme.dart';
import 'package:dama_mobile/core/ui/country_flag.dart';
import 'package:dama_mobile/widgets/dama_user_avatar.dart';
import 'package:dama_mobile/widgets/host_trust_badge.dart';
import 'package:flutter/material.dart';

class MatchIntroPlayer {
  const MatchIntroPlayer({
    required this.username,
    this.avatarUrl,
    this.countryCode,
    this.hostTrustTier,
    this.hostTrustBadge,
  });

  final String username;
  final String? avatarUrl;
  final String? countryCode;
  final String? hostTrustTier;
  final String? hostTrustBadge;
}

/// Full-board esports VS intro for [durationMs], then calls [onDone].
/// When [persistent] is true, stays until the widget is removed (no auto-dismiss).
class MatchIntroOverlay extends StatefulWidget {
  const MatchIntroOverlay({
    super.key,
    required this.vsLabel,
    required this.ariaLabel,
    required this.durationMs,
    required this.top,
    required this.bottom,
    this.onDone,
    this.startingLabel = '',
    this.onShow,
    this.persistent = false,
    this.reserveBottom = false,
  });

  final String vsLabel;
  final String ariaLabel;
  final String startingLabel;
  final int durationMs;
  final MatchIntroPlayer top;
  final MatchIntroPlayer bottom;
  final VoidCallback? onDone;
  final VoidCallback? onShow;

  /// Pause cover: ignore [durationMs] auto-dismiss; stay until unmounted.
  final bool persistent;

  /// Extra bottom inset so nested pause meta does not cover the bottom seat name.
  final bool reserveBottom;

  @override
  State<MatchIntroOverlay> createState() => _MatchIntroOverlayState();
}

class _MatchIntroOverlayState extends State<MatchIntroOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    if (widget.persistent) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onShow?.call();
      });
      return;
    }
    // Fail closed: duration must come from DB chrome (no invented default).
    if (widget.durationMs <= 0) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.onDone?.call();
      });
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.onShow?.call();
    });
    Future<void>.delayed(Duration(milliseconds: widget.durationMs), () {
      if (mounted) widget.onDone?.call();
    });
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  Widget _seat(
    MatchIntroPlayer p,
    DamaColors tokens,
    Color onSurface, {
    required bool isDark,
    required double avatarSize,
    required double nameFontSize,
    required double maxNameWidth,
  }) {
    final thumb = (p.avatarUrl ?? '').trim();
    // Light: white. Dark: primary text (seat / who-vs-who names).
    final nameColor = isDark ? onSurface : Colors.white;
    final radius = avatarSize / 2;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: avatarSize,
          height: avatarSize,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(avatarSize >= 80 ? 14 : 10),
            border: Border.all(color: tokens.brand, width: 2.5),
            boxShadow: [
              BoxShadow(
                color: tokens.brand.withValues(alpha: 0.45),
                blurRadius: avatarSize >= 80 ? 22 : 14,
                spreadRadius: 1,
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: DamaUserAvatar(
            imageUrl: thumb.isNotEmpty ? thumb : null,
            radius: radius,
          ),
        ),
        SizedBox(height: avatarSize >= 80 ? 10 : 6),
        // Bound the row so Flexible+ellipsis actually truncates on phone/tablet.
        ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxNameWidth),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.max,
            children: [
              CountryFlag(
                  code: p.countryCode, height: nameFontSize >= 18 ? 14 : 12),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  p.username,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  softWrap: false,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: nameFontSize,
                    fontWeight: FontWeight.w800,
                    color: nameColor,
                  ),
                ),
              ),
            ],
          ),
        ),
        if ((p.hostTrustBadge ?? '').trim().isNotEmpty) ...[
          const SizedBox(height: 4),
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxNameWidth),
            child: HostTrustBadge(
              label: p.hostTrustBadge,
              tier: p.hostTrustTier,
              fontSize: nameFontSize >= 18 ? 11 : 9,
              onMedia: true,
              dense: true,
            ),
          ),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    // Zero-duration timed intro: IgnorePointer so Positioned.fill cannot leave an
    // empty hit target over the board (start→abandon with zero moves).
    if (!widget.persistent && widget.durationMs <= 0) {
      return const IgnorePointer(child: SizedBox.shrink());
    }
    final tokens = damaColorsOf(context);
    final theme = Theme.of(context);
    final starting = widget.startingLabel.trim();
    // Full cinematic look (roster-parity 0.90 / blur 12). Timed intro stays
    // IgnorePointer so the design cannot steal board taps / freeze play.
    // Persistent pause cover still absorbs input under official/player pause.
    const blurSigma = 12.0;
    const scrimAlpha = 0.90;
    final visual = SizedBox.expand(
      child: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
          child: ColoredBox(
            color: theme.scaffoldBackgroundColor.withValues(alpha: scrimAlpha),
            child: LayoutBuilder(
              builder: (context, constraints) {
                // Square board plane is often ~300–420px on phone/tablet - scale down.
                final shortSide = constraints.maxHeight < constraints.maxWidth
                    ? constraints.maxHeight
                    : constraints.maxWidth;
                final compact = shortSide < 380;
                final cozy = shortSide < 460;
                final avatarSize = compact
                    ? 52.0
                    : cozy
                        ? 72.0
                        : 92.0;
                final nameFontSize = compact
                    ? 14.0
                    : cozy
                        ? 16.0
                        : 18.0;
                final vsFontSize = compact
                    ? 22.0
                    : cozy
                        ? 28.0
                        : 32.0;
                final maxNameWidth =
                    (constraints.maxWidth - 24).clamp(120.0, 288.0);
                final hPad = compact ? 10.0 : 14.0;
                final vGap = compact ? 10.0 : (cozy ? 14.0 : 18.0);
                final bottomReserve =
                    widget.reserveBottom ? (compact ? 88.0 : 104.0) : 0.0;

                return Stack(
                  children: [
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: RadialGradient(
                            center: const Alignment(0, -0.1),
                            radius: 0.9,
                            colors: [
                              tokens.brand.withValues(alpha: 0.28),
                              Colors.transparent,
                            ],
                          ),
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment.center,
                      child: FadeTransition(
                        opacity: Tween(begin: 0.25, end: 0.85).animate(_pulse),
                        child: Container(
                          height: 1.5,
                          margin: EdgeInsets.symmetric(horizontal: hPad + 22),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                Colors.transparent,
                                tokens.brand.withValues(alpha: 0.9),
                                Colors.transparent,
                              ],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: tokens.brand.withValues(alpha: 0.55),
                                blurRadius: 16,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    // Scroll safety on very short boards; content stays centered when it fits.
                    Center(
                      child: SingleChildScrollView(
                        padding: EdgeInsets.fromLTRB(
                          hPad,
                          compact ? 8 : 12,
                          hPad,
                          (compact ? 8 : 12) + bottomReserve,
                        ),
                        child: ConstrainedBox(
                          constraints: BoxConstraints(
                            minHeight: (constraints.maxHeight -
                                    (compact ? 16 : 24) -
                                    bottomReserve)
                                .clamp(0.0, double.infinity),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (starting.isNotEmpty)
                                Padding(
                                  padding: EdgeInsets.only(bottom: vGap),
                                  child: FadeTransition(
                                    opacity: Tween(begin: 0.55, end: 1.0)
                                        .animate(_pulse),
                                    child: Text(
                                      starting.toUpperCase(),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: compact ? 9 : 11,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: compact ? 2.4 : 3.2,
                                        // Light: brand. Dark: primary text for clear visibility.
                                        color:
                                            theme.brightness == Brightness.dark
                                                ? theme.colorScheme.onSurface
                                                : tokens.brand,
                                      ),
                                    ),
                                  ),
                                ),
                              _seat(
                                widget.top,
                                tokens,
                                theme.colorScheme.onSurface,
                                isDark: theme.brightness == Brightness.dark,
                                avatarSize: avatarSize,
                                nameFontSize: nameFontSize,
                                maxNameWidth: maxNameWidth,
                              ),
                              Padding(
                                padding: EdgeInsets.symmetric(vertical: vGap),
                                child: Stack(
                                  alignment: Alignment.center,
                                  children: [
                                    ScaleTransition(
                                      scale: Tween(begin: 0.85, end: 1.25)
                                          .animate(_pulse),
                                      child: Container(
                                        width: compact ? 48 : 72,
                                        height: compact ? 48 : 72,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: tokens.brand
                                              .withValues(alpha: 0.18),
                                        ),
                                      ),
                                    ),
                                    Stack(
                                      alignment: Alignment.center,
                                      children: [
                                        Text(
                                          widget.vsLabel.toUpperCase(),
                                          style: TextStyle(
                                            fontSize: vsFontSize,
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: compact ? 3 : 5,
                                            foreground: Paint()
                                              ..style = PaintingStyle.stroke
                                              ..strokeWidth = 5
                                              // Theme card (not hard white) for dark/light pause+intro.
                                              ..color = tokens.card,
                                          ),
                                        ),
                                        Text(
                                          widget.vsLabel.toUpperCase(),
                                          style: TextStyle(
                                            fontSize: vsFontSize,
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: compact ? 3 : 5,
                                            color: tokens.brand,
                                            shadows: [
                                              Shadow(
                                                color: tokens.brand
                                                    .withValues(alpha: 0.7),
                                                blurRadius: 18,
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              _seat(
                                widget.bottom,
                                tokens,
                                theme.colorScheme.onSurface,
                                isDark: theme.brightness == Brightness.dark,
                                avatarSize: avatarSize,
                                nameFontSize: nameFontSize,
                                maxNameWidth: maxNameWidth,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );

    return Semantics(
      label: widget.ariaLabel,
      child: widget.persistent
          ? AbsorbPointer(absorbing: true, child: visual)
          : IgnorePointer(ignoring: true, child: visual),
    );
  }
}
