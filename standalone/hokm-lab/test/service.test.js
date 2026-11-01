import test from "node:test";
import assert from "node:assert/strict";
import { HokmRoomService, InMemoryRoomRepository } from "../src/service.js";

const user = userId => ({ authenticated: true, userId });

function serviceFixture() {
  let clock = 1000;
  let nextId = 0;
  return {
    service: new HokmRoomService({
      repository: new InMemoryRoomRepository(),
      now: () => clock,
      id: () => `service-room-${++nextId}`
    }),
    setNow(value) { clock = value; }
  };
}

test("service rejects missing or unverified authentication principals", async () => {
  const { service } = serviceFixture();
  await assert.rejects(service.create({ userId: "u0" }), /verified authenticated principal/);
  await assert.rejects(service.create(null), /verified authenticated principal/);
  await assert.rejects(service.create({ authenticated: true, userId: "" }), /verified authenticated principal/);
});

test("service derives room membership from authenticated principal and gates private views", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  assert.equal(created.hostUserId, "u0");
  await assert.rejects(service.view(user("outsider"), created.roomId), /not a member/);
  const joined = await service.join(user("u1"), created.roomId, created.version);
  assert.equal(joined.players.length, 2);
  assert.equal(joined.version, 2);
});

test("service serializes competing writes and rejects the stale second transition", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  const outcomes = await Promise.allSettled([
    service.join(user("u1"), created.roomId, created.version),
    service.join(user("u2"), created.roomId, created.version)
  ]);
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
  const latest = await service.view(user("u0"), created.roomId);
  assert.equal(latest.players.length, 2);
  assert.equal(latest.version, 2);
});

test("service enforces host-only start and server-side version checks", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  let version = created.version;
  for (const id of ["u1", "u2", "u3"]) {
    const joined = await service.join(user(id), created.roomId, version);
    version = joined.version;
  }
  for (const id of ["u0", "u1", "u2", "u3"]) {
    const ready = await service.ready(user(id), created.roomId, true, version);
    version = ready.version;
  }
  await assert.rejects(service.start(user("u2"), created.roomId, version), /Only the host/);
  const started = await service.start(user("u0"), created.roomId, version);
  assert.equal(started.status, "playing");
  await assert.rejects(
    service.command(user("u0"), created.roomId, { type: "choose_trump", suit: "hearts" }, version),
    /Stale room version/
  );
});

test("only trusted service principals can execute disconnect deadline jobs", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  await assert.rejects(
    service.processDisconnectTimeout(user("u0"), created.roomId, "u0", created.version),
    /trusted service principal/
  );
});

test("repository compare-and-swap rejects non-sequential versions", async () => {
  const repository = new InMemoryRoomRepository();
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  await repository.insert({ ...created, roomId: "cas-room", version: 1 });
  await assert.rejects(repository.compareAndSwap("cas-room", 1, { ...created, roomId: "cas-room", version: 3 }), /Invalid room compare-and-swap transition/);
  assert.equal((await repository.get("cas-room")).version, 1);
  void service;
});
test("service views expose only the authenticated seat hand", async () => {
  const { service } = serviceFixture();
  const created = await service.create(user("u0"));
  let version = created.version;
  for (const id of ["u1", "u2", "u3"]) {
    version = (await service.join(user(id), created.roomId, version)).version;
  }
  for (const id of ["u0", "u1", "u2", "u3"]) {
    version = (await service.ready(user(id), created.roomId, true, version)).version;
  }
  await service.start(user("u0"), created.roomId, version);
  for (let seat = 0; seat < 4; seat += 1) {
    const view = await service.view(user(`u${seat}`), created.roomId);
    assert.equal(view.game.ownSeat, seat);
    assert.equal(view.game.ownHand.length, 5);
    assert.equal("hands" in view.game, false);
    assert.equal("undealtDeck" in view.game, false);
  }
});

