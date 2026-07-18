/**
 * Google Apps Script - YouTube Transcript API
 *
 * Deploy: script.google.com > paste this > Deploy > New deployment > Web app
 *   Execute as: Me | Who has access: Anyone
 *
 * If you already have an existing Apps Script PROJECT deployed at the
 * /exec URL wired into script.js (see script.js comment), you do NOT need
 * a brand-new deployment: open that same project, replace its contents
 * with this file, then Deploy > Manage deployments > (pencil icon on the
 * existing deployment) > Version: New version > Deploy. That keeps the
 * SAME /exec URL, so script.js needs no URL change -- only the secret
 * (see below) once you set one.
 *
 * OPTIONAL LOCKDOWN (recommended before sharing the URL widely):
 *   Project Settings > Script Properties > add API_SECRET = <any random string>.
 *   Once set, every request must include that value as body.secret, or it's rejected.
 *   Leave unset for now if you don't want to touch your frontend yet -- it's backward
 *   compatible either way, just less protected until you wire the secret through.
 */

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return createErrorResponse(400, "BadRequest", "Missing request body", null);
    }

    var body = JSON.parse(e.postData.contents);

    var requiredSecret = PropertiesService.getScriptProperties().getProperty("API_SECRET");
    if (requiredSecret && body.secret !== requiredSecret) {
      return createErrorResponse(401, "Unauthorized", "Missing or invalid secret", null);
    }

    var url = body.url;
    var targetLang = body.lang || "";

    if (!url) {
      return createErrorResponse(400, "BadRequest", "Missing 'url' parameter in JSON body", null);
    }

    var videoId = extractVideoId(url);
    if (!videoId) {
      return createErrorResponse(400, "BadRequest", "Invalid YouTube URL provided", {"provided_url": url});
    }

    var fetchOptions = {
      muteHttpExceptions: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    };

    var htmlResponse = fetchWithRetry("https://www.youtube.com/watch?v=" + videoId, fetchOptions);
    if (!htmlResponse || htmlResponse.getResponseCode() !== 200) {
      return createErrorResponse(502, "BadGateway", "Failed to reach YouTube", {"videoId": videoId});
    }
    var html = htmlResponse.getContentText();

    var match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/) ||
                html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*</) ||
                html.match(/["']ytInitialPlayerResponse["']\s*:\s*(\{.+?\})\s*[},]/);

    if (!match) {
      return createErrorResponse(404, "NotFound", "No transcript metadata available", {"videoId": videoId});
    }

    var playerResponse = JSON.parse(match[1]);
    var captions = playerResponse.captions;

    if (!captions || !captions.playerCaptionsTracklistRenderer || !captions.playerCaptionsTracklistRenderer.captionTracks) {
      return createErrorResponse(404, "NotFound", "No captions exist for this video", {"videoId": videoId});
    }

    var tracks = captions.playerCaptionsTracklistRenderer.captionTracks;

    var selectedTrack = null;
    var isAutoTranslated = false;

    if (targetLang) {
      for (var i = 0; i < tracks.length; i++) {
        if (tracks[i].languageCode === targetLang) {
          selectedTrack = tracks[i];
          break;
        }
      }
      if (!selectedTrack) {
        selectedTrack = preferManualTrack(tracks);
        isAutoTranslated = true;
      }
    } else {
      selectedTrack = preferManualTrack(tracks);
    }

    var transcriptUrl = selectedTrack.baseUrl;
    if (isAutoTranslated && targetLang) {
      transcriptUrl += "&tlang=" + targetLang;
    }

    var xmlResponse = fetchWithRetry(transcriptUrl, fetchOptions);
    if (!xmlResponse || xmlResponse.getResponseCode() !== 200) {
      return createErrorResponse(502, "BadGateway", "Failed to fetch transcript XML", {"transcriptUrl": transcriptUrl});
    }

    var xmlString = xmlResponse.getContentText();
    var document = XmlService.parse(xmlString);
    var root = document.getRootElement();
    var texts = root.getChildren('text');

    var fullText = [];
    for (var j = 0; j < texts.length; j++) {
      fullText.push(cleanText(texts[j].getText()));
    }

    return createSuccessResponse({
      videoId: videoId,
      transcript: fullText.join(" "),
      trackLanguage: isAutoTranslated ? targetLang : selectedTrack.languageCode,
      isAutoTranslated: isAutoTranslated,
      kind: selectedTrack.kind || "standard"
    });

  } catch (error) {
    return createErrorResponse(500, "InternalError", "Error processing transcript: " + error.toString(), null);
  }
}

function doGet(e) {
  return createSuccessResponse({
    message: "YouTube Transcript API is running. Send POST with { url: '...', lang: 'es' }.",
    version: "1.3.0"
  });
}

function fetchWithRetry(url, options) {
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      if (response.getResponseCode() === 200 || attempt === 1) {
        return response;
      }
    } catch (e) {
      if (attempt === 1) return null;
      Utilities.sleep(500);
    }
  }
  return null;
}

function preferManualTrack(tracks) {
  for (var i = 0; i < tracks.length; i++) {
    if (tracks[i].kind !== "asr") {
      return tracks[i];
    }
  }
  return tracks[0];
}

function createSuccessResponse(data) {
  var response = data;
  response.timestamp = new Date().toISOString();
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function createErrorResponse(statusCode, errorType, message, details) {
  var errorPayload = {
    error: message,
    errorType: errorType,
    details: details,
    timestamp: new Date().toISOString(),
    status_code: statusCode
  };
  return ContentService.createTextOutput(JSON.stringify(errorPayload))
    .setMimeType(ContentService.MimeType.JSON);
}

function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractVideoId(url) {
  if (!url) return null;
  url = url.trim();
  if (url.length === 11) return url;

  var patterns = [
    /v=([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
    /live\/([a-zA-Z0-9_-]{11})/
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = url.match(patterns[i]);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}
