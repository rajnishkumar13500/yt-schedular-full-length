import fs from "fs";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

export interface DriveIPOFolders {
  id: string;
  name: string;
  slug: string;
}

export interface DownloadedIPOAssets {
  folderName: string;
  slug: string;
  videoPath: string;
  ipoDataPath: string;
  scriptTextPath: string;
  thumbnailPath?: string;
  logoPath?: string;
  ipoData: any;
  scriptText: string;
}

export function getDriveClient() {
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN?.trim();
  const clientId = process.env.GDRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GDRIVE_CLIENT_SECRET?.trim();

  if (!refreshToken || !clientId || !clientSecret) {
    console.error("❌ Google Drive credentials missing in .env!");
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "http://localhost:3000/oauth2callback"
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

/**
 * Finds all unprocessed IPO folders in the Drive parent folder.
 * Any non-archive folder present in the incoming root is treated as a candidate.
 */
export async function getUnprocessedIPOsFromDrive(): Promise<DriveIPOFolders[]> {
  const parentFolderId = process.env.GDRIVE_PARENT_FOLDER_ID;
  if (!parentFolderId) {
    throw new Error("GDRIVE_PARENT_FOLDER_ID not set in .env!");
  }

  const drive = getDriveClient();
  if (!drive) throw new Error("Drive client initialization failed.");

  console.log(`\n🔍 Scanning Google Drive folder (${parentFolderId})...`);

  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name, createdTime)",
    orderBy: "createdTime desc",
  });

  const folders = res.data.files || [];
  console.log(`📁 Found ${folders.length} folder(s) in Drive:`, folders.map((f) => f.name));

  const ignoredFolders = ["uploaded", "processed", "archive", "archives"];
  const unprocessed: DriveIPOFolders[] = [];

  for (const folder of folders) {
    if (!folder.name || !folder.id) continue;

    // Ignore archive/uploaded folders
    if (ignoredFolders.includes(folder.name.toLowerCase().trim())) {
      continue;
    }

    const slug = folder.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    unprocessed.push({
      id: folder.id,
      name: folder.name,
      slug,
    });
  }

  return unprocessed;
}

/**
 * Checks whether a given Google Drive folder contains a valid .mp4 video file
 */
export async function folderContainsVideo(folderId: string): Promise<boolean> {
  const drive = getDriveClient();
  if (!drive) return false;

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
  });

  const files = res.data.files || [];
  return files.some((f) => f.name?.toLowerCase().endsWith(".mp4"));
}

/**
 * Finds or creates the 'Uploaded' archive folder in Google Drive
 */
