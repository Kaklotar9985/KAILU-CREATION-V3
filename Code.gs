const STORE_EMAIL = "kaklotar.brothers@gmail.com";
const SHEET_ID = "1VAvTtSempaIT6DzJ54KADBzdRiJj-vbtiyFfzqc94xg";
// This is the TAB name at the bottom of the spreadsheet, not the spreadsheet file name.
const SHEET_NAME = "Kailu Creation Orders Detail";
const REQUEST_LEDGER_SHEET_NAME = "_KAILU_Order_Request_Log";

// Required order layout: A:R (18 columns), in the exact order supplied.
const HEADERS = [
  "Timestamp", "Order ID", "Customer Name", "Email", "Mobile Number", "SKU", "Items", "Size", "Qty",
  "House No. / Building", "Landmark", "Road / Area / Colony", "Pincode", "City", "State",
  "Payment Method", "Total (INR)", "Order Status"
];

function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  const action = String(p.action || "");
  const clientRequestId = String(p.clientRequestId || "").trim();

  // Both transports are read-only. JSONP is the primary path; verifyFrame is a
  // compatibility path for older mobile browsers that report script.onerror on
  // the Apps Script redirect.
  if ((action === "verify" || action === "verifyFrame") && clientRequestId) {
    const response = getOrderVerificationResult_(clientRequestId);

    if (action === "verifyFrame") {
      const nonce = String(p.nonce || "");
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(nonce)) {
        return HtmlService.createHtmlOutput("Invalid verification nonce.");
      }

      const message = {
        type: "KAILU_ORDER_VERIFY_RESULT",
        requestId: clientRequestId,
        nonce: nonce,
        result: response
      };
      // Escape HTML-sensitive characters before embedding JSON into an inline
      // script; response strings must never be able to close this script element.
      const messageJson = JSON.stringify(message)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
      const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
        '<script>(function(){var m=' + messageJson +
        ';try{if(window.parent&&window.parent!==window){window.parent.postMessage(m,"*");}}catch(e){}})();<\/script>' +
        '</body></html>';
      return HtmlService.createHtmlOutput(html)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    const callback = String(p.callback || "");
    if (!/^kailuOrderVerify_[A-Za-z0-9_]+$/.test(callback)) {
      return ContentService.createTextOutput("Invalid verification callback.");
    }
    return ContentService.createTextOutput(callback + "(" + JSON.stringify(response) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput("KAILU CREATION order endpoint is running.");
}

function getOrderVerificationResult_(clientRequestId) {
  let response = {
    ok: false,
    pending: true,
    code: "ORDER_PENDING",
    message: "Order save is not confirmed yet."
  };
  try {
    const cachedResult = CacheService.getScriptCache().get(requestCacheKey_(clientRequestId));
    if (cachedResult) {
      try { response = JSON.parse(cachedResult); }
      catch (_) { response = { ok: true, orderId: cachedResult }; }
    }

    // CacheService can evict entries. The persistent ledger makes confirmation
    // and duplicate protection survive cache expiry and page reloads.
    if (!response || response.ok !== true) {
      const ledgerResult = findRequestLedger_(clientRequestId);
      if (ledgerResult && ledgerResult.ok === true) response = ledgerResult;
    }
  } catch (verifyError) {
    console.error("Order verification failed:", verifyError);
    response = {
      ok: false,
      pending: true,
      code: "VERIFY_SERVER_ERROR",
      message: "Order verification temporarily failed on the Apps Script server. The order may already be saved; do not submit it again yet."
    };
  }
  return response;
}

// Run this once manually after updating the script to migrate/prepare the existing tab.
// Existing order rows are mapped by their header names and retained.
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
  ensureRequestLedgerSheet_(ss);
  return "Orders tab is ready with columns A:R (18 columns) and request verification ledger.";
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  let requestIdForVerification = "";
  try {
    lock.waitLock(15000);
    lockAcquired = true;
    const p = (e && e.parameter) ? e.parameter : {};
    const clientRequestId = String(p.clientRequestId || "").trim();
    requestIdForVerification = clientRequestId;
    const cache = CacheService.getScriptCache();
    const cacheKey = clientRequestId ? requestCacheKey_(clientRequestId) : "";
    const required = ["customerName", "mobileNumber", "size", "houseBuilding", "roadArea", "pincode", "city", "state", "total", "items"];
    const missing = required.filter(k => !String(p[k] || "").trim());
    if (missing.length) return rejectOrder_(clientRequestId, "Missing fields: " + missing.join(", ") + ".");
    if (!/^\d{6}$/.test(String(p.pincode).trim())) return rejectOrder_(clientRequestId, "Invalid pincode. Please enter a 6-digit PIN code.");
    if (!/^[6-9]\d{9}$/.test(String(p.mobileNumber).trim())) return rejectOrder_(clientRequestId, "Invalid mobile number. Please enter a valid 10-digit Indian mobile number.");
    const total = Number(p.total);
    if (!Number.isFinite(total) || total < 0) return rejectOrder_(clientRequestId, "Invalid order total.");

    let items;
    try { items = JSON.parse(p.items); }
    catch (_) { return rejectOrder_(clientRequestId, "Order items could not be read. Please refresh and try again."); }
    if (!Array.isArray(items) || !items.length) return rejectOrder_(clientRequestId, "No order items were provided.");

    // A retry with the same clientRequestId returns the original confirmed order,
    // preventing duplicate rows when the browser loses a response after saving.
    if (cacheKey) {
      const priorResultText = cache.get(cacheKey);
      if (priorResultText) {
        let priorResult = null;
        try { priorResult = JSON.parse(priorResultText); } catch (_) { priorResult = { ok: true, orderId: priorResultText }; }
        if (priorResult && priorResult.ok === true && priorResult.orderId) {
          return output_({ ok: true, orderId: priorResult.orderId, duplicate: true });
        }
        // A cached failure is not a saved order; permit the customer to retry the same request ID.
        cache.remove(cacheKey);
      }
      const ledgerPrior = findRequestLedger_(clientRequestId);
      if (ledgerPrior && ledgerPrior.ok === true && ledgerPrior.orderId) {
        try { cache.put(cacheKey, JSON.stringify(ledgerPrior), 21600); } catch (_) {}
        return output_({ ok: true, orderId: ledgerPrior.orderId, duplicate: true });
      }
    }

    const now = new Date();
    const orderId = "KC-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
    const itemSummary = items.map(item => {
      const name = item.productName || item.name || "Product";
      const sku = getItemSku_(item) || "SKU not provided";
      const size = item.size || "-";
      const color = String(item.color || "").trim();
      const quantity = getItemQty_(item);
      const unitPrice = Number(item.unitPrice);
      const lineTotal = (item.lineTotal !== undefined && item.lineTotal !== null)
        ? Number(item.lineTotal)
        : (Number.isFinite(unitPrice) ? unitPrice * quantity : "-");
      return `${name} | SKU ${sku} | Color ${color || "-"} | Size ${size} | Qty ${quantity || "-"} | Unit ₹${Number.isFinite(unitPrice) ? unitPrice : "-"} | Line Total ₹${Number.isFinite(lineTotal) ? lineTotal : "-"}`;
    }).join("\n");

    // Keep one row per order in the required 18-column layout. Multi-product SKU,
    // item, size and quantity details are retained as joined summaries in their columns.
    const skuSummary = Array.from(new Set(items.map(getItemSku_).filter(Boolean))).join(", ");
    const itemQtyTotal = items.reduce((sum, item) => sum + getItemQty_(item), 0);
    const qtyValue = itemQtyTotal || Number(p.qty || p.quantity || 0) || "";
    const sizeSummary = String(p.size || Array.from(new Set(items.map(item => String(item.size || "").trim()).filter(Boolean))).join(", "));
    const paymentMethod = String(p.paymentMethod || p.payment_method || "Cash on Delivery (COD)").trim() || "Cash on Delivery (COD)";

    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
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
      safeCell_(String(p.email || p.customerEmail || p.emailAddress || "").trim()),
      String(p.mobileNumber).trim(),
      safeCell_(skuSummary),
      safeCell_(itemSummary),
      safeCell_(sizeSummary),
      qtyValue,
      safeCell_(p.houseBuilding),
      safeCell_(p.landmark || ""),
      safeCell_(p.roadArea),
      String(p.pincode).trim(),
      safeCell_(p.city),
      safeCell_(p.state),
      safeCell_(paymentMethod),
      total,
      "New"
    ];

    sheet.appendRow(row);
    const savedRow = sheet.getLastRow();
    // Formatting is helpful, but must not turn a successfully appended order into a false failure.
    try {
      sheet.getRange(savedRow, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
      sheet.getRange(savedRow, 5).setNumberFormat("@");
      sheet.getRange(savedRow, 13).setNumberFormat("@");
    } catch (formatError) {
      console.error("Order row saved, but number formatting failed:", formatError);
    }

    // Cache idempotency only after appendRow completed, so verification means the row was saved.
    if (cacheKey) {
      const confirmed = { ok: true, orderId: orderId };
      try { cache.put(cacheKey, JSON.stringify(confirmed), 21600); }
      catch (cacheWriteError) { console.error("Order row saved, but its verification cache could not be written:", cacheWriteError); }
      try { recordRequestLedger_(ss, clientRequestId, orderId, now); }
      catch (ledgerError) {
        // Cache confirmation is already written; report this degradation in logs.
        console.error("Order row saved, but the persistent request ledger could not be updated:", ledgerError);
      }
    }

    const body = [
      "New order received for KAILU CREATION", "",
      "Order ID: " + orderId,
      "Customer: " + p.customerName,
      "Email: " + (String(p.email || p.customerEmail || p.emailAddress || "").trim() || "Not provided"),
      "Mobile Number: " + p.mobileNumber,
      "SKU: " + (skuSummary || "Not provided by website"),
      "Items:", itemSummary, "",
      "Total Quantity: " + (qtyValue || "Not provided"),
      "Size: " + (sizeSummary || "Not provided"),
      "House No. / Building Name: " + p.houseBuilding,
      "Landmark: " + (String(p.landmark || "").trim() || "Not provided"),
      "Road Name / Area / Colony: " + p.roadArea,
      "Pincode: " + p.pincode,
      "City: " + p.city,
      "State: " + p.state,
      "Payment: " + paymentMethod,
      "Total: ₹" + total, "",
      "Please confirm stock, delivery and COD availability."
    ].join("\n");

    // Email is a notification only. A MailApp error must not make a saved order appear failed.
    if (STORE_EMAIL && STORE_EMAIL.indexOf("@") > 0 && STORE_EMAIL !== "YOUR_EMAIL@example.com") {
      try { MailApp.sendEmail(STORE_EMAIL, `New KAILU CREATION order ${orderId} — ₹${total}`, body); }
      catch (mailError) { console.error("Order row saved, but notification email failed:", mailError); }
    }
    return output_({ ok: true, orderId: orderId });
  } catch (err) {
    console.error(err);
    const errorMessage = String(err && err.message ? err.message : err);
    rememberRequestFailure_(requestIdForVerification, errorMessage);
    return output_({ ok: false, message: errorMessage });
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch (_) { /* lock is already released */ }
    }
  }
}

