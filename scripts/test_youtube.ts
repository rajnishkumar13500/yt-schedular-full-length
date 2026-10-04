import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

export function getYouTubeClient() {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim() || process.env.GDRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim() || process.env.GDRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3000/oauth2callback"
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.youtube({ version: "v3", auth: oauth2Client });
}

async function testYouTube() {
  console.log("==================================================");
  console.log("🔍  TESTING YOUTUBE DATA API CONNECTION");
  console.log("==================================================");

  const youtube = getYouTubeClient();
  if (!youtube) {
    console.error("❌ YouTube credentials not configured in .env!");
    console.log("💡 Run: npm run auth:youtube to authorize your YouTube channel.");
    process.exit(1);
  }

  try {
    console.log("📡 Fetching your YouTube channel information...");
    const res = await youtube.channels.list({
      part: ["snippet", "contentDetails", "statistics"],
      mine: true,
    });

    const channel = res.data.items?.[0];
    if (!channel) {
      console.error("❌ No YouTube channel found for this Google account.");
      console.log("👉 Make sure your Google account has a created YouTube channel.");
      process.exit(1);
    }

    console.log(`\n🎉 Successfully connected to YouTube!`);
    console.log(`📺 Channel Name: ${channel.snippet?.title}`);
    console.log(`🆔 Channel ID:   ${channel.id}`);
    console.log(`👥 Subscribers:  ${channel.statistics?.subscriberCount || "Hidden"}`);
    console.log(`📹 Total Videos: ${channel.statistics?.videoCount || 0}`);
    console.log(`🔗 Channel Link: https://youtube.com/channel/${channel.id}`);
    console.log("\n==================================================");
    console.log("✅  YOUTUBE PUBLISHER READY FOR UPLOADS!");
    console.log("==================================================");
  } catch (error: any) {
    console.error("\n❌ YouTube connection error:");
    console.error(JSON.stringify(error.response?.data || error.message || error, null, 2));
    if (error.code === 403 && error.message?.includes("YouTube Data API v3 has not been used")) {
      console.log("\n👉 Please enable the YouTube Data API v3 in Google Cloud Console:");
      console.log("   https://console.cloud.google.com/apis/library/youtube.googleapis.com");
    }
  }
}

if (require.main === module) {
  testYouTube();
}
