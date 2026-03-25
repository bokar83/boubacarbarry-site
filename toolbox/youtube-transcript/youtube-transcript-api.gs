/**
 * Google Apps Script - YouTube Transcript API
 * Designed with @api-design-principles
 *
 * Instructions:
 * 1. Create a new Google Apps Script project at script.google.com
 * 2. Paste this code.
 * 3. Deploy > New deployment > Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Update your website's frontend (script.js) to point to the new Web App URL instead of /api/youtube-transcript.
 */

function doPost(e) {
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    return handleRequest(body.url, e.parameter);
  } catch (error) {
    return createErrorResponse(500, "InternalError", "An unexpected error occurred processing the transcript: " + error.toString(), null, e.parameter);
  }
}

/**
 * Handle GET requests to avoid CORS preflight issues entirely
 */
function doGet(e) {
  try {
    var url = e.parameter.url;
    if (!url) {
      return createSuccessResponse({
        message: "YouTube Transcript API is running. Please send a GET request with ?url=...",
        version: "1.0.0"
      }, e.parameter);
    }
    return handleRequest(url, e.parameter);
  } catch (error) {
    return createErrorResponse(500, "InternalError", "An unexpected error occurred processing the transcript: " + error.toString(), null, e.parameter);
  }
}

/**
 * Core logic to extract transcript
 */
function handleRequest(url, params) {
  if (!url) {
    return createErrorResponse(400, "BadRequest", "Missing 'url' parameter", null, params);
  }

  var videoId = extractVideoId(url);
  if (!videoId) {
    return createErrorResponse(400, "BadRequest", "Invalid YouTube URL provided", {"provided_url": url}, params);
  }

  // Fetch YouTube page HTML to bypass API authentication limits for public captions
  var htmlResponse = UrlFetchApp.fetch("https://www.youtube.com/watch?v=" + videoId, { muteHttpExceptions: true });
  if (htmlResponse.getResponseCode() !== 200) {
      return createErrorResponse(502, "BadGateway", "Failed to reach YouTube", {"videoId": videoId}, params);
  }
  var html = htmlResponse.getContentText();

  // Extract ytInitialPlayerResponse — use greedy match with [\s\S] so the full JSON
  // object is captured even if it spans lines or contains "};" inside string values.
  var match = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+\});/);
  if (!match) {
    return createErrorResponse(404, "NotFound", "No transcript metadata available for this video", {"videoId": videoId}, params);
  }

  var playerResponse;
  try {
    playerResponse = JSON.parse(match[1]);
  } catch (parseError) {
    return createErrorResponse(500, "ParseError", "Failed to parse YouTube player response", {"videoId": videoId}, params);
  }

  var captions = playerResponse.captions;

  if (!captions || !captions.playerCaptionsTracklistRenderer || !captions.playerCaptionsTracklistRenderer.captionTracks) {
    return createErrorResponse(404, "NotFound", "No captions or transcript tracks exist for this video", {"videoId": videoId}, params);
  }

  var tracks = captions.playerCaptionsTracklistRenderer.captionTracks;

  // Guard against an empty tracks array before accessing index 0
  if (!tracks.length) {
    return createErrorResponse(404, "NotFound", "No caption tracks found for this video", {"videoId": videoId}, params);
  }

  // Default to the first track (usually auto-generated English or the creator's default upload)
  var transcriptUrl = tracks[0].baseUrl;

  // Fetch the raw transcript XML
  var xmlResponse = UrlFetchApp.fetch(transcriptUrl, { muteHttpExceptions: true });
  if (xmlResponse.getResponseCode() !== 200) {
      return createErrorResponse(502, "BadGateway", "Failed to fetch transcript XML", {"transcriptUrl": transcriptUrl}, params);
  }

  var xmlString = xmlResponse.getContentText();
  var document;
  try {
    document = XmlService.parse(xmlString);
  } catch (xmlError) {
    return createErrorResponse(500, "ParseError", "Failed to parse transcript XML", {"videoId": videoId}, params);
  }

  var root = document.getRootElement();
  var texts = root.getChildren('text');

  var fullText = [];

  for (var i = 0; i < texts.length; i++) {
    var textNode = texts[i];
    // HTML entity decoding
    var text = textNode.getText()
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'")
                .replace(/&#x27;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&nbsp;/g, ' ');

    fullText.push(text);
  }

  // Return standard success payload matching the frontend's expected { transcript: "..." } structure
  return createSuccessResponse({
    videoId: videoId,
    transcript: fullText.join(" "),
    trackLanguage: tracks[0].languageCode,
    kind: tracks[0].kind || "standard"
  }, params);
}

/**
 * Utility: Standardized Success Response
 */
function createSuccessResponse(data, params) {
  // Use Object.assign to avoid mutating the original data object
  var response = Object.assign({}, data);
  response.timestamp = new Date().toISOString();
  var payload = JSON.stringify(response);

  if (params && params.callback) {
    // Sanitize callback name to prevent XSS/JS injection via the JSONP wrapper
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(params.callback)) {
      return ContentService.createTextOutput(JSON.stringify({
        error: "Invalid callback name",
        errorType: "BadRequest"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(params.callback + '(' + payload + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Utility: Standardized Error Response (Pattern 3 in API Design Playbook)
 */
function createErrorResponse(statusCode, errorType, message, details, params) {
  var errorPayload = {
    error: message, // Frontend expects 'error' as the message string for UI rendering
    errorType: errorType,
    details: details,
    timestamp: new Date().toISOString(),
    status_code: statusCode
  };

  var payload = JSON.stringify(errorPayload);

  if (params && params.callback) {
    // Sanitize callback name to prevent XSS/JS injection via the JSONP wrapper
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(params.callback)) {
      return ContentService.createTextOutput(JSON.stringify({
        error: "Invalid callback name",
        errorType: "BadRequest"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(params.callback + '(' + payload + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // Apps Script Web Apps usually return 200 OK naturally, relying on the payload schema.
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Utility: Extract YouTube Video ID from various URL formats
 */
function extractVideoId(url) {
  var match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return (match && match[1]) ? match[1] : (url.length === 11 ? url : null);
}
