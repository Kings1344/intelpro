import { test } from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import { base58Decode, base58Encode, isSolanaAddress, isSolanaSignature } from "../src/lib/solana/base58";
import { buildLinkMessage, verifyWalletSignature } from "../src/lib/solana/wallet-proof";
import { analyseTransaction, type RpcTransaction } from "../src/lib/solana/tx-verify";
import { anchorMemo, canonicalCriteria, criteriaHash, parseAnchorMemo } from "../src/lib/solana/anchor-memo";
import { MEMO_PROGRAM_ID } from "../src/lib/config";

test("base58 matches known Solana vectors", () => {
  assert.equal(base58Encode(new Uint8Array(32)), "11111111111111111111111111111111"); // System Program
  assert.equal(base58Decode(MEMO_PROGRAM_ID).length, 32);
  assert.equal(base58Encode(base58Decode(MEMO_PROGRAM_ID)), MEMO_PROGRAM_ID);
  assert.equal(base58Encode(Uint8Array.from([0, 0, 1, 2, 255])), "11" + base58Encode(Uint8Array.from([1, 2, 255])));
  assert.ok(isSolanaAddress("GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y"));
  assert.ok(isSolanaAddress("3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ"));
  assert.ok(!isSolanaAddress("0OIl-not-base58"));
  assert.ok(isSolanaSignature(base58Encode(nacl.randomBytes(64))));
  assert.ok(!isSolanaSignature(base58Encode(nacl.randomBytes(32))));
});

test("wallet ownership proof: real ed25519 signatures verify, tampering fails", () => {
  const kp = nacl.sign.keyPair();
  const address = base58Encode(kp.publicKey);
  const msg = buildLinkMessage({ address, email: "a@b.co", nonce: "abc123", issuedAt: new Date(), expiresAt: new Date(Date.now() + 6e5), network: "devnet", domain: "localhost:3000" });
  assert.match(msg, /does not authorise any transaction/);
  const sig = Buffer.from(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey)).toString("base64");
  assert.equal(verifyWalletSignature(address, msg, sig), true);
  assert.equal(verifyWalletSignature(address, msg.replace("abc123", "abc124"), sig), false, "nonce tampered");
  const other = base58Encode(nacl.sign.keyPair().publicKey);
  assert.equal(verifyWalletSignature(other, msg, sig), false, "different wallet");
  assert.equal(verifyWalletSignature(address, msg, "AAAA"), false, "malformed signature");
});

test("criteria hash is canonical and the memo round-trips", async () => {
  const c = { marketId: "cm123abc", version: 2, improvedQuestion: " Q ", yesCondition: "Y", noCondition: "N", resolutionDeadline: "2026-12-31T23:59:59.000Z", timezone: "UTC", dataSource: "S", methodology: "M" };
  const reordered = { methodology: "M", dataSource: "S", timezone: "UTC", resolutionDeadline: c.resolutionDeadline, noCondition: "N", yesCondition: "Y", improvedQuestion: "Q", version: 2, marketId: "cm123abc" };
  assert.equal(canonicalCriteria(c), canonicalCriteria(reordered));
  const h = await criteriaHash(c);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, await criteriaHash({ ...c, yesCondition: "Y2" }));
  const memo = anchorMemo(c.marketId, 2, h);
  assert.deepEqual(parseAnchorMemo(memo), { marketId: "cm123abc", version: 2, hash: h });
  assert.deepEqual(parseAnchorMemo(`[${memo.length}] ${memo}`), { marketId: "cm123abc", version: 2, hash: h });
  assert.ok(new TextEncoder().encode(memo).length < 566, "fits in a memo instruction");
});

const SIGNER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const fixture = (o: { err?: unknown; memo?: string; program?: string } = {}): RpcTransaction => ({
  slot: 1234,
  blockTime: 1_790_000_000,
  meta: { err: o.err ?? null, innerInstructions: [] },
  transaction: {
    message: {
      accountKeys: [{ pubkey: SIGNER, signer: true, writable: true }],
      instructions: [o.program ? { programId: o.program } : { programId: MEMO_PROGRAM_ID, program: "spl-memo", parsed: o.memo ?? "intelpro:v1:criteria:x:1:" + "a".repeat(64) }],
    },
  },
});

