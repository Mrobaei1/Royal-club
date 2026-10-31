import test from "node:test";
import assert from "node:assert/strict";
import { canJoinRoom, freezeGameSettings, validateRoomSettings } from "./room-policy.js";

test("server policy admits only players meeting the host's minimum level", () => {
  const settings={minOpponentLevel:5,timeControlId:"rapid",chatEnabled:true,voiceEnabled:false};
  assert.equal(canJoinRoom(settings,{userId:"a",chessLevel:4}),false);
  assert.equal(canJoinRoom(settings,{userId:"b",chessLevel:5}),true);
});
test("game settings are frozen snapshots unaffected by later admin edits", () => {
  const current={minOpponentLevel:1,timeControlId:"rapid",chatEnabled:true,voiceEnabled:true};
  const game=freezeGameSettings(current);
  current.minOpponentLevel=9;
  assert.equal(game.minOpponentLevel,1);
  assert.equal(Object.isFrozen(game),true);
});

test("room settings reject malformed identifiers, booleans and unreasonable levels", () => {
  assert.throws(() => validateRoomSettings({
    minOpponentLevel: 0, timeControlId: "rapid", chatEnabled: true, voiceEnabled: false
  }));
  assert.throws(() => validateRoomSettings({
    minOpponentLevel: 1, timeControlId: "rapid; DROP TABLE users", chatEnabled: true, voiceEnabled: false
  }));
  assert.throws(() => validateRoomSettings({
    minOpponentLevel: 1, timeControlId: "rapid", chatEnabled: "yes" as unknown as boolean, voiceEnabled: false
  }));
});
