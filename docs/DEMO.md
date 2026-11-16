# Three-minute demo

Setup: `npm run db:migrate && npm run db:seed && npm run dev`, then sign in as the seeded admin. Every demo record carries a **Demo data** badge, uses reserved `example.com/.net/.org` URLs and illustrative figures. The engines (rule checks, evidence statuses, recommendation, integrity) computed the demo states at seed time; nothing was hand-labelled.

| Time | Where | Show | Point to make |
|---|---|---|---|
| 0:00 | Landing page `/` | The BTC question with problem phrases underlined, the clarity dial and the rewrite. | “Most disputes start with the question itself.” |
| 0:20 | **Market Architect** | Click *Analyse question* on “Will Bitcoin reach $150,000 before December 31, 2026?”. Walk through the findings (no data source; ‘reach $150,000’ unmeasured; no time or timezone), then the drafted YES/NO rules. Change the NO condition to “$140,000”: approval checks flag inconsistent outcomes and *Approve* disables. | Analysis is about *this* text, and the server re-checks before approval. |
| 0:55 | **Overview** | Intelligence Feed: dispute, contradiction, approaching deadline, recommendation, ambiguity. Integrity distribution. | One place for everything that needs a human decision. |
| 1:15 | Open the BTC demo market → **Evidence Vault** | Aggregated index and exchange data say NO; a news report about a single-venue spike says YES (both *Contradicted*); a social post is *Unable to verify*. Claims show the exact source text they rest on. | Submitted is never treated as verified. |
| 1:45 | **Resolution Intelligence** | *NO supported*, reduced confidence because the deadline hasn't passed, cited records listed and linked, unreachable source excluded, missing information listed. Click *Generate recommendation* to recompute live. | Traceable, advisory, not settlement. |
| 2:15 | **Disputes** → BTC challenge | The trader's argument, the reviewer's evidence request, the comparison of challenge evidence with the cited records, the audit trail. As admin (reviewer rights), *Uphold* or *Reject* with a reason. | A review process in the open, not hidden arbitration. |
| 2:40 | **Integrity Monitor** | Each status with the named rule that produced it: draft Fed question (needs attention), live market with unapproved rules (high risk), BTC (under dispute), ETH (healthy). | Rule-based and explainable. |
| 2:50 | **Market Explorer → Live PREDICT markets** | Real pm-AMM markets read from Solana devnet. On your own approved market: *Anchor approved rules* (memo transaction) and *Launch on PREDICT*, then *Buy YES* and switch to *Sell*. The quote is simulated on-chain, and the trade confirms only after the server verifies it. | Solana is functional, not decorative: verified signatures only. |

Optional extras if there is time:
- In the Evidence Vault, upload a text PDF (it is read page by page) and a scanned one (reported unreadable, never summarised).
- Register a new account to show the verification banner, then use “Forgot your password?” for the reset flow.

For the on-chain segment, prepare a devnet wallet (Phantom or Solflare set to devnet), airdrop SOL (`solana airdrop 1 <pubkey> --url devnet`), link the wallet in Settings, and press *Get devnet mUSDC*.
