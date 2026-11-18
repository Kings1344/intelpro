/**
 * Demonstration dataset. Every record is flagged isDemo = true and every figure is
 * ILLUSTRATIVE — not real market data. URLs use RFC 2606 reserved example domains
 * so nothing can be mistaken for a real, verified source.
 * Criteria v1, evidence statuses and recommendations are computed by the real
 * Lockline engines at seed time (see prisma/seed.ts), not hand-written.
 */
export const DEMO_NOTICE = "Demonstration data — illustrative figures, not real-world verification.";

export type DemoEvidence = {
  key: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  description: string;
  publishedDaysAgo: number | null;
  category: "OFFICIAL_DATA" | "MARKET_DATA" | "ONCHAIN_DATA" | "NEWS_REPORT" | "OFFICIAL_STATEMENT" | "RESEARCH" | "SOCIAL_MEDIA" | "OTHER";
  claimedStance: "SUPPORTS_YES" | "SUPPORTS_NO" | "NEUTRAL" | "UNCLASSIFIED";
  accessible: boolean;
  fetchError?: string;
  analysis?: { stance: "SUPPORTS_YES" | "SUPPORTS_NO" | "NEUTRAL" | "UNCLASSIFIED"; relevance: number; summary: string; claims: { text: string; supports: "YES" | "NO" | "NEUTRAL"; quote: string }[] };
  submitter: "creator" | "trader" | "reviewer";
};

export type DemoMarket = {
  key: string;
  question: string;
  category: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "AWAITING_RESOLUTION" | "RESOLUTION_PROPOSED" | "DISPUTED" | "RESOLVED";
  deadlineDaysFromNow: number | null;
  fixedDeadline?: string;
  approvedCriteria?: {
    improvedQuestion: string;
    yesCondition: string;
    noCondition: string;
    dataSource: string;
    dataSourceUrl: string | null;
    methodology: string;
    clarityScore: number;
  };
  evidence: DemoEvidence[];
  generateRecommendation: boolean;
  proposeOutcome?: "YES" | "NO";
  dispute?: {
    reason: string;
    status: "UNDER_REVIEW" | "EVIDENCE_REQUESTED";
    evidence: DemoEvidence[];
    comments: { by: "reviewer" | "trader"; kind: "COMMENT" | "EVIDENCE_REQUEST" | "STATUS_CHANGE"; body: string }[];
  };
};

const D = "[Demo] ";