test("transaction verification only reports success when the chain confirms it", () => {
  const memo = "intelpro:v1:criteria:x:1:" + "a".repeat(64);
  const ok = analyseTransaction(fixture({ memo }), { slot: 1234, err: null, confirmationStatus: "finalized" }, { signer: SIGNER, programId: MEMO_PROGRAM_ID, memo });
  assert.equal(ok.status, "FINALIZED");
  assert.equal(ok.error, null);
  assert.ok(ok.checks.every((c) => c.passed));

  assert.equal(analyseTransaction(fixture({ err: { InstructionError: [0, "Custom"] } }), { slot: 1, err: { x: 1 }, confirmationStatus: "confirmed" }, {}).status, "FAILED");
  assert.equal(analyseTransaction(fixture({ memo: "other" }), { slot: 1, err: null, confirmationStatus: "confirmed" }, { memo }).status, "FAILED", "wrong memo");
  assert.equal(analyseTransaction(fixture({ memo }), { slot: 1, err: null, confirmationStatus: "confirmed" }, { signer: "11111111111111111111111111111111" }).status, "FAILED", "wrong signer");
  assert.equal(analyseTransaction(null, { slot: 1, err: null, confirmationStatus: "processed" }, {}).status, "SUBMITTED");

  const now = new Date();
  assert.equal(analyseTransaction(null, null, {}, { submittedAt: new Date(now.getTime() - 10_000), now }).status, "SUBMITTED", "too recent to judge");
  assert.equal(analyseTransaction(null, null, {}, { submittedAt: new Date(now.getTime() - 600_000), now }).status, "NOT_FOUND");
});

test("PREDICT transactions must invoke the pm-AMM program", () => {
  const pm = "GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y";
  assert.equal(analyseTransaction(fixture({ program: pm }), { slot: 1, err: null, confirmationStatus: "confirmed" }, { signer: SIGNER, programId: pm }).status, "CONFIRMED");
  assert.equal(analyseTransaction(fixture({ program: "11111111111111111111111111111111" }), { slot: 1, err: null, confirmationStatus: "confirmed" }, { signer: SIGNER, programId: pm }).status, "FAILED");
});

import { lockVerdict } from "../src/lib/solana/lock-verdict";
import { anchorMemo as memoFor } from "../src/lib/solana/anchor-memo";

test("lock verdict: verified only when the chain memo matches the rules shown now", () => {
  const h = "a".repeat(64);
  const chain = (memos: string[], status: "CONFIRMED" | "FAILED" | "NOT_FOUND" = "CONFIRMED") => ({ status, memos, slot: 42, blockTime: new Date("2026-11-19T00:00:00Z") });
  const base = { marketId: "mkt1", currentHash: h, currentVersion: 2, signature: "sig" };
  assert.equal(lockVerdict({ ...base, signature: null, chain: null }).state, "unlocked");
  assert.equal(lockVerdict({ ...base, chain: chain([], "NOT_FOUND") }).state, "pending");
  assert.equal(lockVerdict({ ...base, chain: chain([memoFor("mkt1", 2, h)], "FAILED") }).state, "failed");
  assert.equal(lockVerdict({ ...base, chain: chain(["hello"]) }).state, "failed", "no Lockline memo");
  assert.equal(lockVerdict({ ...base, chain: chain([memoFor("other", 2, h)]) }).state, "failed", "memo for another market");
  const ok = lockVerdict({ ...base, chain: chain([`[100] ${memoFor("mkt1", 2, h)}`]) });
  assert.equal(ok.state, "verified");
  assert.equal(ok.onChainHash, h);
  assert.equal(ok.slot, 42);
  assert.equal(lockVerdict({ ...base, chain: chain([memoFor("mkt1", 1, h)]) }).state, "changed", "a newer version was approved after the lock");
  assert.equal(lockVerdict({ ...base, chain: chain([memoFor("mkt1", 2, "b".repeat(64))]) }).state, "mismatch");
});
