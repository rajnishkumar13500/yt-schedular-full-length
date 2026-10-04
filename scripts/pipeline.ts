import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  getUnprocessedIPOsFromDrive,
  folderContainsVideo,
  downloadIPOAssetsFromDrive,
  moveFolderToArchive,
} from "./sync_drive";
import { generateYouTubeMetadata } from "./generate_metadata";
import { uploadToYouTube } from "./publish_youtube";
import { generateFallbackThumbnail } from "./generate_thumbnail";
import { recordYouTubeUpload } from "./tracker";

dotenv.config();

async function runPublisherPipeline() {
  console.log("==================================================");
  console.log("🚀  FULL-LENGTH IPO YOUTUBE AUTO-PUBLISHER");
  console.log("==================================================");

  // 1. Scan Google Drive for unprocessed IPOs
  console.log("\n📡 Step 1: Checking Google Drive for new IPO deep-dive videos...");
  const unprocessed = await getUnprocessedIPOsFromDrive();

  if (unprocessed.length === 0) {
    console.log("\n✨ All videos on Google Drive have already been processed/uploaded! Exiting cleanly.");
    return;
  }

  const selected = unprocessed[0];
  console.log(`\n👉 Selected candidate for publishing: "${selected.name}" (${selected.slug})`);

  // 1.5 Verify that the folder contains a valid .mp4 video
  const hasVideo = await folderContainsVideo(selected.id);
  if (!hasVideo) {
    console.log(`\n⚠️ No .mp4 video found in folder "${selected.name}".`);
    console.log(`   Stopping automation gracefully (no video ready to publish yet).`);
    return;
  }

  // 2. Download Video & Assets from Google Drive
  console.log("\n📥 Step 2: Downloading 16:9 video and metadata from Google Drive...");
  const assets = await downloadIPOAssetsFromDrive(selected);

  if (!assets) {
    console.warn(`⚠️ Could not retrieve assets for "${selected.name}". Gracefully exiting.`);
    return;
  }

  // 3. Ensure 1280x720 Thumbnail exists (use Drive thumbnail or generate fallback)
  let thumbnailPath = assets.thumbnailPath;
  if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
    console.log("\n🖼️ Step 2.5: No pre-rendered thumbnail found in Drive. Generating on-the-fly high-CTR thumbnail...");
    const fallbackPath = path.join(path.dirname(assets.videoPath), "thumbnail.png");
    try {
      await generateFallbackThumbnail({
        companyName: assets.folderName,
        ipoData: assets.ipoData,
        logoPath: assets.logoPath,
        outputPath: fallbackPath,
      });
      thumbnailPath = fallbackPath;
    } catch (err: any) {
      console.warn("⚠️ Fallback thumbnail generation encountered an issue:", err?.message || err);
    }
  } else {
    console.log(`\n🖼️ Step 2.5: Verified pre-rendered thumbnail from Drive: ${thumbnailPath}`);
  }

  // 4. Generate Long-Form YouTube Metadata & Chapter Timestamps via Groq
  console.log("\n🤖 Step 3: Generating long-form metadata & chapter timestamps with AI...");
  const metadata = await generateYouTubeMetadata(
    assets.folderName,
    assets.ipoData,
    assets.scriptText
  );

  // 5. Upload Video, Set Custom Thumbnail, and Schedule for Tomorrow 6:00 PM IST
  console.log("\n📺 Step 4: Uploading 16:9 video, setting thumbnail, and scheduling for Tomorrow 6:00 PM IST...");
  const uploadResult = await uploadToYouTube(assets.videoPath, metadata, thumbnailPath);

  // 6. Move Processed Folder on Google Drive to 'Uploaded/'
  console.log("\n📁 Step 5: Moving company folder to 'Uploaded/' on Google Drive...");
  try {
    await moveFolderToArchive(selected.id, selected.name, "Uploaded");
  } catch (driveErr: any) {
    console.warn("⚠️ Warning: Failed to move folder to 'Uploaded/' on Google Drive:", driveErr.message || driveErr);
  }

  // 7. Update Local Tracker Store
  console.log("\n💾 Step 6: Updating YouTube upload tracker store...");
  recordYouTubeUpload({
    ipoSlug: assets.slug,
    companyName: assets.folderName,
    youtubeVideoId: uploadResult.videoId,
    youtubeUrl: uploadResult.videoUrl,
    publishedAt: new Date().toISOString(),
    scheduledFor: uploadResult.scheduledFor,
    privacyStatus: uploadResult.privacyStatus,
    title: uploadResult.title,
    pinnedCommentId: uploadResult.pinnedCommentId,
  });

  // 8. Cleanup local temp files
  try {
    fs.rmSync(path.dirname(assets.videoPath), { recursive: true, force: true });
    console.log("🧹 Cleaned up temporary local video and asset cache.");
  } catch (_) {}

  console.log("\n==================================================");
  console.log("🎉  FULL-LENGTH YOUTUBE PUBLICATION & SCHEDULING COMPLETE!");
  console.log(`📺  Video Title:  ${uploadResult.title}`);
  console.log(`🔗  YouTube URL:  ${uploadResult.videoUrl}`);
  console.log(`🖼️  Thumbnail:    ${uploadResult.thumbnailUploaded ? "✅ Uploaded" : "⚠️ Skipped / Default"}`);
  console.log(`🔒  Status:       ${uploadResult.privacyStatus}`);
  if (uploadResult.scheduledFor) {
    console.log(`⏰  Scheduled:    ${uploadResult.scheduledFor}`);
  }
  console.log(`📁  Drive Status: Moved to 'Uploaded/' folder`);
  console.log("==================================================");
}

runPublisherPipeline().catch((err) => {
  console.error("Fatal pipeline error:", err);
  process.exit(1);
});