export async function getOrCreateArchiveFolder(archiveFolderName: string = "Uploaded"): Promise<string> {
  const drive = getDriveClient();
  const parentFolderId = process.env.GDRIVE_PARENT_FOLDER_ID;
  if (!drive || !parentFolderId) throw new Error("Drive client or parent folder ID missing.");

  // Check if archive folder already exists
  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = '${archiveFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  // Create archive folder
  console.log(`📁 Creating "${archiveFolderName}" archive folder in Google Drive...`);
  const createRes = await drive.files.create({
    requestBody: {
      name: archiveFolderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });

  return createRes.data.id!;
}

/**
 * Moves a processed company folder from the incoming root to the 'Uploaded/' archive folder
 */
export async function moveFolderToArchive(
  folderId: string,
  folderName: string,
  archiveFolderName: string = "Uploaded"
): Promise<void> {
  const drive = getDriveClient();
  if (!drive) throw new Error("Drive client missing.");

  const archiveFolderId = await getOrCreateArchiveFolder(archiveFolderName);

  console.log(`📦 Moving company folder "${folderName}" to "${archiveFolderName}/" on Google Drive...`);

  // Dynamically resolve existing parents to ensure clean, reliable relocation
  const file = await drive.files.get({ fileId: folderId, fields: "id, parents" });
  const currentParents = (file.data.parents || []).join(",");

  await drive.files.update({
    fileId: folderId,
    addParents: archiveFolderId,
    removeParents: currentParents,
    fields: "id, parents",
  });

  console.log(`✅ Successfully moved "${folderName}" to "${archiveFolderName}/". Main folder remains clean!`);
}

/**
 * Downloads a Drive file to local disk
 */
async function downloadDriveFile(drive: any, fileId: string, destPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const dest = fs.createWriteStream(destPath);

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  return new Promise((resolve, reject) => {
    res.data
      .on("end", () => resolve())
      .on("error", (err: any) => reject(err))
      .pipe(dest);
  });
}

/**
 * Downloads the video and asset files for a selected IPO folder
 */
export async function downloadIPOAssetsFromDrive(
  folder: DriveIPOFolders,
  tempBaseDir: string = path.resolve(__dirname, "../temp")
): Promise<DownloadedIPOAssets | null> {
  const drive = getDriveClient();
  if (!drive) return null;

  const targetDir = path.join(tempBaseDir, folder.slug);
  fs.mkdirSync(targetDir, { recursive: true });

  console.log(`\n📥 Downloading assets for "${folder.name}" into temp/${folder.slug}...`);

  // 1. List files inside company folder
  const folderContent = await drive.files.list({
    q: `'${folder.id}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
  });

  const files = folderContent.data.files || [];
  let videoFile = files.find((f) => f.name?.endsWith(".mp4"));
  let assetsFolder = files.find(
    (f) => f.name === "assets" && f.mimeType === "application/vnd.google-apps.folder"
  );

  if (!videoFile) {
    console.warn(`⚠️ No .mp4 video found in folder "${folder.name}"`);
    return null;
  }

  // 2. Download MP4
  const videoLocalPath = path.join(targetDir, videoFile.name!);
  console.log(`   📹 Downloading video: ${videoFile.name}...`);
  await downloadDriveFile(drive, videoFile.id!, videoLocalPath);
  console.log(`   ✅ Video downloaded (${(fs.statSync(videoLocalPath).size / 1024 / 1024).toFixed(1)} MB)`);

  // 3. Find files in assets/ subfolder & company root
  let ipoDataContent: any = {};
  let scriptTextContent: string = "";
  let thumbnailLocalPath: string | undefined = undefined;
  let logoLocalPath: string | undefined = undefined;
  const ipoDataLocalPath = path.join(targetDir, "ipo_data.json");
  const scriptTextLocalPath = path.join(targetDir, "script.txt");

  // Check if thumbnail is in root folder (e.g. moneyview-thumb.png or thumbnail.png)
  const rootThumbFile = files.find((f) => f.name?.toLowerCase().includes("thumb") && f.name?.toLowerCase().endsWith(".png"));
  if (rootThumbFile) {
    const dest = path.join(targetDir, "thumbnail.png");
    console.log(`   🖼️ Downloading thumbnail: ${rootThumbFile.name}...`);
    await downloadDriveFile(drive, rootThumbFile.id!, dest);
    thumbnailLocalPath = dest;
  }

  if (assetsFolder) {
    const assetsContent = await drive.files.list({
      q: `'${assetsFolder.id}' in parents and trashed = false`,
      fields: "files(id, name)",
    });

    const aFiles = assetsContent.data.files || [];
    const ipoDataFile = aFiles.find((f) => f.name === "ipo_data.json");
    const scriptFile = aFiles.find((f) => f.name === "script.txt");
    const thumbFile = aFiles.find((f) => f.name?.toLowerCase().startsWith("thumb") || f.name === "thumbnail.png");
    const logoFile = aFiles.find((f) => f.name?.toLowerCase().startsWith("logo."));

    if (ipoDataFile) {
      console.log(`   📊 Downloading ipo_data.json...`);
      await downloadDriveFile(drive, ipoDataFile.id!, ipoDataLocalPath);
      try {
        ipoDataContent = JSON.parse(fs.readFileSync(ipoDataLocalPath, "utf-8"));
      } catch (_) {}
    }

    if (scriptFile) {
      console.log(`   📝 Downloading script.txt...`);
      await downloadDriveFile(drive, scriptFile.id!, scriptTextLocalPath);
      scriptTextContent = fs.readFileSync(scriptTextLocalPath, "utf-8");
    }

    if (thumbFile && !thumbnailLocalPath) {
      const dest = path.join(targetDir, "thumbnail.png");
      console.log(`   🖼️ Downloading thumbnail from assets/: ${thumbFile.name}...`);
      await downloadDriveFile(drive, thumbFile.id!, dest);
      thumbnailLocalPath = dest;
    }

    if (logoFile) {
      const ext = path.extname(logoFile.name!) || ".png";
      const dest = path.join(targetDir, `logo${ext}`);
      console.log(`   🎨 Downloading company logo: ${logoFile.name}...`);
      await downloadDriveFile(drive, logoFile.id!, dest);
      logoLocalPath = dest;
    }
  }

  return {
    folderName: folder.name,
    slug: folder.slug,
    videoPath: videoLocalPath,
    ipoDataPath: ipoDataLocalPath,
    scriptTextPath: scriptTextLocalPath,
    thumbnailPath: thumbnailLocalPath,
    logoPath: logoLocalPath,
    ipoData: ipoDataContent,
    scriptText: scriptTextContent,
  };
}

// Standalone CLI runner
if (require.main === module) {
  (async () => {
    const unprocessed = await getUnprocessedIPOsFromDrive();
    console.log(`\n📋 Found ${unprocessed.length} unworked IPO folder(s) ready for YouTube:`);
    for (const u of unprocessed) {
      const hasVideo = await folderContainsVideo(u.id);
      console.log(`   • ${u.name} (slug: ${u.slug}) - Video present: ${hasVideo ? "✅ Yes" : "❌ No"}`);
    }
  })();
}
