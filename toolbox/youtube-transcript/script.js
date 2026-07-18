// Detected: Static HTML + vanilla JS for YouTube transcript requests
(function () {
  const urlInput = document.getElementById('youtube-url');
  const fetchBtn = document.getElementById('fetch-btn');
  const statusEl = document.getElementById('status');
  const transcriptEl = document.getElementById('transcript');
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');

  // Apps Script Web App /exec URL. If Boubacar edits the EXISTING deployed
  // project (Deploy > Manage deployments > new version), this URL stays the
  // same as today's live one and does NOT need to change. If a brand-new
  // "New deployment" is created instead, replace this with that new URL.
  const TRANSCRIPT_API_URL = 'https://script.google.com/macros/s/AKfycbxRBXudksuoosJ2ZdVi7eq_4uESmticUnNoD1yhbAgXMNXREL1DuOsYn9yCY_kqRGyL/exec';

  // Only required once Boubacar sets a Script Property named API_SECRET on
  // the Apps Script project (see youtube-transcript-api.gs header comment).
  // Until then the script ignores this value (auth is opt-in server-side).
  const API_SECRET = 'REPLACE_WITH_API_SECRET';

  function setStatus(message, variant = 'idle') {
    statusEl.textContent = message;
    statusEl.classList.remove('error', 'success');
    if (variant === 'error') statusEl.classList.add('error');
    if (variant === 'success') statusEl.classList.add('success');
  }

  function extractVideoId(url) {
    if (!url) return null;
    const patterns = [/(?:v=)([\w-]{11})/, /youtu\.be\/([\w-]{11})/, /youtube\.com\/embed\/([\w-]{11})/];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  /**
   * POSTs to the Apps Script Web App. Uses `text/plain` as the Content-Type
   * so the browser treats this as a CORS "simple request" (no preflight
   * OPTIONS) -- Apps Script Web Apps do not implement an OPTIONS handler,
   * so a real preflight (triggered by Content-Type: application/json) would
   * fail. Apps Script still reads the raw body via e.postData.contents and
   * JSON.parses it there, so the payload itself is unaffected.
   */
  async function fetchTranscript() {
    const url = (urlInput.value || '').trim();
    if (!url) {
      setStatus('Please paste a YouTube link.', 'error');
      urlInput.focus();
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      setStatus('That does not look like a valid YouTube URL.', 'error');
      return;
    }

    setStatus('Loading transcript…');
    transcriptEl.textContent = '';

    try {
      const response = await fetch(TRANSCRIPT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ url, secret: API_SECRET })
      });

      if (!response.ok) {
        throw new Error('Network error: Failed to reach transcript server.');
      }

      const payload = await response.json();

      if (payload.error) {
        throw new Error(payload.error);
      }

      const text = (payload.transcript || '').trim();
      if (!text) {
        throw new Error('No transcript available for this video.');
      }

      transcriptEl.textContent = text;
      setStatus('Transcript loaded.', 'success');
    } catch (err) {
      console.error(err);
      const fallback = 'Transcript service is currently unavailable. Please copy captions directly from YouTube.';
      setStatus(err.message || fallback, 'error');
      transcriptEl.textContent = err.message || fallback;
    }
  }

  async function copyTranscript() {
    const text = transcriptEl.textContent.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Transcript copied to clipboard.', 'success');
    } catch (err) {
      setStatus('Unable to copy. Please copy manually.', 'error');
    }
  }

  function downloadTranscript() {
    const text = transcriptEl.textContent.trim();
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'youtube-transcript.txt';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Transcript downloaded.', 'success');
  }

  fetchBtn?.addEventListener('click', fetchTranscript);
  copyBtn?.addEventListener('click', copyTranscript);
  downloadBtn?.addEventListener('click', downloadTranscript);
  urlInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchTranscript();
    }
  });
})();
