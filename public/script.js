'use strict';

// Element references
const auditForm = document.querySelector('#audit-form');
const urlInput = document.querySelector('#url-input');
const analyzeButton = document.querySelector('#analyze-button');
const buttonLabel = analyzeButton.querySelector('.button-label');
const emptyState = document.querySelector('#empty-state');
const loadingState = document.querySelector('#loading-state');
const loadingMessage = document.querySelector('#loading-message');
const resultsSection = document.querySelector('#results-section');
const errorCard = document.querySelector('#error-card');
const errorTitle = document.querySelector('#error-title');
const errorMessage = document.querySelector('#error-message');
const errorDetail = document.querySelector('#error-detail');
const tryAgainButton = document.querySelector('#try-again-button');
const liveRegion = document.querySelector('#live-region');
const statusPill = document.querySelector('#result-status-pill');
const statusLabel = document.querySelector('#result-status-label');

const resultFields = {
  pageTitle: document.querySelector('#result-page-title'),
  status: document.querySelector('#result-status'),
  statusDetail: document.querySelector('#result-status-detail'),
  responseTime: document.querySelector('#result-response-time'),
  responseTimeDetail: document.querySelector('#result-response-time-detail'),
  https: document.querySelector('#result-https'),
  httpsDetail: document.querySelector('#result-https-detail'),
  finalUrl: document.querySelector('#result-final-url'),
  metaDescription: document.querySelector('#result-meta-description'),
  canonicalUrl: document.querySelector('#result-canonical-url'),
  robots: document.querySelector('#result-robots'),
  sitemap: document.querySelector('#result-sitemap'),
  cacheHit: document.querySelector('#result-cache-hit'),
  cacheDetail: document.querySelector('#result-cache-detail'),
  cacheAge: document.querySelector('#result-cache-age'),
};

const loadingMessages = [
  '🌼 Checking website security...',
  '🔎 Reading metadata...',
  '📄 Looking for robots.txt...',
  '🗺 Discovering sitemap...',
  '✨ Preparing your report...',
];

const accessRestrictionStatuses = new Set([401, 403, 406, 418, 429, 451, 999]);

let loadingMessageIndex = 0;
let loadingMessageInterval;
let loadingMessageTimeout;

// Loading sequence
function showNextLoadingMessage() {
  loadingMessage.classList.add('is-changing');

  loadingMessageTimeout = window.setTimeout(() => {
    loadingMessageIndex = (loadingMessageIndex + 1) % loadingMessages.length;
    loadingMessage.textContent = loadingMessages[loadingMessageIndex];
    loadingMessage.classList.remove('is-changing');
  }, 220);
}

function startLoadingSequence() {
  loadingMessageIndex = 0;
  loadingMessage.textContent = loadingMessages[loadingMessageIndex];
  loadingMessage.classList.remove('is-changing');
  loadingMessageInterval = window.setInterval(showNextLoadingMessage, 1350);
}

function stopLoadingSequence() {
  window.clearInterval(loadingMessageInterval);
  window.clearTimeout(loadingMessageTimeout);
  loadingMessage.classList.remove('is-changing');
}

function setLoading(isLoading) {
  analyzeButton.disabled = isLoading;
  analyzeButton.classList.toggle('is-loading', isLoading);
  buttonLabel.textContent = isLoading ? 'Analyzing' : 'Analyze';
  auditForm.setAttribute('aria-busy', String(isLoading));
  loadingState.hidden = !isLoading;

  if (isLoading) {
    startLoadingSequence();
    liveRegion.textContent = 'Audit in progress.';
  } else {
    stopLoadingSequence();
  }
}

// Report-state helpers
function hideReportStates() {
  emptyState.hidden = true;
  resultsSection.hidden = true;
  resultsSection.classList.remove('is-visible');
  errorCard.hidden = true;
  errorCard.classList.remove('is-visible');
}

function showEmptyState() {
  hideReportStates();
  emptyState.hidden = false;
}

