import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_chess/chess_api_client.dart';
import 'package:royal_club_chess/chess_game_session.dart';

class _FakeChessApiClient extends ChessApiClient {
  _FakeChessApiClient() : super(baseUri: Uri.parse('http://localhost'), accessToken: 'test');

  @override
  Future<Map<String, dynamic>> game(String gameId) async => {
        'gameId': gameId,
        'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'status': 'active',
        'legalMoves': ['e2e4', 'g1f3'],
        'isHost': true,
        'settings': {'voiceEnabled': true},
        'clock': {
          'whiteMs': 300000,
          'blackMs': 300000,
          'active': 'white',
          'lastStartedAt': DateTime.now().millisecondsSinceEpoch,
        },
        'players': {
          'white': {'username': 'white_player'},
          'black': {'username': 'black_player'},
        },
      };

  @override
  Future<List<Map<String, dynamic>>> chatHistory(String gameId, {String afterId = '0'}) async => [
        {'username': 'white_player', 'message': 'hello', 'createdAt': '2026-10-31T10:00:00.000Z'},
      ];

  @override
  Future<Map<String, dynamic>> pendingDrawOffer(String gameId) async => {
        'pending': false,
        'offeredByMe': false,
      };

  @override
  Future<Map<String, dynamic>> playerProfileByUsername(String username) async => {
        'username': username,
        'level': 4,
        'xp': 950,
        'rating': 1320,
        'games': 10,
        'wins': 6,
        'losses': 3,
        'draws': 1,
        'winRate': 60.0,
      };
}

void main() {
  test('game session refresh hydrates game, profiles, chat, clock and room voice settings', () async {
    final session = ChessGameSession(api: _FakeChessApiClient(), gameId: '99');
    await session.refresh();

    expect(session.fen, contains(' w '));
    expect(session.legalMoves, contains('e2e4'));
    expect(session.whiteUsername, 'white_player');
    expect(session.blackUsername, 'black_player');
    expect(session.whiteProfile?.rating, 1320);
    expect(session.blackProfile?.level, 4);
    expect(session.messages.single.text, 'hello');
    expect(session.voiceEnabled, isTrue);
    expect(session.isHost, isTrue);
    expect(session.activeSide, 'white');
    expect(session.whiteClock.inMilliseconds, lessThanOrEqualTo(300000));
    session.dispose();
  });
}
