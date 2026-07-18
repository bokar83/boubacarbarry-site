/**
 * Google Sheets Mail Merge -- hardened version
 * Base pattern: labnol.org's open-source Gmail mail-merge script.
 *
 * Sheet layout: row 1 = headers. Column A = Name, B = Email, C = Status
 * (fixed). Any column D onward = additional merge fields -- whatever you
 * title the header, that becomes a {{HeaderName}} placeholder usable in
 * the email body (cell E9), same as {{Name}} already worked.
 */

function labnolQuota() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.getRange("E3").setValue(
      "Daily email quota remaining: " + MailApp.getRemainingDailyQuota()
  );
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Mail Merge")
    .addItem("Step 1: Reset Canvas", "labnolReset")
    .addItem("Step 2: Start Mail Merge", "labnolSendEmail")
    .addToUi();
  labnolQuota();
}

function labnolReset() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var ranges = ["E5", "E7", "E9", "E11", "E13", "E15", "E17"];
  ranges.forEach(r => sheet.getRange(r).clearContent());
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, sheet.getMaxColumns()).clearContent();
  labnolQuota();
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPlaceholderMap(headers, row) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (header) {
      map[header] = escapeHtml(row[i]);
    }
  }
  return map;
}

function applyPlaceholders(template, placeholderMap) {
  var result = template;
  for (var key in placeholderMap) {
    var pattern = new RegExp("{{" + key + "}}", "g");
    result = result.replace(pattern, placeholderMap[key]);
  }
  return result;
}

function labnolSendEmail() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  var required = ["E5", "E9", "E11"];
  for (var i = 0; i < required.length; i++) {
    if (sheet.getRange(required[i]).getValue() === "") {
      ui.alert("Error", "Please fill Subject, Body, and Your Name fields!", ui.ButtonSet.OK);
      return;
    }
  }

  var emailSubject  = sheet.getRange("E5").getValue();
  var emailBody     = sheet.getRange("E9").getValue();
  var emailYourName = sheet.getRange("E11").getValue();
  var replyToAddr   = sheet.getRange("E13").getValue();
  var fileId        = sheet.getRange("E15").getValue();
  var emailBCC      = sheet.getRange("E17").getValue();
  var emailYourAddr = Session.getActiveUser().getEmail();

  var attachments = [];
  if (fileId) {
    try {
      attachments.push(DriveApp.getFileById(fileId).getBlob());
    } catch (err) {
      ui.alert("Error", "Invalid attachment File ID: " + err.message, ui.ButtonSet.OK);
      return;
    }
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var startTime = new Date().getTime();
  var maxRuntimeMs = 5 * 60 * 1000;
  var stoppedEarly = false;

  for (var j = 1; j < data.length; j++) {
    if (new Date().getTime() - startTime > maxRuntimeMs) {
      stoppedEarly = true;
      break;
    }

    var row = data[j];
    var recipientName = row[0];
    var recipientEmail = row[1];
    var status = row[2];

    if (recipientName && recipientEmail && status !== "OK") {
      var placeholderMap = buildPlaceholderMap(headers, row);
      var personalizedBody = applyPlaceholders(emailBody, placeholderMap)
        .replace(/\n/g, "<br />");

      var options = {
        htmlBody: personalizedBody,
        name: emailYourName,
        replyTo: replyToAddr || emailYourAddr
      };

      if (attachments.length > 0) options.attachments = attachments;
      if (emailBCC === "YES") options.bcc = emailYourAddr;

      try {
        GmailApp.sendEmail(recipientEmail, emailSubject, "", options);
        sheet.getRange(j + 1, 3).setValue("OK");
      } catch (e) {
        sheet.getRange(j + 1, 3).setValue("ERROR: " + e.message);
      }

      Utilities.sleep(150);
    }
  }

  labnolQuota();
  SpreadsheetApp.flush();

  if (stoppedEarly) {
    ui.alert("Partial run", "Stopped after 5 minutes to avoid a script timeout. Progress is saved in the Status column -- click Start Mail Merge again to send the rest.", ui.ButtonSet.OK);
  }
}
