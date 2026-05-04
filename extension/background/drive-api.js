// background/drive-api.js
// Responsibility: Google Drive folder management and screenshot upload.

var DriveApi = (function () {
  "use strict";

  var DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files";
  var DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink";
  var FOLDER_NAME = "Cap Valoraciones";
  var FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
  var UPLOAD_BOUNDARY_PREFIX = "cap_screenshots_boundary_";

  var cachedFolderId = null;

  function buildAuthHeaders(token) {
    return { Authorization: "Bearer " + token };
  }

  /**
   * Finds existing folder by name, or creates one if it doesn't exist.
   * Caches the folder ID for subsequent uploads.
   */
  async function ensureFolder(token) {
    if (cachedFolderId) {
      return cachedFolderId;
    }

    var folderId = await findExistingFolder(token);
    if (folderId) {
      cachedFolderId = folderId;
      return cachedFolderId;
    }

    cachedFolderId = await createFolder(token);
    return cachedFolderId;
  }

  async function findExistingFolder(token) {
    var query = "name='" + FOLDER_NAME + "' and mimeType='" + FOLDER_MIME_TYPE + "' and trashed=false";
    var searchUrl = DRIVE_API_BASE + "?q=" + encodeURIComponent(query) + "&fields=files(id,name)";

    var response = await fetch(searchUrl, {
      headers: buildAuthHeaders(token),
    });

    if (!response.ok) {
      return null;
    }

    var data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    return null;
  }

  async function createFolder(token) {
    var response = await fetch(DRIVE_API_BASE, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE,
      }),
    });

    if (!response.ok) {
      var body = await response.text();
      throw new Error("Drive folder creation failed: " + response.status + " " + body.substring(0, 200));
    }

    var folder = await response.json();
    return folder.id;
  }

  function convertDataUrlToBlob(dataUrl) {
    var base64Data = dataUrl.split(",")[1];
    var binaryString = atob(base64Data);
    var byteArray = new Uint8Array(binaryString.length);
    for (var i = 0; i < binaryString.length; i++) {
      byteArray[i] = binaryString.charCodeAt(i);
    }
    return new Blob([byteArray], { type: "image/png" });
  }

  function generateScreenshotFileName(refCatastral) {
    var timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
    return refCatastral + "_" + timestamp + ".png";
  }

  /**
   * Uploads a screenshot (as data URL) to the Drive folder.
   * Returns the web view link for the uploaded file.
   */
  async function uploadScreenshot(token, refCatastral, screenshotDataUrl) {
    var folderId = await ensureFolder(token);
    var imageBlob = convertDataUrlToBlob(screenshotDataUrl);
    var fileName = generateScreenshotFileName(refCatastral);

    var metadata = JSON.stringify({
      name: fileName,
      parents: [folderId],
    });

    var boundary = UPLOAD_BOUNDARY_PREFIX + Date.now();
    var header = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + metadata + "\r\n--" + boundary + "\r\nContent-Type: image/png\r\n\r\n";
    var footer = "\r\n--" + boundary + "--";

    var requestBody = new Blob([header, imageBlob, footer], {
      type: "multipart/related; boundary=" + boundary,
    });

    var response = await fetch(DRIVE_UPLOAD_URL, {
      method: "POST",
      headers: buildAuthHeaders(token),
      body: requestBody,
    });

    if (!response.ok) {
      var errBody = await response.text();
      throw new Error("Drive upload failed: " + response.status + " " + errBody.substring(0, 200));
    }

    var file = await response.json();
    return file.webViewLink || "https://drive.google.com/file/d/" + file.id + "/view";
  }

  return {
    ensureFolder: ensureFolder,
    uploadScreenshot: uploadScreenshot,
  };
})();
