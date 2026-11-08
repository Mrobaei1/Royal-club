import test from "node:test";
import assert from "node:assert/strict";
import { isPositivePostgresBigintId } from "./identifiers.js";

test("accepts positive decimal IDs inside PostgreSQL BIGINT range", () => {
  assert.equal(isPositivePostgresBigintId("1"), true);
  assert.equal(isPositivePostgresBigintId("9223372036854775807"), true);
});

test("rejects malformed, non-positive and overflowing PostgreSQL BIGINT IDs", () => {
  for (const value of ["", "0", "-1", "+1", "01", "1.0", "1e3", "abc", "9223372036854775808", "99999999999999999999", 1, null, undefined]) {
    assert.equal(isPositivePostgresBigintId(value), false, String(value));
  }
});
