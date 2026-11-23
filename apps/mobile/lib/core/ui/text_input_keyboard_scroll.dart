import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

/// Phone/tablet breakpoint matching web `max-lg` (1023px).
const double kDamaMobileTabletMaxWidth = 1023;

bool isDamaMobileTabletWidth(BuildContext context) {
  return MediaQuery.sizeOf(context).width <= kDamaMobileTabletMaxWidth;
}

/// Extra space under a focused text field so following CTAs stay reachable.
const double kTextFieldRevealBelow = 120;

/// Scroll the focused text field into view above the soft keyboard.
///
/// Call from [TextField.onTap] / focus listeners. Safe no-op on desktop widths
/// or when the field is not inside a [Scrollable].
void ensureTextFieldAboveKeyboard(
  BuildContext fieldContext, {
  Duration delay = const Duration(milliseconds: 280),
}) {
  if (!fieldContext.mounted) return;
  if (!isDamaMobileTabletWidth(fieldContext)) return;

  void run() {
    if (!fieldContext.mounted) return;
    if (!isDamaMobileTabletWidth(fieldContext)) return;
    Scrollable.ensureVisible(
      fieldContext,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      alignment: 0.15,
      alignmentPolicy: ScrollPositionAlignmentPolicy.keepVisibleAtEnd,
    );
  }

  // Wait for keyboard / viewInsets to settle, then ensure visible.
  SchedulerBinding.instance.addPostFrameCallback((_) {
    Future<void>.delayed(delay, run);
  });
}

/// Bottom padding = existing pad + keyboard inset (mobile/tablet only).
EdgeInsets playRailScrollPadding(
  BuildContext context, {
  EdgeInsets base = const EdgeInsets.fromLTRB(12, 12, 12, 12),
}) {
  if (!isDamaMobileTabletWidth(context)) return base;
  final kb = MediaQuery.viewInsetsOf(context).bottom;
  if (kb <= 0) return base;
  return base.copyWith(bottom: base.bottom + kb + 24);
}

/// Wraps a [TextField] so focus/tap scrolls it above the keyboard on phone/tablet.
class KeyboardAwareTextField extends StatefulWidget {
  const KeyboardAwareTextField({
    super.key,
    required this.controller,
    this.focusNode,
    this.enabled = true,
    this.decoration,
    this.onChanged,
    this.onSubmitted,
    this.onTapOutside,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.onComposeFocus,
  });

  final TextEditingController controller;
  final FocusNode? focusNode;
  final bool enabled;
  final InputDecoration? decoration;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final TapRegionCallback? onTapOutside;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;

  /// Fired when focus is gained (mobile compose-sheet open). Not fired on blur.
  final VoidCallback? onComposeFocus;

  @override
  State<KeyboardAwareTextField> createState() => _KeyboardAwareTextFieldState();
}

class _KeyboardAwareTextFieldState extends State<KeyboardAwareTextField> {
  FocusNode? _ownedNode;
  late FocusNode _node;

  @override
  void initState() {
    super.initState();
    _attachNode(widget.focusNode);
  }

  @override
  void didUpdateWidget(covariant KeyboardAwareTextField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.focusNode != widget.focusNode) {
      _detachNode(oldWidget.focusNode ?? _ownedNode);
      _attachNode(widget.focusNode);
    }
  }

  @override
  void dispose() {
    _detachNode(widget.focusNode ?? _ownedNode);
    _ownedNode?.dispose();
    super.dispose();
  }

  void _attachNode(FocusNode? external) {
    _ownedNode = external == null ? FocusNode() : null;
    _node = external ?? _ownedNode!;
    _node.addListener(_onFocusChange);
  }

  void _detachNode(FocusNode? node) {
    node?.removeListener(_onFocusChange);
  }

  void _onFocusChange() {
    if (!_node.hasFocus || !mounted) return;
    widget.onComposeFocus?.call();
    ensureTextFieldAboveKeyboard(context);
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: widget.controller,
      focusNode: _node,
      enabled: widget.enabled,
      decoration: widget.decoration,
      keyboardType: widget.keyboardType,
      textInputAction: widget.textInputAction,
      autofillHints: widget.autofillHints,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      onTapOutside: widget.onTapOutside,
      onTap: () {
        widget.onComposeFocus?.call();
        ensureTextFieldAboveKeyboard(context);
      },
    );
  }
}
