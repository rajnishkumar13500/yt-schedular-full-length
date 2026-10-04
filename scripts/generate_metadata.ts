import dotenv from "dotenv";

dotenv.config();

export interface YouTubeAIMetadata {
  title: string;
  description: string;
  tags: string[];
  pinnedComment: string;
  chapterTimestamps?: string;
}

/**
 * Strips corporate legal noise words from company names so titles stay punchy.
 * e.g., "Kalyan Jewellers India Limited" -> "Kalyan Jewellers"
 * e.g., "Pooja Logistics Limited" -> "Pooja Logistics"
 */
export function cleanCompanyNameForTitle(rawName: string): string {
  let cleaned = rawName.trim();

  // Strip corporate suffixes (case-insensitive)
  const suffixes = [
    /\b(private\s+limited|pvt\.?\s*ltd\.?)\b/gi,
    /\b(limited|ltd\.?)\b/gi,
    /\b(technologies|technology)\b/gi,
    /\b(industries|industry)\b/gi,
    /\b(holdings|holding)\b/gi,
    /\b(corporation|corp\.?)\b/gi,
    /\b(enterprises|enterprise)\b/gi,
    /\b(financial\s+services|finserve)\b/gi,
    /\b(solutions|services)\b/gi,
    /\bindia\b/gi,
    /& co\.?/gi,
  ];

  for (const pattern of suffixes) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Clean punctuation and multiple spaces
  cleaned = cleaned.replace(/[-–—,:()]/g, " ").replace(/\s+/g, " ").trim();

  // Strip trailing connectors
  cleaned = cleaned.replace(/\s+(and|&|of|the)$/i, "").trim();

  // If still very long (> 24 characters), keep the first 2-3 most distinct words
  if (cleaned.length > 24) {
    const words = cleaned.split(" ").filter(Boolean);
    if (words.length > 2) {
      cleaned = words.slice(0, 2).join(" ");
    }
  }

  return cleaned.trim() || rawName.split(" ")[0] || rawName;
}

/**
 * Generates formatted, clickable YouTube chapter timestamps from the video's frame timeline
 */
export function generateChapterTimestamps(ipoData: any): string {
  const chapters = ipoData?.timeline?.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    // Standard 8-chapter fallback for full length videos
    return [
      "00:00 - Introduction & Issue Overview",
      "00:45 - Business Model & Revenue Segments",
      "01:35 - Sector Backdrop & Market Opportunity",
      "02:25 - 3-Year Financial Statements & Margins",
      "03:20 - Issue Details & Capital Allocation",
      "04:15 - Listed Peer Benchmarking & Valuation",
      "05:08 - Critical Red Flags & Structural Risks",
      "05:58 - Final Analyst Scorecard & Verdict",
    ].join("\n");
  }

  const defaultTitles: Record<number, string> = {
    0: "Introduction & Issue Overview",
    1: "Business Model & Monetization Channels",
    2: "Industry Backdrop & Market TAM",
    3: "3-Year Financial Health & Margins",
    4: "Issue Split & Use of Proceeds",
    5: "Valuation & Peer Benchmarking",
    6: "Critical Red Flags & Key Risks",
    7: "Final Analyst Scorecard & Verdict",
  };

  const lines: string[] = [];

  chapters.forEach((ch: any, idx: number) => {
    const startFrame = Number(ch.from) || 0;
    const totalSec = Math.floor(startFrame / 30);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");

    let title = ch.shortTitle || ch.title || defaultTitles[idx] || `Chapter ${idx + 1}`;
    // Strip leading numbers if present in title like "01 / Overview"
    title = title.replace(/^\d+[\s/–-]+/, "").trim();

    lines.push(`${mm}:${ss} - ${title}`);
  });

  return lines.join("\n");
}

/**
 * YouTube Data API v3 strictly prohibits '<' and '>' characters in titles, descriptions, and tags.
 */
export function sanitizeYouTubeDescription(desc: string): string {
  if (!desc) return "";
  let sanitized = desc
    .replace(/->|=>/g, "➔")
    .replace(/</g, "(")
    .replace(/>/g, ")")
    .replace(/\r\n/g, "\n")
    .trim();

  if (sanitized.length > 4800) {
    sanitized = sanitized.substring(0, 4800);
  }

  return sanitized;
}

