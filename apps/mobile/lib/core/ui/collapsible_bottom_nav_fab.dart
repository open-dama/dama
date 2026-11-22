import 'package:dama_mobile/core/theme/dama_theme.dart';
import 'package:flutter/material.dart';

/// Collapsed brand FAB (play-button styling). Tap expands destinations
/// left → right; tap again / outside collapses. Web [BottomNavBar] parity.
class CollapsibleBottomNavFab extends StatefulWidget {
  const CollapsibleBottomNavFab({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.destinations,
  });

  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final List<NavigationDestination> destinations;

  @override
  State<CollapsibleBottomNavFab> createState() =>
      _CollapsibleBottomNavFabState();
}

class _CollapsibleBottomNavFabState extends State<CollapsibleBottomNavFab>
    with SingleTickerProviderStateMixin {
  bool _expanded = false;
  late final AnimationController _ctrl;
  late final Animation<double> _t;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
    );
    _t = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant CollapsibleBottomNavFab oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Route / destination identity change collapses tray (web searchParams parity).
    if (oldWidget.selectedIndex != widget.selectedIndex ||
        oldWidget.destinations.length != widget.destinations.length) {
      _collapse();
    }
  }

  void _toggle() {
    setState(() {
      _expanded = !_expanded;
      if (_expanded) {
        _ctrl.forward();
      } else {
        _ctrl.reverse();
      }
    });
  }

  void _collapse() {
    if (!_expanded) return;
    setState(() {
      _expanded = false;
      _ctrl.reverse();
    });
  }

  @override
  Widget build(BuildContext context) {
    final tokens = damaColorsOf(context);
    final theme = Theme.of(context);
    final idx = widget.selectedIndex.clamp(
      0,
      widget.destinations.isEmpty ? 0 : widget.destinations.length - 1,
    );

    return TapRegion(
      onTapOutside: (_) => _collapse(),
      child: Material(
        type: MaterialType.transparency,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                FloatingActionButton(
                  heroTag: 'dama-bottom-nav-fab',
                  onPressed: _toggle,
                  backgroundColor: tokens.brand,
                  foregroundColor: tokens.onBrand,
                  elevation: 6,
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    child: Icon(
                      _expanded ? Icons.close : Icons.menu,
                      key: ValueKey<bool>(_expanded),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: AnimatedBuilder(
                    animation: _t,
                    builder: (context, child) {
                      return ClipRect(
                        child: Align(
                          alignment: Alignment.centerLeft,
                          widthFactor: _t.value.clamp(0.0, 1.0),
                          child: Opacity(
                            opacity: _t.value.clamp(0.0, 1.0),
                            child: child,
                          ),
                        ),
                      );
                    },
                    child: Material(
                      color: theme.colorScheme.surface.withValues(alpha: 0.92),
                      elevation: 6,
                      borderRadius: BorderRadius.circular(999),
                      child: Container(
                        constraints: const BoxConstraints(maxHeight: 56),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: tokens.border.withValues(alpha: 0.5),
                          ),
                        ),
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              for (var i = 0;
                                  i < widget.destinations.length;
                                  i++) ...[
                                if (i > 0) const SizedBox(width: 2),
                                _NavChip(
                                  destination: widget.destinations[i],
                                  selected: i == idx,
                                  brand: tokens.brand,
                                  onTap: () {
                                    widget.onDestinationSelected(i);
                                    _collapse();
                                  },
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavChip extends StatelessWidget {
  const _NavChip({
    required this.destination,
    required this.selected,
    required this.brand,
    required this.onTap,
  });

  final NavigationDestination destination;
  final bool selected;
  final Color brand;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = selected
        ? theme.colorScheme.onSurface
        : theme.colorScheme.onSurfaceVariant;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? brand.withValues(alpha: 0.15) : null,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconTheme(
              data: IconThemeData(size: 20, color: color),
              child: selected
                  ? (destination.selectedIcon ?? destination.icon)
                  : destination.icon,
            ),
            const SizedBox(height: 2),
            Text(
              destination.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelSmall?.copyWith(
                color: color,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
