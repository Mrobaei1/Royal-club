enum ThreeSixPenalty { none, loseTurn }

/// Versionable rule switches for Iranian household variants of Manch.
class ManchRuleProfile {
  const ManchRuleProfile({
    this.entryFaces = const {6},
    this.extraRollOnSix = true,
    this.extraRollOnCapture = false,
    this.extraRollOnFinish = false,
    this.threeSixPenalty = ThreeSixPenalty.none,
    this.safeTrackIndices = const {0, 13, 26, 39},
    this.blockadesEnabled = false,
    this.blockadeBlocksOpponents = true,
    this.friendlyStackingEnabled = true,
    this.exactFinishRequired = true,
    this.maxConsecutiveSixes = 3,
  })  : assert(entryFaces.length > 0),
        assert(entryFaces.every((face) => face >= 1 && face <= 6)),
        assert(safeTrackIndices.every((cell) => cell >= 0 && cell < 52)),
        assert(maxConsecutiveSixes >= 2);

  final Set<int> entryFaces;
  final bool extraRollOnSix;
  final bool extraRollOnCapture;
  final bool extraRollOnFinish;
  final ThreeSixPenalty threeSixPenalty;
  final Set<int> safeTrackIndices;
  final bool blockadesEnabled;
  final bool blockadeBlocksOpponents;
  final bool friendlyStackingEnabled;
  final bool exactFinishRequired;
  final int maxConsecutiveSixes;

  Map<String, Object?> toJson() => {
    'entryFaces': entryFaces.toList()..sort(),
    'extraRollOnSix': extraRollOnSix,
    'extraRollOnCapture': extraRollOnCapture,
    'extraRollOnFinish': extraRollOnFinish,
    'threeSixPenalty': threeSixPenalty.name,
    'safeTrackIndices': safeTrackIndices.toList()..sort(),
    'blockadesEnabled': blockadesEnabled,
    'blockadeBlocksOpponents': blockadeBlocksOpponents,
    'friendlyStackingEnabled': friendlyStackingEnabled,
    'exactFinishRequired': exactFinishRequired,
    'maxConsecutiveSixes': maxConsecutiveSixes,
  };
}