export const DEMO_MARKETS: DemoMarket[] = [
  {
    key: "btc150",
    question: "Will Bitcoin reach $150,000 before December 31, 2026?",
    category: "Crypto",
    description: "Flagship demonstration market: shows ambiguity detection, criteria repair, evidence analysis, a traceable recommendation and an open dispute.",
    status: "ACTIVE",
    deadlineDaysFromNow: null,
    fixedDeadline: "2026-12-31T23:59:59.000Z",
    approvedCriteria: {
      improvedQuestion: "Will the BTC/USD price published by CoinGecko reach or exceed $150,000 at any time between market creation and 23:59:59 UTC on December 31, 2026?",
      yesCondition: "Resolves YES if the CoinGecko BTC/USD aggregated price records a value at or above $150,000 at any time after market creation and on or before 23:59:59 UTC on December 31, 2026.",
      noCondition: "Resolves NO if no CoinGecko BTC/USD data point at or above $150,000 is recorded between market creation and 23:59:59 UTC on December 31, 2026.",
      dataSource: "CoinGecko BTC/USD aggregated price",
      dataSourceUrl: "https://www.coingecko.com/en/coins/bitcoin",
      methodology:
        "1. After 23:59:59 UTC on December 31, 2026, retrieve the full BTC/USD price history for the market window from CoinGecko.\n2. Determine whether any published data point is ≥ $150,000.\n3. If CoinGecko is unavailable or disputed, use the median BTC/USD spot price on Coinbase, Kraken and Bitstamp at the same timestamp.\n4. A single-venue print that is not reflected in the aggregated index does not qualify.\n5. Record the deciding data point, timestamp and URL as evidence before proposing a resolution.",
      clarityScore: 92,
    },
    evidence: [
      {
        key: "agg",
        title: `${D}Aggregated BTC/USD price history export (illustrative)`,
        sourceName: "Sample aggregated index",
        sourceUrl: "https://market-data.example.com/btc-usd/history",
        description: "Illustrative sample: the aggregated BTC/USD series for the market window to date peaks at $118,420 — below the $150,000 threshold.",
        publishedDaysAgo: 1,
        category: "MARKET_DATA",
        claimedStance: "SUPPORTS_NO",
        accessible: true,
        analysis: {
          stance: "SUPPORTS_NO",
          relevance: 0.92,
          summary: "Demonstration analysis (pre-written sample, not AI output): the aggregated series has not printed at or above $150,000 during the window so far.",
          claims: [{ text: "Window high to date is below the threshold.", supports: "NO", quote: "peaks at $118,420" }],
        },
        submitter: "creator",
      },
      {
        key: "ohlc",
        title: `${D}Exchange daily OHLC candles — BTC/USD (illustrative)`,
        sourceName: "Sample exchange data",
        sourceUrl: "https://exchange-data.example.net/ohlc/btcusd",
        description: "Illustrative sample: daily highs on a second venue stay between $96,000 and $119,100 across the window.",
        publishedDaysAgo: 2,
        category: "MARKET_DATA",
        claimedStance: "SUPPORTS_NO",
        accessible: true,
        analysis: {
          stance: "SUPPORTS_NO",
          relevance: 0.85,
          summary: "Demonstration analysis (pre-written sample, not AI output): independent venue data agrees that the threshold has not been reached.",
          claims: [{ text: "Highest daily high is $119,100.", supports: "NO", quote: "between $96,000 and $119,100" }],
        },
        submitter: "reviewer",
      },
      {
        key: "news",
        title: `${D}News report: "BTC briefly spikes to $150k on thin liquidity" (illustrative)`,
        sourceName: "Sample news outlet",
        sourceUrl: "https://news.example.org/markets/btc-flash-spike",
        description: "Illustrative sample: reports a seconds-long print at $150,200 on a single low-liquidity venue during a flash spike.",
        publishedDaysAgo: 3,
        category: "NEWS_REPORT",
        claimedStance: "SUPPORTS_YES",
        accessible: true,
        analysis: {
          stance: "SUPPORTS_YES",
          relevance: 0.7,
          summary: "Demonstration analysis (pre-written sample, not AI output): describes a single-venue print above the threshold. The approved criteria use the aggregated CoinGecko price, so this alone may not qualify.",
          claims: [{ text: "A single venue printed above $150,000 briefly.", supports: "YES", quote: "print at $150,200 on a single low-liquidity venue" }],
        },
        submitter: "trader",
      },
      {
        key: "social",
        title: `${D}Social media post claiming a $150k print (illustrative)`,
        sourceName: "Sample social account",
        sourceUrl: "https://social.example.com/post/123456",
        description: "Illustrative sample: screenshot post claiming BTC traded at $151k.",
        publishedDaysAgo: 3,
        category: "SOCIAL_MEDIA",
        claimedStance: "SUPPORTS_YES",
        accessible: false,
        fetchError: "Demonstration: source marked unreachable (HTTP 404).",
        submitter: "trader",
      },
      {
        key: "status",
        title: `${D}Exchange status page incident note (illustrative)`,
        sourceName: "Sample exchange status page",
        sourceUrl: "https://status.example.net/incidents/flash-spike",
        description: "Illustrative sample: the venue acknowledges an order-book anomaly at the time of the reported spike and says trades are under review.",
        publishedDaysAgo: 2,
        category: "OFFICIAL_STATEMENT",
        claimedStance: "NEUTRAL",
        accessible: true,
        analysis: {
          stance: "NEUTRAL",
          relevance: 0.6,
          summary: "Demonstration analysis (pre-written sample, not AI output): confirms an anomaly but does not establish a valid aggregated price.",
          claims: [{ text: "Trades at the time are under review.", supports: "NEUTRAL", quote: "trades are under review" }],
        },
        submitter: "reviewer",
      },
    ],
    generateRecommendation: true,
    dispute: {
      reason:
        "The interim recommendation (NO supported) ignores the reported $150,200 print. Traders bought YES expecting any trade at $150k to count. The original question said “reach $150,000” without naming a venue, so the single-venue print should be considered.",
      status: "EVIDENCE_REQUESTED",
      evidence: [
        {
          key: "dispute-trade",
          title: `${D}Trade log excerpt from the spiking venue (illustrative)`,
          sourceName: "Sample venue trade log",
          sourceUrl: "https://exchange-data.example.org/trades/btcusd/spike",
          description: "Illustrative sample: three fills at $150,050–$150,200 within two seconds.",
          publishedDaysAgo: 2,
          category: "MARKET_DATA",
          claimedStance: "SUPPORTS_YES",
          accessible: true,
          submitter: "trader",
        },
      ],
      comments: [
        { by: "reviewer", kind: "STATUS_CHANGE", body: "Review started. Comparing the single-venue print against the approved criteria (aggregated CoinGecko price, v2)." },
        { by: "reviewer", kind: "COMMENT", body: "The approved v2 criteria explicitly exclude single-venue prints not reflected in the aggregated index. The original v1 wording was ambiguous, which is why it was revised before approval." },
        { by: "reviewer", kind: "EVIDENCE_REQUEST", body: "Please provide evidence that the aggregated index itself recorded ≥ $150,000, or that the venue's trades were confirmed as valid after its incident review." },
        { by: "trader", kind: "COMMENT", body: "Will follow up once the venue publishes its incident review outcome." },
      ],
    },
  },
  {
    key: "eth5k",
    question: "Will ETH/USD close above $5,000 on Coinbase on October 31, 2026 at 23:59 UTC?",
    category: "Crypto",
    description: "Demonstration market past its deadline with a proposed resolution.",
    status: "RESOLUTION_PROPOSED",
    deadlineDaysFromNow: null,
    fixedDeadline: "2026-10-31T23:59:00.000Z",
    approvedCriteria: {
      improvedQuestion: "Will the Coinbase ETH-USD daily candle that closes at 23:59 UTC on October 31, 2026 have a close price above $5,000?",
      yesCondition: "Resolves YES if the Coinbase ETH-USD daily close for October 31, 2026 (UTC) is strictly greater than $5,000.",
      noCondition: "Resolves NO if the Coinbase ETH-USD daily close for October 31, 2026 (UTC) is $5,000 or lower.",
      dataSource: "Coinbase Exchange ETH-USD daily candles",
      dataSourceUrl: null,
      methodology: "1. Retrieve the Coinbase ETH-USD daily candle for October 31, 2026 (UTC).\n2. Compare its close with $5,000.\n3. If Coinbase data is unavailable, use the CoinGecko ETH/USD daily close.",
      clarityScore: 95,
    },
    evidence: [
      {
        key: "eth-close",
        title: `${D}ETH-USD daily candle, 31 Oct 2026 (illustrative)`,
        sourceName: "Sample exchange candles",
        sourceUrl: "https://exchange-data.example.net/candles/eth-usd/2026-10-31",
        description: "Illustrative sample: daily close recorded at $4,612.",
        publishedDaysAgo: 15,
        category: "MARKET_DATA",
        claimedStance: "SUPPORTS_NO",
        accessible: true,
        analysis: { stance: "SUPPORTS_NO", relevance: 0.95, summary: "Demonstration analysis (pre-written sample, not AI output): close below threshold.", claims: [{ text: "Close was $4,612.", supports: "NO", quote: "daily close recorded at $4,612" }] },
        submitter: "creator",
      },
      {
        key: "eth-agg",
        title: `${D}Aggregated ETH/USD daily close (illustrative)`,
        sourceName: "Sample aggregated index",
        sourceUrl: "https://market-data.example.com/eth-usd/2026-10-31",
        description: "Illustrative sample: aggregated close of $4,598 for the same day.",
        publishedDaysAgo: 15,
        category: "MARKET_DATA",
        claimedStance: "SUPPORTS_NO",
        accessible: true,
        analysis: { stance: "SUPPORTS_NO", relevance: 0.8, summary: "Demonstration analysis (pre-written sample, not AI output): fallback source agrees.", claims: [{ text: "Aggregated close was $4,598.", supports: "NO", quote: "aggregated close of $4,598" }] },
        submitter: "reviewer",
      },
    ],
    generateRecommendation: true,
    proposeOutcome: "NO",
  },
  {
    key: "fed",
    question: "Will the Fed significantly cut rates soon?",
    category: "Macro",
    description: "Demonstration draft showing what the Market Architect flags in a vague question.",
    status: "DRAFT",
    deadlineDaysFromNow: 90,
    evidence: [],
    generateRecommendation: false,
  },
  {
    key: "sol400",
    question: "Will SOL/USD trade above $400 on the CoinGecko index before its approved deadline?",
    category: "Crypto",
    description: "Demonstration market approaching its deadline with no analysed evidence.",
    status: "ACTIVE",
    deadlineDaysFromNow: 2,
    approvedCriteria: {
      improvedQuestion: "Will the SOL/USD price published by CoinGecko reach or exceed $400 at any time before the approved deadline (23:59:59 UTC)?",
      yesCondition: "Resolves YES if any CoinGecko SOL/USD data point is at or above $400 before the deadline.",
      noCondition: "Resolves NO if no CoinGecko SOL/USD data point at or above $400 is recorded before the deadline.",
      dataSource: "CoinGecko SOL/USD aggregated price",
      dataSourceUrl: "https://www.coingecko.com/en/coins/solana",
      methodology: "1. After the deadline, retrieve the CoinGecko SOL/USD history for the window.\n2. Check for any data point ≥ $400.\n3. Fallback: median of Coinbase, Kraken and Bitstamp SOL/USD.",
      clarityScore: 88,
    },
    evidence: [],
    generateRecommendation: false,
  },
  {
    key: "ai-model",
    question: "Will a major AI lab release a popular new model this year?",
    category: "Technology",
    description: "Demonstration of a live market whose rules were never approved.",
    status: "ACTIVE",
    deadlineDaysFromNow: 45,
    evidence: [],
    generateRecommendation: false,
  },
];
