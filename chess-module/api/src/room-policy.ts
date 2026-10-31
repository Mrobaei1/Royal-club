export type ChessRoomSettings = {
  minOpponentLevel: number;
  timeControlId: string;
  chatEnabled: boolean;
  voiceEnabled: boolean;
};
export type PlayerAdmission = { userId: string; chessLevel: number };

export function validateRoomSettings(settings: ChessRoomSettings): void {
  if (!Number.isInteger(settings.minOpponentLevel) || settings.minOpponentLevel < 1 ||
      !settings.timeControlId.trim()) throw new RangeError("invalid_room_settings");
}
export function canJoinRoom(settings: ChessRoomSettings, player: PlayerAdmission): boolean {
  validateRoomSettings(settings);
  return Boolean(player.userId) && Number.isInteger(player.chessLevel) &&
    player.chessLevel >= settings.minOpponentLevel;
}
export function freezeGameSettings<T extends ChessRoomSettings>(settings: T): Readonly<T> {
  validateRoomSettings(settings);
  return Object.freeze(structuredClone(settings));
}
