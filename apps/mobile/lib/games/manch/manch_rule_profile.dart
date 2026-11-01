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
  });

  factory ManchRuleProfile.fromJson(Map<String, Object?> json) {
    final penalty = ThreeSixPenalty.values.firstWhere(
      (value) => value.name == json['threeSixPenalty'],
      orElse: () => ThreeSixPenalty.none,
    );
    final profile = ManchRuleProfile(
      entryFaces: ((json['entryFaces'] as List?)?.cast<int>() ?? const {6}).toSet(),
      extraRollOnSix: json['extraRollOnSix'] as bool? ?? true,
      extraRollOnCapture: json['extraRollOnCapture'] as bool? ?? false,
      extraRollOnFinish: json['extraRollOnFinish'] as bool? ?? false,
      threeSixPenalty: penalty,
      safeTrackIndices: ((json['safeTrackIndices'] as List?)?.cast<int>() ??
          const [0, 13, 26, 39]).toSet(),
      blockadesEnabled: json['blockadesEnabled'] as bool? ?? false,
      blockadeBlocksOpponents: json['blockadeBlocksOpponents'] as bool? ?? true,
      friendlyStackingEnabled: json['friendlyStackingEnabled'] as bool? ?? true,
      exactFinishRequired: json['exactFinishRequired'] as bool? ?? true,
      maxConsecutiveSixes: json['maxConsecutiveSixes'] as int? ?? 3,
    );
    profile.validate();
    return profile;
  }

  void validate() {
    if (entryFaces.isEmpty) {
      throw ArgumentError('At least one entry face must be configured.');
    }
    if (entryFaces.any((face) => face < 1 || face > 6)) {
      throw ArgumentError('Entry faces must be between 1 and 6.');
    }
    if (safeTrackIndices.any((cell) => cell < 0 || cell >= 52)) {
      throw ArgumentError('Safe track indices must be between 0 and 51.');
    }
    if (maxConsecutiveSixes < 2) {
      throw ArgumentError('At least two consecutive sixes must be allowed.');
    }
  }

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