// Migrates rows by matching header names, so adding/reordering columns does not
// shift old values into the wrong fields. Existing order history is retained.
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
      "email": ["email", "email address", "customer email", "customer email address", "e mail"],
      "mobile number": ["mobile number", "customer mobile", "phone", "phone number"],
      "sku": ["sku", "product sku", "sku code", "item sku", "sku new column", "sku new colun"],
      "items": ["items", "item", "product", "products", "order items"],
      "size": ["size", "sizes", "product size"],
      "qty": ["qty", "quantity", "total quantity", "order quantity", "qty new column", "qty new colun"],
      "house no building": ["house no. / building", "house no. / building name", "house / building", "house building"],
      "road area colony": ["road / area / colony", "road name / area / colony", "road area", "address"],
      "pincode": ["pincode", "pin code", "postal code", "zip code"],
      "payment method": ["payment method", "payment", "mode of payment"],
      "total inr": ["total (inr)", "total", "total amount"],
      "order status": ["order status", "status"]
    };

    const migrated = oldData.map(oldRow => HEADERS.map(header => {
      const key = normalizeHeader_(header);
      let idx = indexes[key];
      if (idx === undefined && aliases[key]) {
        for (const alias of aliases[key]) {
          const aliasIdx = indexes[normalizeHeader_(alias)];
          if (aliasIdx !== undefined) {
            idx = aliasIdx;
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

// A separate hidden sheet stores idempotency keys without changing the public
// 18-column Orders layout. This survives CacheService eviction and lost responses.
function ensureRequestLedgerSheet_(ss) {
  let ledger = ss.getSheetByName(REQUEST_LEDGER_SHEET_NAME);
  if (!ledger) {
    ledger = ss.insertSheet(REQUEST_LEDGER_SHEET_NAME);
    ledger.getRange(1, 1, 1, 3).setValues([["Client Request ID", "Order ID", "Saved At"]]);
    ledger.setFrozenRows(1);
    ledger.hideSheet();
  } else if (ledger.getLastRow() === 0) {
    ledger.getRange(1, 1, 1, 3).setValues([["Client Request ID", "Order ID", "Saved At"]]);
    ledger.setFrozenRows(1);
    try { ledger.hideSheet(); } catch (_) {}
  }
  return ledger;
}

function findRequestLedger_(clientRequestId) {
  const id = String(clientRequestId || "").trim();
  if (!id) return null;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const ledger = ss.getSheetByName(REQUEST_LEDGER_SHEET_NAME);
  if (!ledger || ledger.getLastRow() < 2) return null;
  const match = ledger.getRange(2, 1, ledger.getLastRow() - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  if (!match) return null;
  const orderId = String(ledger.getRange(match.getRow(), 2).getDisplayValue() || "").trim();
  return orderId ? { ok: true, orderId: orderId, duplicate: true } : null;
}

function recordRequestLedger_(ss, clientRequestId, orderId, savedAt) {
  const id = String(clientRequestId || "").trim();
  if (!id || !orderId) return;
  const ledger = ensureRequestLedgerSheet_(ss);
  const match = ledger.getLastRow() > 1
    ? ledger.getRange(2, 1, ledger.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext()
    : null;
  if (match) return; // Idempotent ledger write.
  ledger.appendRow([id, orderId, savedAt || new Date()]);
}

function rejectOrder_(clientRequestId, message) {
  rememberRequestFailure_(clientRequestId, message);
  return output_({ ok: false, message: message });
}

function rememberRequestFailure_(clientRequestId, message) {
  const id = String(clientRequestId || "").trim();
  if (!id) return;
  try {
    CacheService.getScriptCache().put(requestCacheKey_(id), JSON.stringify({ ok: false, message: String(message || "Order could not be saved.") }), 600);
  } catch (cacheError) {
    console.error("Could not cache the order failure for verification:", cacheError);
  }
}

function requestCacheKey_(clientRequestId) {
  return "KC_REQ_" + Utilities.base64EncodeWebSafe(String(clientRequestId || "").trim()).replace(/=+$/g, "").slice(0, 180);
}

function getItemSku_(item) {
  const candidates = [item.sku, item.SKU, item.productSKU, item.productSku, item.skuCode, item.productCode, item.itemSKU];
  for (const candidate of candidates) {
    const value = String(candidate === undefined || candidate === null ? "" : candidate).trim();
    if (value) return value;
  }
  return "";
}

function getItemQty_(item) {
  const value = Number(item.quantity !== undefined ? item.quantity : (item.qty !== undefined ? item.qty : item.Qty));
  return Number.isFinite(value) && value > 0 ? value : 0;
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
