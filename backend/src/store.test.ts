import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addOutstanding,
  getHuman,
  getOutstanding,
  markVerified,
  recordRequest,
  settleHuman,
} from "./store.js";

test("request tracking cannot create a verified human", () => {
  const nullifier = `0xunverified_${Date.now()}`;

  assert.equal(getHuman(nullifier), undefined);
  assert.throws(() => recordRequest(nullifier, Date.now()), /human not verified/);
  assert.equal(getHuman(nullifier), undefined);
});

test("outstanding and repayment require prior verification", () => {
  const nullifier = `0xunknown_${Date.now()}`;

  assert.throws(() => addOutstanding(nullifier, 1n), /human not verified/);
  assert.throws(() => settleHuman(nullifier), /human not verified/);
  assert.equal(getHuman(nullifier), undefined);
});

test("verified human request, outstanding, and repayment accounting still work", () => {
  const nullifier = `0xverified_${Date.now()}`;

  markVerified(nullifier);
  const timestamps = recordRequest(nullifier, 123);
  assert.deepEqual(timestamps, [123]);

  addOutstanding(nullifier, 5_000_000n);
  assert.equal(getOutstanding(nullifier), 5_000_000n);

  const repaid = settleHuman(nullifier);
  assert.equal(repaid, 5_000_000n);
  assert.equal(getOutstanding(nullifier), 0n);
  assert.equal(getHuman(nullifier)?.reputation, 5_000_000n);
});
