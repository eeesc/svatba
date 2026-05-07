/**
 * Google Apps Script backend for RSVP form.
 *
 * Setup:
 * 1) Open the target spreadsheet.
 * 2) Extensions -> Apps Script, paste this file.
 * 3) Set SHEET_NAME / ERROR_SHEET_NAME if needed.
 * 4) Deploy -> New deployment -> Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5) Put the /exec URL into both form actions in index.html + index-en.html.
 */

const SHEET_NAME = 'Sheet1';
const ERROR_SHEET_NAME = 'RSVP_ERRORS';
// Put your Google Sheet ID here to avoid failures in standalone web-app deployments.
// Example: https://docs.google.com/spreadsheets/d/<THIS_PART>/edit
const SPREADSHEET_ID = '1pSfxp-XPRSTxMI1tUkYvTkYn_zHDNQCsMi5CviWMrX4';
const RSVP_HEADERS = [
  'received_at',
  'jmeno',
  'email',
  'pocet_lidi',
  'pocet_deti',
  'prijezd',
  'ucast',
  'auto',
  'volna_mista',
  'jidlo',
  'spani',
  'pomoc_zda',
  'pomoc',
  'poznamka'
];

function doOptions() {
  return ContentService.createTextOutput('');
}

function doPost(e) {
  const startedAt = new Date();
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(8000);
    const params = e && e.parameter ? e.parameter : {};
    const paramsMulti = e && e.parameters ? e.parameters : {};

    const sheet = getOrCreateRsvpSheet_();

    const submissionId = safeValue_(params.submission_id) || makeSubmissionId_();
    const alreadyExists = hasSubmissionId_(submissionId);

    if (alreadyExists) {
      return json_({
        result: 'success',
        duplicate: true,
        submission_id: submissionId
      });
    }

    const row = [
      new Date(), // received_at
      safeValue_(params.jmeno),
      safeValue_(params.email),
      safeValue_(params.pocet_lidi),
      safeValue_(params.pocet_deti),
      safeValue_(params.prijezd),
      safeValue_(params.ucast),
      safeValue_(params.auto),
      safeValue_(params.volna_mista),
      safeValue_(params.jidlo),
      joinValues_(paramsMulti.spani),
      safeValue_(params.pomoc_zda),
      joinValues_(paramsMulti.pomoc),
      safeValue_(params.poznamka)
    ];

    sheet.appendRow(row);
    markSubmissionId_(submissionId);

    return json_({
      result: 'success',
      submission_id: submissionId,
      processing_ms: new Date().getTime() - startedAt.getTime()
    });
  } catch (err) {
    logError_(e, err);
    return json_({
      result: 'error',
      message: 'Submission failed. Please try again.',
      error_code: safeErrorCode_(err)
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateRsvpSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet && ss.getSheets().length > 0) {
    // Fallback for projects where the primary tab kept the default name.
    sheet = ss.getSheets()[0];
  }
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(RSVP_HEADERS);
  } else if (sheet.getLastRow() === 1) {
    const firstRow = sheet.getRange(1, 1, 1, RSVP_HEADERS.length).getValues()[0];
    const hasAnyHeader = firstRow.some(v => String(v).trim() !== '');
    if (!hasAnyHeader) {
      sheet.getRange(1, 1, 1, RSVP_HEADERS.length).setValues([RSVP_HEADERS]);
    }
  }

  return sheet;
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim()) {
    return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  }
  const active = SpreadsheetApp.getActive();
  if (active) return active;
  throw new Error('Spreadsheet not resolved. Set SPREADSHEET_ID.');
}

function safeValue_(value) {
  if (typeof value === 'undefined' || value === null) return '';
  return String(value).trim();
}

function joinValues_(arr) {
  if (!arr || !arr.length) return '';
  return arr.map(String).join(', ');
}

function makeSubmissionId_() {
  return 'srv-' + Utilities.getUuid();
}

function hasSubmissionId_(submissionId) {
  if (!submissionId) return false;
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('sub_' + submissionId) === '1';
}

function markSubmissionId_(submissionId) {
  if (!submissionId) return;
  const props = PropertiesService.getScriptProperties();
  props.setProperty('sub_' + submissionId, '1');
}

function logError_(e, err) {
  try {
    const ss = getSpreadsheet_();
    let sheet = ss.getSheetByName(ERROR_SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(ERROR_SHEET_NAME);

    const params = e && e.parameter ? JSON.stringify(e.parameter) : '{}';
    const stack = err && err.stack ? String(err.stack) : '';
    sheet.appendRow([
      new Date(),
      err ? String(err.message || err) : 'Unknown error',
      stack,
      params
    ]);
  } catch (_) {}
}

function safeErrorCode_(err) {
  const message = err && err.message ? String(err.message) : '';
  if (/Spreadsheet not resolved/.test(message)) return 'SPREADSHEET_NOT_RESOLVED';
  if (/Missing sheet/.test(message)) return 'MISSING_SHEET';
  return 'INTERNAL_ERROR';
}
