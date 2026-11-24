import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:dama_mobile/core/network/api_config.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Live board WebSocket client for 10x10 match moves.
///
/// Auto-reconnects after proxy idle kills so optimistic AI/PvP turns cannot
/// freeze the board waiting on a dead socket.
class GameWsClient {
  GameWsClient({
    String? origin,
    this.connectionErrorMessage = '',
  }) : origin = origin ?? ApiConfig.baseUrl;

  final String origin;
  String connectionErrorMessage;
  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  Timer? _pingTimer;
  Timer? _reconnectTimer;
  final _controller = StreamController<Map<String, dynamic>>.broadcast();

  bool _disposed = false;
  bool _wantConnected = false;
  bool _spectate = false;
  String? _token;
  String? _gameId;
  int _attempt = 0;

  Stream<Map<String, dynamic>> get messages => _controller.stream;

  /// True while a channel is open (best-effort; sink errors still fail closed).
  bool get isConnected => _channel != null;

  void _startPing() {
    _pingTimer?.cancel();
    // Keepalive: proxy idle kills ~2–3m silent sockets → mid-game move failures.
    _pingTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (_channel == null) return;
      try {
        ping();
      } catch (_) {}
    });
  }

  void _markDead() {
    _pingTimer?.cancel();
    _pingTimer = null;
    _sub = null;
    _channel = null;
  }

  void _scheduleReconnect() {
    if (_disposed || !_wantConnected) return;
    _reconnectTimer?.cancel();
    final delayMs = math.min(1000 * math.pow(2, _attempt).toInt(), 8000);
    _attempt += 1;
    _reconnectTimer = Timer(Duration(milliseconds: delayMs), () {
      if (_disposed || !_wantConnected) return;
      unawaited(_open());
    });
  }

  Future<void> _open() async {
    if (_disposed || !_wantConnected) return;
    final gameId = (_gameId ?? '').trim();
    if (gameId.isEmpty) return;

    await _teardownSocket(cancelReconnect: false);

    final Uri uri;
    if (_spectate) {
      final q = StringBuffer('/ws/spectate?game_id=$gameId');
      final token = (_token ?? '').trim();
      if (token.isNotEmpty) q.write('&token=$token');
      uri = Uri.parse(origin.replaceFirst('http', 'ws') + q.toString());
    } else {
      final token = (_token ?? '').trim();
      uri = Uri.parse(
        origin.replaceFirst('http', 'ws') +
            '/ws/game?token=$token&game_id=$gameId',
      );
    }

    try {
      _channel = WebSocketChannel.connect(uri);
    } catch (_) {
      _markDead();
      if (!_controller.isClosed) {
        _controller.add({
          'type': 'error',
          'error': connectionErrorMessage,
        });
      }
      _scheduleReconnect();
      return;
    }

    _startPing();
    _sub = _channel!.stream.listen(
      (event) {
        if (event is String) {
          try {
            final map = jsonDecode(event) as Map<String, dynamic>;
            if (map['type'] == 'pong') return;
            if (!_controller.isClosed) _controller.add(map);
          } catch (_) {
            if (!_controller.isClosed) {
              _controller.add({'type': 'raw', 'data': event});
            }
          }
        }
      },
      onError: (_) {
        _markDead();
        if (!_controller.isClosed) {
          _controller.add({
            'type': 'error',
            'error': connectionErrorMessage,
          });
        }
        _scheduleReconnect();
      },
      onDone: () {
        _markDead();
        if (!_controller.isClosed) {
          _controller.add({'type': 'closed'});
        }
        _scheduleReconnect();
      },
      cancelOnError: true,
    );
    _attempt = 0;
    if (!_controller.isClosed) {
      _controller.add({'type': 'ws_open', 'game_id': gameId});
    }
  }

  Future<void> connectGame({
    required String token,
    required String gameId,
  }) async {
    _wantConnected = true;
    _spectate = false;
    _token = token;
    _gameId = gameId;
    _attempt = 0;
    _reconnectTimer?.cancel();
    await _open();
  }

  Future<void> connectSpectate({required String gameId, String? token}) async {
    _wantConnected = true;
    _spectate = true;
    _token = token;
    _gameId = gameId;
    _attempt = 0;
    _reconnectTimer?.cancel();
    await _open();
  }

  /// Returns false when the socket is down (caller should toast / resync).
  bool sendMove(Map<String, dynamic> move) {
    final ch = _channel;
    if (ch == null) return false;
    try {
      ch.sink.add(jsonEncode({'type': 'move', ...move}));
      return true;
    } catch (_) {
      _markDead();
      _scheduleReconnect();
      return false;
    }
  }

  /// Raw game-room envelope (e.g. `clock_flag`). No-op when disconnected.
  void send(Map<String, dynamic> payload) {
    final ch = _channel;
    if (ch == null) return;
    try {
      ch.sink.add(jsonEncode(payload));
    } catch (_) {
      _markDead();
      _scheduleReconnect();
    }
  }

  void ping() {
    final ch = _channel;
    if (ch == null) return;
    ch.sink.add('ping');
  }

  Future<void> _teardownSocket({required bool cancelReconnect}) async {
    if (cancelReconnect) {
      _reconnectTimer?.cancel();
      _reconnectTimer = null;
    }
    _pingTimer?.cancel();
    _pingTimer = null;
    await _sub?.cancel();
    _sub = null;
    try {
      await _channel?.sink.close();
    } catch (_) {}
    _channel = null;
  }

  Future<void> disconnect() async {
    _wantConnected = false;
    await _teardownSocket(cancelReconnect: true);
  }

  Future<void> dispose() async {
    _disposed = true;
    _wantConnected = false;
    await _teardownSocket(cancelReconnect: true);
    await _controller.close();
  }
}
