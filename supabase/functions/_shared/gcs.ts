import { Storage } from "npm:@google-cloud/storage@7.11.2";

function getGcsClient(): Storage {
  const rawKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || Deno.env.get("GCP_SERVICE_ACCOUNT_JSON");
  if (!rawKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set.");
  }
  const credentials = JSON.parse(rawKey);
  return new Storage({
    projectId: credentials.project_id,
    credentials,
  });
}

const BUCKET_NAME = Deno.env.get("GCS_BUCKET_NAME") ?? "nh-ai-hub-496708.appspot.com";

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

type RichImage = {
  bytes: Uint8Array
  mimeType: string
  originalName: string
}

export async function uploadChatImagesToGCS({
  userEmail,
  images,
}: {
  userEmail: string
  images: RichImage[]
}): Promise<string[]> {
  const storage = getGcsClient();
  const bucket = storage.bucket(BUCKET_NAME);
  const safeEmail = userEmail.replace(/[^a-zA-Z0-9._@-]/g, "_");

  const urls: string[] = [];
  for (const image of images) {
    const ext = image.mimeType.split("/")[1]?.split("+")[0] ?? "bin";
    const safeName = image.originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const objectPath = `chat_images/${safeEmail}/${crypto.randomUUID()}-${safeName}.${ext}`;
    const file = bucket.file(objectPath);
    await file.save(image.bytes, {
      metadata: { contentType: image.mimeType },
      resumable: false,
    });
    urls.push(`https://storage.googleapis.com/${BUCKET_NAME}/${objectPath}`);
  }
  return urls;
}

/**
 * GCS에서 파일을 다운로드합니다.
 * objectPath: gs://bucket/path 또는 https://storage.googleapis.com/bucket/path 또는 단순 경로 모두 수용합니다.
 */
export async function downloadFromGCS(objectPathOrUrl: string): Promise<Uint8Array> {
  const storage = getGcsClient();

  let resolvedPath = objectPathOrUrl.trim();
  // gs://bucket/path → path 추출
  if (resolvedPath.startsWith("gs://")) {
    resolvedPath = resolvedPath.replace(/^gs:\/\/[^/]+\//, "");
  // https://storage.googleapis.com/bucket/path → path 추출
  } else if (resolvedPath.startsWith("https://storage.googleapis.com/")) {
    resolvedPath = resolvedPath.replace(/^https:\/\/storage\.googleapis\.com\/[^/]+\//, "");
  }

  const bucket = storage.bucket(BUCKET_NAME);
  const [fileContents] = await bucket.file(resolvedPath).download();
  return new Uint8Array(fileContents);
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
