import http from "http";
import url from "url";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const ENV_PATH = path.resolve(__dirname, "../.env");

async function runYouTubeAuth() {
  console.log("==================================================");
  console.log("📺  YOUTUBE DATA API V3 OAUTH2 SETUP");
  console.log("==================================================");

  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim() || process.env.GDRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim() || process.env.GDRIVE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    console.error("❌ YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET is missing in .env!");
    console.log("💡 You can reuse your Google Cloud Client ID & Secret.");
    process.exit(1);
  }

  const redirectUri = "http://localhost:3000/oauth2callback";
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const scopes = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube.readonly",
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Force refresh_token to be generated
    scope: scopes,
  });

  console.log("\n👉 STEP 1: Open this authorization URL in your browser:\n");
  console.log(authUrl);
  console.log("\n⏳ Waiting for authorization on http://localhost:3000/oauth2callback ...\n");

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url && req.url.startsWith("/oauth2callback")) {
        const parsed = url.parse(req.url, true);
        const code = parsed.query.code as string;

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 90vh; background: #0f0f0f; color: #fff;">
                <div style="text-align: center; padding: 40px; border-radius: 12px; background: #212121; box-shadow: 0 4px 20px rgba(0,0,0,0.6);">
                  <h1 style="color: #ff0000; font-size: 32px; margin-bottom: 12px;">📺 YouTube Authorized!</h1>
                  <p style="font-size: 16px; color: #aaaaaa;">Your YouTube upload token has been securely generated.</p>
                  <p style="font-size: 14px; color: #717171; margin-top: 20px;">You can now close this tab and return to your terminal.</p>
                </div>
              </body>
            </html>
          `);

          server.close();

          console.log("📥 Authorization code received! Exchanging for tokens...");
          const { tokens } = await oauth2Client.getToken(code);

          if (!tokens.refresh_token) {
            console.warn("⚠️ No refresh_token returned. (Did you already authorize previously?)");
            console.log("Tokens:", tokens);
            return;
          }

          console.log(`\n🎉 YouTube Refresh token acquired!`);
          console.log(`🔑 Refresh Token: ${tokens.refresh_token.substring(0, 15)}...`);

          // Update .env
          let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
          if (envContent.includes("YOUTUBE_REFRESH_TOKEN=")) {
            envContent = envContent.replace(
              /YOUTUBE_REFRESH_TOKEN=.*/g,
              `YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`
            );
          } else {
            envContent += `\nYOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
          }

          fs.writeFileSync(ENV_PATH, envContent, "utf-8");
          console.log(`💾 Saved YOUTUBE_REFRESH_TOKEN to .env!`);
          console.log("\n==================================================");
          console.log("🚀  READY! Now run: npm run test:youtube");
          console.log("==================================================");
          process.exit(0);
        }
      }
    } catch (err) {
      console.error("Error exchanging code for token:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Authentication error. Check terminal logs.");
      server.close();
      process.exit(1);
    }
  });

  server.listen(3000, () => {
    import("child_process").then(({ exec }) => {
      const startCmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
      try {
        exec(`${startCmd} "" "${authUrl}"`, () => {});
      } catch (_) {}
    });
  });
}

runYouTubeAuth();
