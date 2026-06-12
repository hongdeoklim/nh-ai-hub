import { Storage } from "npm:@google-cloud/storage@7.11.2";

function getGcsClient(): Storage {
  const rawKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!rawKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set.");
  }
  const credentials = JSON.parse(rawKey);
  return new Storage({
    projectId: credentials.project_id,
    credentials,
  });
}

const BUCKET_NAME = Deno.env.get("GCS_BUCKET_NAME") || "nh-ai-hub-496708.appspot.com"; // Default to common format

export async function uploadToGCS(
  objectPath: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<string> {
  const storage = getGcsClient();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(objectPath);
  
  await file.save(bytes, {
    metadata: { contentType: mimeType },
    resumable: false,
  });
  
  // Return a direct download URL if public, or a signed URL. 
  // Since this is for internal DB use, we return the gs:// URI or https URI
  return `https://storage.googleapis.com/${BUCKET_NAME}/${objectPath}`;
}

export async function deleteFromGCS(objectPath: string): Promise<void> {
  const storage = getGcsClient();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(objectPath);
  try {
    await file.delete();
  } catch (e: any) {
    console.warn(`[gcs] Delete failed for ${objectPath}`, e.message);
  }
}
