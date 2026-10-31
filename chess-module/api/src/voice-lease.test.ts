import test from "node:test";
import assert from "node:assert/strict";
import { VoiceLeaseManager } from "./voice-lease.js";

test("first valid speaker gets the lease; concurrent speaker is denied",()=>{
  const m=new VoiceLeaseManager(5000);
  assert.equal(m.request("r","alice","a1",0,true).granted,true);
  const second=m.request("r","bob","b1",1,true);
  assert.equal(second.granted,false);
  assert.equal(second.reason,"occupied");
});
test("only lease owner can release; expiry frees the room",()=>{
  const m=new VoiceLeaseManager(5000);
  m.request("r","alice","a1",0,true);
  assert.equal(m.release("r","bob","a1"),false);
  assert.deepEqual(m.expire(5000),["r"]);
  assert.equal(m.request("r","bob","b1",5001,true).granted,true);
});
test("disconnect and host disable release the microphone",()=>{
  const m=new VoiceLeaseManager();
  m.request("r1","alice","x",0,true);
  m.request("r2","alice","y",0,true);
  assert.deepEqual(m.disconnect("alice"),["r1","r2"]);
  m.request("r3","bob","z",0,true);
  assert.equal(m.request("r3","bob","z",1,false).reason,"disabled");
});
test("same speaker can renew its lease without allowing another speaker",()=>{
  const m=new VoiceLeaseManager(5000);
  assert.equal(m.request("r","alice","a1",0,true).granted,true);
  assert.equal(m.request("r","alice","a2",1000,true).granted,true);
  assert.equal(m.request("r","bob","b1",1001,true).granted,false);
});
