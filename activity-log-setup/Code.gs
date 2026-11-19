// Bun Bun Manager: activity log receiver (Google Apps Script)
// Paste this into a Google Sheet: Extensions > Apps Script. See README.md for the steps.
const SHEET_NAME = "Activity";

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(SHEET_NAME);
      sh.appendRow(["Time (UTC)", "Device", "User", "Role", "Type", "What", "Details", "Page", "Language", "Screen", "Browser", "Site URL"]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, 12).setFontWeight("bold").setBackground("#1d1a18").setFontColor("#ffffff");
    }
    sh.appendRow([d.t, d.dev, d.user, d.role, d.type, d.text, d.data, d.page, d.lang, d.scr, d.ua, d.url]);
  } catch (err) {}
  return ContentService.createTextOutput("ok");
}

function doGet() {
  return ContentService.createTextOutput("Bun Bun activity log is running");
}
