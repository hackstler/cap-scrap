// background/drive-api.js
// Responsibility: Google Drive folder management and screenshot upload.

const DriveApi = (() => {
  "use strict";

  const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files";
  const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink";
  const FOLDER_NAME = "Cap Valoraciones";
  const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
  const UPLOAD_BOUNDARY_PREFIX = "cap_screenshots_boundary_";

  let cachedFolderId = null;

  const buildAuthHeaders = (token) => ({ Authorization: `Bearer ${token}` });

  const findExistingFolder = async (token) => {
    const query = `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`;
    const searchUrl = `${DRIVE_API_BASE}?q=${encodeURIComponent(query)}&fields=files(id,name)`;

    const response = await fetch(searchUrl, {
      headers: buildAuthHeaders(token),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.files?.length > 0 ? data.files[0].id : null;
  };

  const createFolder = async (token) => {
    const response = await fetch(DRIVE_API_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Drive folder creation failed: ${response.status} ${body.substring(0, 200)}`);
    }

    const folder = await response.json();
    return folder.id;
  };

  const ensureFolder = async (token) => {
    if (cachedFolderId) return cachedFolderId;

    const folderId = await findExistingFolder(token);
    if (folderId) {
      cachedFolderId = folderId;
      return cachedFolderId;
    }

    cachedFolderId = await createFolder(token);
    return cachedFolderId;
  };

  const convertDataUrlToBlob = (dataUrl) => {
    const base64Data = dataUrl.split(",")[1];
    const binaryString = atob(base64Data);
    const byteArray = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      byteArray[i] = binaryString.charCodeAt(i);
    }
    return new Blob([byteArray], { type: "image/png" });
  };

  const generateScreenshotFileName = (refCatastral) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
    return `${refCatastral}_${timestamp}.png`;
  };

  const uploadScreenshot = async (token, refCatastral, screenshotDataUrl) => {
    const folderId = await ensureFolder(token);
    const imageBlob = convertDataUrlToBlob(screenshotDataUrl);
    const fileName = generateScreenshotFileName(refCatastral);

    const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
    const boundary = `${UPLOAD_BOUNDARY_PREFIX}${Date.now()}`;
    const header = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: image/png\r\n\r\n`;
    const footer = `\r\n--${boundary}--`;

    const requestBody = new Blob([header, imageBlob, footer], {
      type: `multipart/related; boundary=${boundary}`,
    });

    const response = await fetch(DRIVE_UPLOAD_URL, {
      method: "POST",
      headers: buildAuthHeaders(token),
      body: requestBody,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Drive upload failed: ${response.status} ${errBody.substring(0, 200)}`);
    }

    const file = await response.json();
    return file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
  };

  return { ensureFolder, uploadScreenshot };
})();