export function sanitizeYouTubeTitle(title: string): string {
  if (!title) return "";
  let sanitized = title
    .replace(/->|=>/g, "➔")
    .replace(/[<>]/g, "")
    // Ensure no #Shorts tag in full length video title
    .replace(/#Shorts/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Cap title length to max 85 characters for optimal YouTube desktop/mobile readability
  if (sanitized.length > 85) {
    sanitized = sanitized.substring(0, 85).trim();
  }

  return sanitized;
}

export function sanitizeYouTubeTags(tags: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  const cleanTags: string[] = [];
  let totalLength = 0;

  for (let tag of tags) {
    if (typeof tag !== "string") continue;
    const cleaned = tag.replace(/[<>]/g, "").replace(/,/g, " ").trim();
    if (!cleaned) continue;

    const truncated = cleaned.length > 60 ? cleaned.substring(0, 60).trim() : cleaned;

    if (totalLength + truncated.length + 1 > 450) {
      break;
    }

    cleanTags.push(truncated);
    totalLength += truncated.length + 1;
  }

  return cleanTags;
}

/**
 * Uses Groq (Qwen/Llama) to generate high-CTR full-length YouTube video metadata with interactive chapters
 */
export async function generateYouTubeMetadata(
  companyName: string,
  ipoData: any,
  scriptText: string
): Promise<YouTubeAIMetadata> {
  const shortBrandName = cleanCompanyNameForTitle(companyName);
  const chapterTimestamps = generateChapterTimestamps(ipoData);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ GROQ_API_KEY not set. Using deterministic high-CTR template.");
    return buildFallbackMetadata(companyName, shortBrandName, ipoData, chapterTimestamps);
  }

  const model = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

  console.log(`\n🤖 Generating long-form YouTube deep-dive metadata via Groq (${model})...`);
  console.log(`   🏷️ Raw Name: "${companyName}" ➔ Short Brand: "${shortBrandName}"`);

  // Extract financial data points
  const issueSize = ipoData?.issue?.totalFormatted || "N/A";
  const priceBand = ipoData?.issue?.priceBand || "N/A";
  const lotSize = ipoData?.issue?.lotSize || "N/A";
  const revenueCagr = ipoData?.financials?.revenue?.cagr || "+35% CAGR";
  const isProfitable = ipoData?.financials?.pat?.isProfitableNow ?? true;
  const peRatio = ipoData?.peers?.industryAveragePe || "N/A";
  const recommendation = ipoData?.verdict?.shortTermVerdict || ipoData?.verdict?.longTermVerdict || "Review & Decide";

  const prompt = `You are a world-class financial creator and YouTube video SEO strategist specialized in Indian Stock Market and IPO deep-dives.

Your task is to generate complete, high-CTR, SEO-optimized metadata for a FULL-LENGTH 16:9 YouTube deep-dive video about "${shortBrandName} IPO" (Legal company: ${companyName}).

Video Context & Financials:
- Company Brand: ${shortBrandName}
- Total Issue Size: ${issueSize}
- Price Band: ${priceBand}
- Lot Size: ${lotSize}
- 3-Year Revenue CAGR: ${revenueCagr}
- Current Profitability: ${isProfitable ? "Profitable" : "Loss-making / Turnaround"}
- Valuation Multiple (P/E): ${peRatio}
- Analyst Verdict: ${recommendation}
- Narration Sample:
${scriptText ? scriptText.substring(0, 1000) : "N/A"}

CRITICAL RULES FOR FULL-LENGTH YOUTUBE VIDEOS:
1. "title": MUST be 60 to 80 characters long. Highly click-worthy, curiosity-inducing, and professional.
   - DO NOT include "#Shorts" (this is a full-length 16:9 video).
   - High-CTR Formats:
     * "${shortBrandName} IPO Analysis: 10x Growth or Trap? 🚨 Full Breakdown"
     * "${shortBrandName} IPO Review: 3-Year Financials, GMP & Verdict"
     * "Should You Apply for ${shortBrandName} IPO? ⚠️ Hidden Risks Exposed!"
   - Never use '<' or '>'.

2. "description":
   - Engaging opening hook explaining what this deep-dive covers.
   - 📌 Key IPO Details: Issue Size, Price Band, Lot Size, Fresh vs OFS.
   - 📊 3-Year Financial Health: Revenue CAGR, Margins, Profitability.
   - ⚖️ Peer Valuation: Benchmarking against listed competitors.
   - ⚠️ Statutory SEBI Disclaimer: "Strictly for educational and informational purposes. Not financial or investment advice. Consult a SEBI registered investment advisor before investing."
   - 🏷️ 6-10 targeted YouTube hashtags (e.g. #${shortBrandName.replace(/[^a-zA-Z0-9]/g, "")}IPO #StockMarket #IPOReview #Investing).

3. "tags": Array of 15-20 targeted search queries (e.g. "${shortBrandName.toLowerCase()} ipo", "${companyName.toLowerCase()} ipo", "${shortBrandName.toLowerCase()} ipo review", "${shortBrandName.toLowerCase()} ipo analysis", "${shortBrandName.toLowerCase()} ipo apply or avoid", "${shortBrandName.toLowerCase()} ipo gmp", "upcoming ipo 2026", "stock market deep dive", "ipo review india").

4. "pinnedComment": A thoughtful, open-ended question to ignite community discussion in the comments (e.g. "What is your take on ${shortBrandName} IPO? Are you applying for listing gains or waiting post-listing? Let's discuss below! 👇").

Return ONLY a valid JSON object matching this exact schema:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", ...],
  "pinnedComment": "..."
}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 1800,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content) as YouTubeAIMetadata;

    const finalTitle = sanitizeYouTubeTitle(parsed.title || `${shortBrandName} IPO Analysis: Apply or Avoid? 🚨 Full Review`);

    // Inject Chapter Timestamps at top of description for seamless YouTube native player chapters
    const formattedDescription = `In this deep-dive video, we analyze the ${companyName} IPO — breaking down its 3-year historical financials, business model, listed peer comparison, critical red flags, and our final analyst verdict.\n\n⏱️ CHAPTER TIMESTAMPS:\n${chapterTimestamps}\n\n${parsed.description}`;

    parsed.title = finalTitle;
    parsed.description = sanitizeYouTubeDescription(formattedDescription);
    parsed.tags = sanitizeYouTubeTags(parsed.tags || []);
    parsed.pinnedComment = (parsed.pinnedComment || `What are your thoughts on ${shortBrandName} IPO? Are you applying or avoiding? Share below! 👇`).replace(/[<>]/g, "").trim();
    parsed.chapterTimestamps = chapterTimestamps;

    console.log(`✅ Generated long-form video metadata!`);
    console.log(`   📌 Title (${parsed.title.length} chars): "${parsed.title}"`);
    console.log(`   ⏱️ Included ${chapterTimestamps.split("\n").length} chapter timestamps`);
    console.log(`   🏷️ Tags count: ${parsed.tags?.length || 0}`);

    return parsed;
  } catch (error) {
    console.warn("⚠️ Groq metadata generation error. Falling back to deterministic template:", error);
    return buildFallbackMetadata(companyName, shortBrandName, ipoData, chapterTimestamps);
  }
}

/**
 * Deterministic fallback metadata generator for full-length IPO deep-dives
 */
function buildFallbackMetadata(
  companyName: string,
  shortBrandName: string,
  ipoData: any,
  chapterTimestamps: string
): YouTubeAIMetadata {
  const issueSize = ipoData?.issue?.totalFormatted || "Check RHP";
  const priceBand = ipoData?.issue?.priceBand || "Check RHP";
  const lotSize = ipoData?.issue?.lotSize || "N/A";
  const revenueCagr = ipoData?.financials?.revenue?.cagr || "+30% CAGR";
  const tagCompany = shortBrandName.replace(/[^a-zA-Z0-9]/g, "");

  const title = sanitizeYouTubeTitle(`${shortBrandName} IPO Analysis: 10x Opportunity or Valuation Trap? 🚨 Deep Dive`);

  const description = sanitizeYouTubeDescription(`In this comprehensive deep-dive video, we break down the ${companyName} IPO. We analyze 3-year financials, revenue growth, profitability margins, peer valuations, and top risks to help you make an informed decision.

⏱️ CHAPTER TIMESTAMPS:
${chapterTimestamps}

📌 KEY ISSUE DETAILS:
• Total Issue Size: ${issueSize}
• Price Band: ${priceBand}
• Lot Size: ${lotSize}
• Topline Revenue: ${revenueCagr}
• Recommendation: ${ipoData?.verdict?.shortTermVerdict || "Analyst Reviewed"}

⚠️ STATUTORY DISCLAIMER:
Strictly for educational and research purposes only. This video is NOT investment or financial advice. We are not SEBI registered advisors. Please consult your financial advisor before making any investment decisions.

#${tagCompany}IPO #StockMarket #IPOReview #DalalStreet #Investing #IndianStockMarket #IPOAnalysis`);

  const tags = sanitizeYouTubeTags([
    `${shortBrandName.toLowerCase()} ipo`,
    `${companyName.toLowerCase()} ipo`,
    `${shortBrandName.toLowerCase()} ipo review`,
    `${shortBrandName.toLowerCase()} ipo analysis`,
    `${shortBrandName.toLowerCase()} ipo apply or avoid`,
    `${shortBrandName.toLowerCase()} ipo gmp today`,
    `${shortBrandName.toLowerCase()} share price target`,
    "upcoming ipo 2026",
    "latest ipo review",
    "stock market deep dive",
    "ipo analysis india",
    "dalal street news",
  ]);

  const pinnedComment = `Will you be applying for ${shortBrandName} IPO or skipping this one? Share your investment rationale below! 👇`;

  return {
    title,
    description,
    tags,
    pinnedComment,
    chapterTimestamps,
  };
}
