import test from "node:test";
import assert from "node:assert/strict";
import { defaultTimeControls } from "./clock.js";
import { canJoinRoom } from "./room-policy.js";

test("configured game presets and host level gate match product rules",()=>{
  assert.deepEqual(defaultTimeControls().map(c=>[c.name,c.baseMs]),[
    ["ultra_fast",90000],["rapid",300000],["classical",900000]
  ]);
  const settings={minOpponentLevel:7,timeControlId:"classical",chatEnabled:true,voiceEnabled:true};
  assert.equal(canJoinRoom(settings,{userId:"101",chessLevel:6}),false);
  assert.equal(canJoinRoom(settings,{userId:"102",chessLevel:7}),true);
});
