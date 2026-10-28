const STORE_EMAIL = "kaklotar.brothers@gmail.com";
const SHEET_ID = "PASTE_YOUR_GOOGLE_SHEET_ID_HERE";
// This is the TAB name at the bottom of the spreadsheet, not the spreadsheet file name.
const SHEET_NAME = "KAILU CREATION Orders";
const HEADERS = [
  "Timestamp", "Order ID", "Customer Name", "Mobile Number", "Items", "Size",
  "House No. / Building", "Landmark", "Road / Area / Colony", "Pincode", "City",
  "State", "Payment Method", "Total (INR)", "Order Status"
];

function doGet() {
  return ContentService.createTextOutput("KAILU CREATION order endpoint is running.");
}

// Run this once manually after setting SHEET_ID to migrate the existing tab/header.
function setupOrdersSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    const oldNamedTab = ss.getSheetByName("Orders");
    if (oldNamedTab) {
      sheet = oldNamedTab;
      sheet.setName(SHEET_NAME);
    } else {
      sheet = ss.insertSheet(SHEET_NAME);
    }
  }
  ensureOrderSchema_(sheet);
  return "Orders tab is ready with columns A:O.";
}

function doPost(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};
    const required = ["customerName", "mobileNumber", "size", "houseBuilding", "roadArea", "pincode", "city", "state", "total", "items"];
    const missing = required.filter(k => !String(p[k] || "").trim());
    if (missing.length) return output_({ok:false, message:"Missing fields: " + missing.join(", ")});
    if (!/^\d{6}$/.test(String(p.pincode).trim())) return output_({ok:false, message:"Invalid pincode"});
    if (!/^[6-9]\d{9}$/.test(String(p.mobileNumber).trim())) return output_({ok:false, message:"Invalid mobile number"});

    const items = JSON.parse(p.items);
    if (!Array.isArray(items) || !items.length) return output_({ok:false, message:"No order items"});
    const now = new Date();
    const orderId = "KC-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + "-" + String(Math.floor(Math.random() * 900) + 100);
    const itemSummary = items.map(i => `${i.productName} | Size ${i.size} | Qty ${i.quantity} | ₹${i.lineTotal}`).join("\n");

    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      // If the spreadsheet only has one blank tab, reuse it instead of making a second tab.
      const allSheets = ss.getSheets();
      if (allSheets.length === 1 && allSheets[0].getLastRow() === 0) {
        sheet = allSheets[0];
        sheet.setName(SHEET_NAME);
      } else {
        sheet = ss.insertSheet(SHEET_NAME);
      }
    }
    ensureOrderSchema_(sheet);

    const row = [
      now,
      orderId,
      safeCell_(p.customerName),
      String(p.mobileNumber).trim(),
      safeCell_(itemSummary),
      safeCell_(p.size),
      safeCell_(p.houseBuilding),
      safeCell_(p.landmark || ""),
      safeCell_(p.roadArea),
      String(p.pincode).trim(),
      safeCell_(p.city),
      safeCell_(p.state),
      "Cash on Delivery (COD)",
      Number(p.total),
      "New"
    ];
    sheet.appendRow(row);
    sheet.getRange(sheet.getLastRow(), 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
    sheet.getRange(sheet.getLastRow(), 4).setNumberFormat("@"); // Keep mobile number as text.
    sheet.getRange(sheet.getLastRow(), 10).setNumberFormat("@"); // Keep PIN code as text.

    const body = [
      "New order received for KAILU CREATION", "",
      "Order ID: " + orderId,
      "Customer: " + p.customerName,
      "Mobile Number: " + p.mobileNumber,
      "Items:", itemSummary, "",
      "Size: " + p.size,
      "House No. / Building Name: " + p.houseBuilding,
      "Landmark: " + (String(p.landmark || "").trim() || "Not provided"),
      "Road Name / Area / Colony: " + p.roadArea,
      "Pincode: " + p.pincode,
      "City: " + p.city,
      "State: " + p.state,
      "Payment: Cash on Delivery (COD)",
      "Total: ₹" + p.total, "",
      "Please confirm stock, delivery and COD availability."
    ].join("\n");
    if (STORE_EMAIL && STORE_EMAIL.indexOf("@") > 0 && STORE_EMAIL !== "YOUR_EMAIL@example.com") {
      MailApp.sendEmail(STORE_EMAIL, `New KAILU CREATION order ${orderId} — ₹${p.total}`, body);
    }
    return output_({ok:true, orderId});
  } catch (err) {
    console.error(err);
    return output_({ok:false, message:String(err)});
  }
}

// Keeps the user's old order history while moving it into the requested A:O layout.
// It recognizes both the previous 13-column layout and the previous N/O Mobile/Landmark layout.
function ensureOrderSchema_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    return;
  }

  const oldHeaders = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const isCurrent = HEADERS.every((h, i) => normalizeHeader_(oldHeaders[i]) === normalizeHeader_(h));
  if (!isCurrent) {
    const oldData = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    const indexes = {};
    oldHeaders.forEach((h, i) => {
      const key = normalizeHeader_(h);
      if (key) indexes[key] = i;
    });
    const aliases = {
      "mobile number": ["mobile number", "customer mobile", "phone", "phone number"],
      "house no. / building": ["house no. / building", "house no. / building name", "house / building", "house building"],
      "road / area / colony": ["road / area / colony", "road name / area / colony", "road area", "address"],
      "total (inr)": ["total (inr)", "total", "total amount"],
      "order status": ["order status", "status"]
    };
    const migrated = oldData.map(oldRow => HEADERS.map(header => {
      const key = normalizeHeader_(header);
      let idx = indexes[key];
      if (idx === undefined && aliases[key]) {
        for (const alias of aliases[key]) {
          if (indexes[normalizeHeader_(alias)] !== undefined) {
            idx = indexes[normalizeHeader_(alias)];
            break;
          }
        }
      }
      return idx === undefined ? "" : oldRow[idx];
    }));
    // Clear the old layout before writing the normalized header and migrated records.
    sheet.getRange(1, 1, lastRow, lastCol).clearContent();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    if (migrated.length) sheet.getRange(2, 1, migrated.length, HEADERS.length).setValues(migrated);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
}

function normalizeHeader_(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeCell_(value) {
  const s = String(value || "");
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function output_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
