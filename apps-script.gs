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

const SHEET_NAME = 'RSVP';
const ERROR_SHEET_NAME = 'RSVP_ERRORS';

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

    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Missing sheet: ' + SHEET_NAME);

    const submissionId = safeValue_(params.submission_id) || makeSubmissionId_();
    const alreadyExists = hasSubmissionId_(sheet, submissionId);

    if (alreadyExists) {
      return json_({
        result: 'success',
        duplicate: true,
        submission_id: submissionId
      });
    }

    const row = [
      new Date(), // received_at
      submissionId,
      safeValue_(params.form_locale),
      safeValue_(params.submitted_at_utc),
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

    return json_({
      result: 'success',
      submission_id: submissionId,
      processing_ms: new Date().getTime() - startedAt.getTime()
    });
  } catch (err) {
    logError_(e, err);
    return json_({
      result: 'error',
      message: 'Submission failed. Please try again.'
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

function hasSubmissionId_(sheet, submissionId) {
  if (!submissionId) return false;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  // Column B contains submission_id in the row format above.
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === submissionId) return true;
  }
  return false;
}

function logError_(e, err) {
  try {
    const ss = SpreadsheetApp.getActive();
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
