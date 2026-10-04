import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getYouTubeClient } from "./test_youtube";
import {
  YouTubeAIMetadata,
  sanitizeYouTubeDescription,
  sanitizeYouTubeTitle,
  sanitizeYouTubeTags,
} from "./generate_metadata";

dotenv.config();

export interface YouTubeUploadResult {
  videoId: string;
  videoUrl: string;
  title: string;
  privacyStatus: string;
  scheduledFor?: string;
  pinnedCommentId?: string;
  thumbnailUploaded?: boolean;
}

/**
 * Calculates a forward schedule time for Tomorrow at 06:00 PM IST (12:30 UTC).
 * Provides a ~24-hour forward gap that is 100% immune to GitHub Actions runner queue delays.
 */
export function calculateNextDay6PMScheduleTime(): { publishAtIso: string; slotDescription: string } {
  const now = new Date();

  // Tomorrow's date
  const targetDate = new Date(now.getTime());
  targetDate.setUTCDate(targetDate.getUTCDate() + 1);

  // Target IST time tomorrow: 06:00 PM IST (18:00 IST) -> 12:30 UTC
  targetDate.setUTCHours(12, 30, 0, 0);

  // Safety buffer: ensure targetDate is at least 6 hours in the future
  if (targetDate.getTime() - now.getTime() < 6 * 60 * 60 * 1000) {
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
  }

  return {
    publishAtIso: targetDate.toISOString(),
    slotDescription: "Tomorrow Evening (06:00 PM IST / 12:30 UTC)",
  };
}

/**
 * Uploads a custom 1280x720 thumbnail to YouTube
 */
export async function uploadThumbnailToYouTube(
  youtube: any,
  videoId: string,
  thumbnailPath?: string
): Promise<boolean> {
  if (!thumbnailPath || !fs.existsSync(thumbnailPath)) {
    console.warn(`   ℹ️ No thumbnail file found at: ${thumbnailPath || "undefined"}`);
    return false;
  }

  const fileSize = fs.statSync(thumbnailPath).size;
  console.log(`\n🖼️ Uploading custom 1280x720 thumbnail to YouTube (${(fileSize / 1024).toFixed(1)} KB)...`);

  try {
    const ext = path.extname(thumbnailPath).toLowerCase();
    const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";

    await youtube.thumbnails.set({
      videoId,
      media: {
        mimeType,
        body: fs.createReadStream(thumbnailPath),
      },
    });

    console.log(`   ✅ Custom thumbnail successfully published on YouTube!`);
    return true;
  } catch (err: any) {
    console.warn(
      `   ⚠️ Could not set custom thumbnail (Note: YouTube channel must have verified phone number for custom thumbnails):`,
      err?.message || err
    );
    return false;
  }
}

/**
 * Uploads full-length video, sets metadata, attaches thumbnail, and schedules on YouTube
 */
export async function uploadToYouTube(
  videoPath: string,
  metadata: YouTubeAIMetadata,
  thumbnailPath?: string
): Promise<YouTubeUploadResult> {
  const youtube = getYouTubeClient();
  if (!youtube) {
    throw new Error("YouTube credentials not configured! Run: npm run auth:youtube");
  }

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found at: ${videoPath}`);
  }

  const fileSize = fs.statSync(videoPath).size;
  console.log(`\n🚀 Uploading full-length video to YouTube (${(fileSize / 1024 / 1024).toFixed(1)} MB)...`);
  console.log(`   📌 Title: "${metadata.title}"`);

  let privacyStatus = process.env.YOUTUBE_PRIVACY_STATUS || "public";
  let publishAt: string | undefined = undefined;

  const autoSchedule = process.env.YOUTUBE_AUTO_SCHEDULE === "true" || process.env.YOUTUBE_AUTO_SCHEDULE === undefined;
  if (autoSchedule) {
    const { publishAtIso, slotDescription } = calculateNextDay6PMScheduleTime();
    publishAt = publishAtIso;
    privacyStatus = "private";
    console.log(`   ⏰ Daily 6:00 PM IST Next-Day Scheduling Activated!`);
    console.log(`      Target Slot:     ${slotDescription}`);
    console.log(`      Scheduled (UTC): ${publishAt}`);
  } else {
    console.log(`   🔒 Privacy Status: ${privacyStatus}`);
  }

  const cleanTitle = sanitizeYouTubeTitle(metadata.title);
  const cleanDescription = sanitizeYouTubeDescription(metadata.description);
  const cleanTags = sanitizeYouTubeTags(metadata.tags);

  const requestBody: any = {
    snippet: {
      title: cleanTitle,
      description: cleanDescription,
      tags: cleanTags,
      categoryId: process.env.YOUTUBE_CATEGORY_ID || "27", // 27 = Education
      defaultLanguage: process.env.YOUTUBE_DEFAULT_LANGUAGE || "en",
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };

  if (publishAt) {
    requestBody.status.publishAt = publishAt;
  }

  // 1. Resumable Upload
  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody,
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = res.data.id!;
  const videoUrl = `https://youtu.be/${videoId}`;
  console.log(`\n🎉 Upload successful!`);
  console.log(`🆔 Video ID:  ${videoId}`);
  console.log(`🔗 Video URL: ${videoUrl}`);

  // 2. Upload Custom Thumbnail
  let thumbnailUploaded = false;
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    thumbnailUploaded = await uploadThumbnailToYouTube(youtube, videoId, thumbnailPath);
  }

  // 3. Post Top-level Engagement Comment
  let commentId: string | undefined = undefined;
  if (metadata.pinnedComment && metadata.pinnedComment.trim()) {
    try {
      console.log(`\n💬 Posting engagement comment...`);
      const commentRes = await youtube.commentThreads.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            videoId,
            topLevelComment: {
              snippet: {
                textOriginal: metadata.pinnedComment,
              },
            },
          },
        },
      });
      commentId = commentRes.data.id!;
      console.log(`✅ Comment posted (ID: ${commentId})`);
    } catch (commentErr: any) {
      console.warn(`⚠️ Could not post comment:`, commentErr.message || commentErr);
    }
  }

  return {
    videoId,
    videoUrl,
    title: metadata.title,
    privacyStatus,
    scheduledFor: publishAt,
    pinnedCommentId: commentId,
    thumbnailUploaded,
  };
}
