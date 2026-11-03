import 'manch_game_state.dart';

/// Single source of truth for the fixed Iranian Manch route and colour entry
/// offsets. The route never mirrors for RTL; only surrounding text direction
/// changes.
abstract final class ManchBoardGeometry {
  static const int trackLength = 52;

  static const Map<ManchColour, int> startOffsets = {
    ManchColour.red: 0,
    ManchColour.green: 13,
    ManchColour.yellow: 26,
    ManchColour.blue: 39,
  };

  /// Ordered 52-cell route on the 15x15 board.
  static const List<(int, int)> trackCells = [
    (6, 0), (6, 1), (6, 2), (6, 3), (6, 4), (6, 5),
    (5, 6), (4, 6), (3, 6), (2, 6), (1, 6), (0, 6),
    (0, 7), (0, 8), (1, 8), (2, 8), (3, 8), (4, 8),
    (5, 8), (6, 9), (6, 10), (6, 11), (6, 12), (6, 13),
    (6, 14), (7, 14), (8, 14), (8, 13), (8, 12), (8, 11),
    (8, 10), (8, 9), (9, 8), (10, 8), (11, 8), (12, 8),
    (13, 8), (14, 8), (14, 7), (14, 6), (13, 6), (12, 6),
    (11, 6), (10, 6), (9, 6), (8, 5), (8, 4), (8, 3),
    (8, 2), (8, 1), (8, 0), (7, 0),
  ];

  static int globalTrackIndex(ManchColour colour, int progress) {
    if (progress < 0 || progress >= trackLength) {
      throw RangeError.range(progress, 0, trackLength - 1, 'progress');
    }
    return (startOffsets[colour]! + progress) % trackLength;
  }
}
