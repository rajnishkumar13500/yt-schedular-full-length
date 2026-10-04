import fs from "fs";
import path from "path";
import sharp from "sharp";

export interface FallbackThumbnailOptions {
  companyName: string;
  ipoData?: any;
  logoPath?: string;
  outputPath: string;
}

/**
 * Generates a high-CTR 1280x720 PNG thumbnail on-the-fly using Sharp & SVG vector graphics
 */
export async function generateFallbackThumbnail(opts: FallbackThumbnailOptions): Promise<string> {
  const { companyName, ipoData, logoPath, outputPath } = opts;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const cleanName = companyName
    .replace(/\b(limited|ltd|pvt|private)\b/gi, "")
    .trim()
    .toUpperCase();

  const issueSize = ipoData?.issue?.totalFormatted || "₹1,000+ Cr";
  const revenueCagr = ipoData?.financials?.revenue?.cagr || "+35% CAGR";
  const peRatio = ipoData?.peers?.industryAveragePe || "24.5x";

  // Derive verdict tone
  const shortVerdict = (ipoData?.verdict?.shortTermVerdict || "").toLowerCase();
  let verdictText = "APPLY OR AVOID?";
  let verdictColor = "#FBBF24";

  if (shortVerdict.includes("apply") || shortVerdict.includes("subscribe")) {
    verdictText = "STRONG APPLY?";
    verdictColor = "#10B981";
  } else if (shortVerdict.includes("avoid")) {
    verdictText = "BIG TRAP? AVOID!";
    verdictColor = "#EF4444";
  }

  // Base64 encode logo if available
  let logoSvgElement = "";
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      const logoBuffer = fs.readFileSync(logoPath);
      const ext = path.extname(logoPath).replace(".", "") || "png";
      const base64 = `data:image/${ext};base64,${logoBuffer.toString("base64")}`;
      logoSvgElement = `<image href="${base64}" x="60" y="45" width="70" height="70" preserveAspectRatio="xMidYMid meet"/>`;
    } catch (_) {}
  }

  if (!logoSvgElement) {
    const initials = cleanName.slice(0, 2);
    logoSvgElement = `
      <rect x="60" y="45" width="70" height="70" rx="16" fill="#1E293B" stroke="#3B82F6" stroke-width="2"/>
      <text x="95" y="90" font-family="'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="900" fill="#60A5FA" text-anchor="middle">${initials}</text>
    `;
  }

  const svg = `
  <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0A0F1D"/>
        <stop offset="50%" stop-color="#080C16"/>
        <stop offset="100%" stop-color="#04060A"/>
      </linearGradient>

      <radialGradient id="glowBlue" cx="15%" cy="20%" r="50%">
        <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#0A0F1D" stop-opacity="0"/>
      </radialGradient>

      <radialGradient id="glowGreen" cx="85%" cy="30%" r="50%">
        <stop offset="0%" stop-color="#10B981" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#0A0F1D" stop-opacity="0"/>
      </radialGradient>

      <linearGradient id="goldText" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#F59E0B"/>
        <stop offset="100%" stop-color="#FBBF24"/>
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="1280" height="720" fill="url(#bgGrad)"/>
    <rect width="1280" height="720" fill="url(#glowBlue)"/>
    <rect width="1280" height="720" fill="url(#glowGreen)"/>

    <!-- Top Header -->
    ${logoSvgElement}
    <text x="145" y="80" font-family="'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="900" fill="#FFFFFF" letter-spacing="-0.5px">${cleanName.slice(0, 24)}</text>
    <text x="145" y="104" font-family="'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#60A5FA" letter-spacing="1.5px">INITIAL PUBLIC OFFERING • DEEP-DIVE</text>

    <!-- LIVE Pill -->
    <rect x="1050" y="52" width="170" height="44" rx="22" fill="#EF4444" fill-opacity="0.18" stroke="#EF4444" stroke-width="1.5"/>
    <circle cx="1075" cy="74" r="6" fill="#EF4444"/>
    <text x="1135" y="80" font-family="'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="1px">IPO ANALYSIS</text>

    <!-- Main Hero Headline -->
    <text x="60" y="210" font-family="'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="800" fill="#22D3EE" letter-spacing="2.5px">3-YEAR FINANCIALS &amp; PEER BENCHMARK</text>
    <text x="60" y="280" font-family="'Segoe UI', Roboto, sans-serif" font-size="68" font-weight="950" fill="#FFFFFF" letter-spacing="-1px">${cleanName.length > 18 ? "THE REAL TRUTH" : cleanName}</text>
    <text x="60" y="355" font-family="'Segoe UI', Roboto, sans-serif" font-size="68" font-weight="950" fill="url(#goldText)" letter-spacing="-1px">10X PROFIT OR TRAP?</text>

    <!-- Verdict Pill Stamp -->
    <g transform="translate(870, 190) rotate(-3)">
      <rect x="0" y="0" width="350" height="150" rx="24" fill="${verdictColor}" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="4"/>
      <text x="175" y="48" font-family="'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="900" fill="#0F172A" text-anchor="middle" letter-spacing="2px">ANALYST VERDICT</text>
      <text x="175" y="105" font-family="'Segoe UI', Roboto, sans-serif" font-size="38" font-weight="950" fill="#0F172A" text-anchor="middle" letter-spacing="1px">${verdictText}</text>
    </g>

    <!-- Bottom Stat Cards -->
    <!-- Card 1 -->
    <rect x="60" y="520" width="360" height="150" rx="20" fill="#111827" fill-opacity="0.85" stroke="#3B82F6" stroke-width="1.5"/>
    <text x="84" y="558" font-family="'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="800" fill="#94A3B8" letter-spacing="1.5px">💰 TOTAL ISSUE SIZE</text>
    <text x="84" y="605" font-family="'Segoe UI', Roboto, sans-serif" font-size="36" font-weight="900" fill="#60A5FA">${issueSize}</text>
    <text x="84" y="638" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600" fill="#64748B">Fresh Issue + OFS Allocation</text>

    <!-- Card 2 -->
    <rect x="460" y="520" width="360" height="150" rx="20" fill="#111827" fill-opacity="0.85" stroke="#10B981" stroke-width="1.5"/>
    <text x="484" y="558" font-family="'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="800" fill="#94A3B8" letter-spacing="1.5px">📈 TOPLINE REVENUE</text>
    <text x="484" y="605" font-family="'Segoe UI', Roboto, sans-serif" font-size="36" font-weight="900" fill="#34D399">${revenueCagr}</text>
    <text x="484" y="638" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600" fill="#64748B">Consistent Operating Expansion</text>

    <!-- Card 3 -->
    <rect x="860" y="520" width="360" height="150" rx="20" fill="#111827" fill-opacity="0.85" stroke="#F59E0B" stroke-width="1.5"/>
    <text x="884" y="558" font-family="'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="800" fill="#94A3B8" letter-spacing="1.5px">⚖️ VALUATION MULTIPLE</text>
    <text x="884" y="605" font-family="'Segoe UI', Roboto, sans-serif" font-size="36" font-weight="900" fill="#FBBF24">P/E: ${peRatio}</text>
    <text x="884" y="638" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="600" fill="#64748B">Listed Competitor Median</text>
  </svg>
  `;

  await sharp(Buffer.from(svg))
    .png({ quality: 95 })
    .toFile(outputPath);

  console.log(`✅ Fallback thumbnail generated: ${outputPath}`);
  return outputPath;
}