function revealCard(card) {
  card.hidden = false;

  requestAnimationFrame(() => {
    card.classList.add('is-visible');
  });

  card.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function setField(field, value, tone = 'neutral') {
  field.textContent = value;
  field.closest('.result-item').dataset.tone = tone;
}

function setLinkField(field, value, emptyLabel) {
  const hasValue = typeof value === 'string' && value.length > 0;

  field.textContent = hasValue ? value : emptyLabel;
  field.closest('.result-item').dataset.tone = hasValue ? 'neutral' : 'warning';

  if (hasValue) {
    field.href = value;
    field.target = '_blank';
    field.rel = 'noopener noreferrer';
  } else {
    field.removeAttribute('href');
    field.removeAttribute('target');
    field.removeAttribute('rel');
  }
}

// Human-readable report language
function getStatusPresentation(status) {
  if (accessRestrictionStatuses.has(status)) {
    return {
      label: 'Access restricted',
      detail: `HTTP ${status} · Automated access limited`,
      headline: 'Limited website access',
      stamp: 'Restricted',
      summary:
        'This website limits automated requests, so some information couldn’t be retrieved. The audit still completed using everything the website made available.',
      tone: 'warning',
    };
  }

  if (status >= 200 && status < 300) {
    return {
      label: 'Healthy ✓',
      detail: `HTTP ${status}`,
      stamp: 'Healthy',
      tone: 'success',
    };
  }

  if (status >= 300 && status < 400) {
    return {
      label: 'Redirected',
      detail: `HTTP ${status}`,
      stamp: 'Redirect',
      tone: 'warning',
    };
  }

  if (status >= 400 && status < 500) {
    return {
      label: 'Needs attention',
      detail: `HTTP ${status}`,
      stamp: 'Review',
      tone: 'warning',
    };
  }

  if (status >= 500) {
    return {
      label: 'Server issue',
      detail: `HTTP ${status}`,
      stamp: 'Unavailable',
      tone: 'danger',
    };
  }

  return {
    label: 'Response received',
    detail: `HTTP ${status}`,
    stamp: 'Complete',
    tone: 'neutral',
  };
}

function getResponseTimePresentation(responseTime) {
  if (responseTime < 500) {
    return {
      detail: 'Responded quickly',
      tone: 'success',
    };
  }

  if (responseTime < 1500) {
    return {
      detail: 'A moderate response',
      tone: 'warning',
    };
  }

  return {
    detail: 'Slower than expected',
    tone: 'danger',
  };
}

function formatSeconds(seconds) {
  const normalizedSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;

  return `${normalizedSeconds} ${normalizedSeconds === 1 ? 'second' : 'seconds'}`;
}

function renderResult(payload) {
  const { data, cacheHit, cacheAgeSeconds } = payload;
  const status = getStatusPresentation(data.status);
  const responseTime = getResponseTimePresentation(data.responseTime);
  const displayTitle = data.title || 'No page title found';
  const reportAge = formatSeconds(cacheAgeSeconds);

  document.querySelector('#result-title').textContent = status.headline ?? displayTitle;
  document.querySelector('#result-summary').textContent =
    status.summary ?? `${cacheHit ? 'A saved report for' : 'A fresh report for'} ${data.finalUrl}`;

  statusPill.dataset.tone = status.tone;
  statusLabel.textContent = status.stamp;

  setField(resultFields.pageTitle, displayTitle, data.title ? 'neutral' : 'warning');
  setField(resultFields.status, status.label, status.tone);
  resultFields.statusDetail.textContent = status.detail;

  setField(
    resultFields.responseTime,
    `${data.responseTime.toLocaleString()} ms`,
    responseTime.tone,
  );
  resultFields.responseTimeDetail.textContent = responseTime.detail;

  setField(
    resultFields.https,
    data.isHttps ? 'Secure connection' : 'Not secure',
    data.isHttps ? 'success' : 'warning',
  );
  resultFields.httpsDetail.textContent = data.isHttps ? 'Uses HTTPS' : 'Uses HTTP';

  setLinkField(resultFields.finalUrl, data.finalUrl, 'No final address found');
  setField(
    resultFields.metaDescription,
    data.metaDescription || 'No description found',
    data.metaDescription ? 'neutral' : 'warning',
  );
  setLinkField(resultFields.canonicalUrl, data.canonicalUrl, 'No canonical address found');

  setField(
    resultFields.robots,
    data.robotsTxtExists ? 'Available ✓' : 'Not detected',
    data.robotsTxtExists ? 'success' : 'warning',
  );
  setField(
    resultFields.sitemap,
    data.sitemapExists ? 'Available ✓' : 'Not detected',
    data.sitemapExists ? 'success' : 'warning',
  );

  setField(
    resultFields.cacheHit,
    cacheHit ? 'Served from cache' : 'Fresh audit',
    cacheHit ? 'success' : 'neutral',
  );
  resultFields.cacheDetail.textContent = cacheHit ? `Age: ${reportAge}` : 'Not served from cache';
  setField(resultFields.cacheAge, reportAge);

  revealCard(resultsSection);
  liveRegion.textContent = `Audit complete for ${data.finalUrl}.`;
}

// Error presentation
function getErrorTitle(code) {
  const titles = {
    INVALID_URL: 'That address needs another look',
    RATE_LIMIT_EXCEEDED: 'A little breathing room',
    FETCH_FAILED: 'We couldn’t reach that website',
  };

  return titles[code] || 'We couldn’t complete that audit';
}

function renderError(error) {
  errorTitle.textContent = getErrorTitle(error?.code);
  errorMessage.textContent =
    error?.message || 'Something unexpected happened. Please wait a moment and try again.';

  if (Number.isFinite(error?.retryAfterSeconds)) {
    errorDetail.textContent = `Please try again in ${formatSeconds(error.retryAfterSeconds)}.`;
    errorDetail.hidden = false;
  } else {
    errorDetail.hidden = true;
    errorDetail.textContent = '';
  }

  revealCard(errorCard);
  liveRegion.textContent = errorTitle.textContent;
}

// Existing audit API interaction
auditForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!auditForm.reportValidity()) {
    return;
  }

  hideReportStates();
  setLoading(true);

  try {
    const response = await fetch('/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: urlInput.value.trim(),
      }),
    });

    let payload;

    try {
      payload = await response.json();
    } catch {
      throw new Error('The server returned an unreadable response.');
    }

    setLoading(false);

    if (!response.ok || payload.success !== true) {
      renderError(payload.error);
      return;
    }

    renderResult(payload);
  } catch {
    setLoading(false);
    renderError({
      code: 'NETWORK_ERROR',
      message: 'PagePulse is unavailable right now. Please check your connection and try again.',
    });
  }
});

tryAgainButton.addEventListener('click', () => {
  showEmptyState();
  urlInput.focus();
});
