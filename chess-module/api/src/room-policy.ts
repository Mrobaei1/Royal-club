export type ChessRoomSettings = {
  minOpponentLevel: number;
  timeControlId: string;
  chatEnabled: boolean;
  voiceEnabled: boolean;
};
export type PlayerAdmission = { userId: string; chessLevel: number };

export function validateRoomSettings(settings: ChessRoomSettings): void {
  if (!Number.isSafeInteger(settings.minOpponentLevel) || settings.minOpponentLevel < 1 ||
      settings.minOpponentLevel > 10_000 || typeof settings.timeControlId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,40}$/.test(settings.timeControlId) ||
      typeof settings.chatEnabled !== "boolean" || typeof settings.voiceEnabled !== "boolean") {
    throw new RangeError("invalid_room_settings");
  }
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
