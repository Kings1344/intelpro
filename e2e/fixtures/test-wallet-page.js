/* eslint-disable */
// Injected into the page by Playwright (addInitScript). A minimal Wallet Standard wallet
// ("IntelPro Test Wallet") backed by a throwaway Ed25519 key passed in as `__TEST_WALLET_SEED__`.
// It signs messages and transactions for real (Web Crypto Ed25519). It never holds a real key.
(() => {
  const SEED = new Uint8Array(window.__TEST_WALLET_SEED__);
  const PUB = new Uint8Array(window.__TEST_WALLET_PUBKEY__);
  const ADDRESS = window.__TEST_WALLET_ADDRESS__;
  const CHAIN = window.__TEST_WALLET_CHAIN__ || "solana:devnet";
  const PKCS8_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
  let keyPromise = null;
  const key = () => (keyPromise ??= crypto.subtle.importKey("pkcs8", new Uint8Array([...PKCS8_PREFIX, ...SEED]), { name: "Ed25519" }, false, ["sign"]));
  const sign = async (bytes) => new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, await key(), bytes));

  const readCompactU16 = (b, o) => { let v = 0, s = 0, i = 0; for (;;) { const x = b[o + i++]; v |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7; } return [v, i]; };
  // Wire format: [compact-u16 n][n × 64-byte signatures][message]
  async function signTx(tx) {
    const out = new Uint8Array(tx);
    const [n, nLen] = readCompactU16(out, 0);
    const msgStart = nLen + 64 * n;
    const msg = out.subarray(msgStart);
    let o = 0;
    if (msg[0] & 0x80) o = 1; // versioned message prefix
    const numRequired = msg[o];
    o += 3;
    const [keyCount, kLen] = readCompactU16(msg, o);
    o += kLen;
    let idx = -1;
    for (let k = 0; k < keyCount; k++) {
      const pk = msg.subarray(o + 32 * k, o + 32 * k + 32);
      if (pk.every((b, j) => b === PUB[j])) { idx = k; break; }
    }
    if (idx < 0 || idx >= numRequired) throw new Error("Test wallet is not a required signer of this transaction");
    out.set(await sign(msg), nLen + 64 * idx);
    return out;
  }

  const account = { address: ADDRESS, publicKey: PUB, chains: [CHAIN], features: ["solana:signMessage", "solana:signTransaction"] };
  let connected = false;
  const listeners = { change: [] };
  const wallet = {
    version: "1.0.0",
    name: "IntelPro Test Wallet",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxIDEnPjxyZWN0IHdpZHRoPScxJyBoZWlnaHQ9JzEnIGZpbGw9JyMyRkIzODMnLz48L3N2Zz4=",
    chains: [CHAIN],
    get accounts() { return connected ? [account] : []; },
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => { connected = true; listeners.change.forEach((l) => l({ accounts: [account] })); return { accounts: [account] }; } },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => { connected = false; listeners.change.forEach((l) => l({ accounts: [] })); } },
      "standard:events": { version: "1.0.0", on: (ev, l) => { (listeners[ev] ??= []).push(l); return () => { listeners[ev] = listeners[ev].filter((x) => x !== l); }; } },
      "solana:signMessage": { version: "1.0.0", signMessage: async (...inputs) => Promise.all(inputs.map(async ({ message }) => { window.__TEST_WALLET_LOG__.push("signMessage"); return { signedMessage: message, signature: await sign(message) }; })) },
      "solana:signTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signTransaction: async (...inputs) => Promise.all(inputs.map(async ({ transaction }) => { window.__TEST_WALLET_LOG__.push("signTransaction"); return { signedTransaction: await signTx(transaction) }; })) },
    },
  };
  window.__TEST_WALLET_LOG__ = [];
  const register = (api) => api.register(wallet);
  try { window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register })); } catch {}
  window.addEventListener("wallet-standard:app-ready", (e) => register(e.detail));
})();
