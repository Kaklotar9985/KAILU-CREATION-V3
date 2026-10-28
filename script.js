// KAILU CREATION — catalog products and WhatsApp order settings.
// IMPORTANT: Replace WHATSAPP_NUMBER with your number including country code,
// digits only. Example India: "919876543210" (no +, spaces, or hyphens).

const WHATSAPP_NUMBER = "918160621151"; // Optional WhatsApp fallback
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwD97xQD3dIEExZ02b3H6Nb5m1CIs6KyHI9EOL5jQTJgkK_RB17ym81WYpyeGWowrD9YQ/exec";
const CURRENCY = "INR";

const PINCODE_DATA = window.KAILU_PINCODE_DATA || Object.create(null);

function setPincodeFeedback(message, status = "info") {
  const feedback = $("#pincodeFeedback");
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.status = status;
}

function clearAutoLocationFields() {
  const city = $("#city");
  const state = $("#state");
  if (city) city.value = "";
  if (state) state.value = "";
  if (city) city.classList.remove("field-invalid");
  if (state) state.classList.remove("field-invalid");
}

// Uses the supplied courier serviceability list. District is shown in the City field.
function validatePincode(options = {}) {
  const pincodeField = $("#pincode");
  const cityField = $("#city");
  const stateField = $("#state");
  if (!pincodeField || !cityField || !stateField) {
    return { valid: false, message: "Pincode validation is unavailable." };
  }

  const pin = pincodeField.value.trim();
  const showIncomplete = options.showIncomplete === true;
  pincodeField.setAttribute("aria-invalid", "false");

  if (!/^[0-9]{6}$/.test(pin)) {
    clearAutoLocationFields();
    if (showIncomplete) {
      const message = pin ? "Please enter a valid 6-digit PIN code." : "Please enter your 6-digit PIN code.";
      pincodeField.classList.add("field-invalid");
      pincodeField.setAttribute("aria-invalid", "true");
      setPincodeFeedback(message, "error");
      return { valid: false, message };
    }
    pincodeField.classList.remove("field-invalid");
    if (pin.length > 0) {
      setPincodeFeedback(`Enter ${Math.max(0, 6 - pin.length)} more digit${6 - pin.length === 1 ? "" : "s"} to look up City and State.`, "info");
    } else {
      setPincodeFeedback("Enter a 6-digit PIN code to fill City and State automatically.", "info");
    }
    return { valid: false, message: "Enter a valid 6-digit PIN code." };
  }

  const match = PINCODE_DATA[pin];
  if (!match) {
    clearAutoLocationFields();
    const message = `PIN code ${pin} was not found in the courier serviceability list. Please check the PIN code.`;
    pincodeField.classList.add("field-invalid");
    pincodeField.setAttribute("aria-invalid", "true");
    setPincodeFeedback(`✕ ${message}`, "error");
    return { valid: false, message };
  }

  cityField.value = match.district || "";
  stateField.value = match.state || "";
  cityField.classList.remove("field-invalid");
  stateField.classList.remove("field-invalid");

  if (!match.cod) {
    const message = `PIN code found (${match.district}, ${match.state}), but Cash on Delivery is not available for this PIN. Please use another PIN code.`;
    pincodeField.classList.add("field-invalid");
    pincodeField.setAttribute("aria-invalid", "true");
    setPincodeFeedback(`✕ ${message}`, "error");
    return { valid: false, message, record: match };
  }

  pincodeField.classList.remove("field-invalid");
  pincodeField.setAttribute("aria-invalid", "false");
  setPincodeFeedback(`✓ Delivery available for ${match.district}, ${match.state} (Cash on Delivery).`, "success");
  return { valid: true, message: "Pincode verified.", record: match };
}

const products = [
  {id:1, name:"Navy Blue Floral Printed Anarkali Kurta Pant Dupatta Set", category:"3-Piece Kurti Set", price:349, mrp:1499, rating:4.2, reviews:5030, image:"images/Product_Photos/NavyBlue_Gown-1.webp", gallery:["images/Product_Photos/NavyBlue_Gown-2.webp", "images/Product_Photos/NavyBlue_Gown-3.webp", "images/Product_Photos/NavyBlue_Gown-4.webp"], video:"videos/Product_Videos/NavyBlue_Gown.mp4", tag:"SALE", description:"Fabric:- Rayon", color:"#e9dfd0"},
  {id:2, name:"Mustard Yellow Floral Printed Kurta Pant Dupatta Set", category:"3-Piece Kurti Set", price:349, mrp:1499, rating:4.4, reviews:6531, image:"images/Product_Photos/Mustard_Yellow-1.webp", gallery:["images/Product_Photos/Mustard_Yellow-2.webp", "images/Product_Photos/Mustard_Yellow-3.webp", "images/Product_Photos/Mustard_Yellow-4.webp"], video:"videos/Product_Videos/Mustard_Yellow.mp4", tag:"SALE", description:"Fabric:- Cotton Blend", color:"#f0e4c9"},
  {id:4, name:"Black Kurti With Bottomwear", category:"Corset", price:349, mrp:1499, rating:48, reviews:5574, image:"images/Product_Photos/Black_Kurti_Paint-1.webp", gallery:["images/Product_Photos/Black_Kurti_Paint-2.webp", "images/Product_Photos/Black_Kurti_Paint-3.webp", "images/Product_Photos/Black_Kurti_Paint-4.webp"], video:"videos/Product_Videos/Black_Kurti_Paint.mp4", tag:"SALE", description:"Fabric:- Rayon", color:"#e4e5d8"},
  {id:5, name:"Women Maroon Kurti Sharara Ethnic Wear Set", category:"Corset", price:349, mrp:1999, rating:48, reviews:5574, image:"images/Product_Photos/Maroon_Kurti_With_Sharara-1.webp", gallery:["images/Product_Photos/Maroon_Kurti_With_Sharara-2.webp", "images/Product_Photos/Maroon_Kurti_With_Sharara-3.webp", "images/Product_Photos/Maroon_Kurti_With_Sharara-4.webp"], video:"videos/Product_Videos/Maroon_Kurti_With_Sharara.mp4", tag:"SALE", description:"Fabric:- Rayon", color:"#e4e5d8"},
  {id:6, name:"Women Maroon Kurti Sharara Ethnic Wear Set", category:"Corset", price:349, mrp:1999, rating:48, reviews:5574, image:"images/Product_Photos/Black_Kurti_With_Sharara-1.webp", gallery:["images/Product_Photos/Black_Kurti_With_Sharara-2.webp", "images/Product_Photos/Black_Kurti_With_Sharara-3.webp", "images/Product_Photos/Black_Kurti_With_Sharara-4.webp"], video:"videos/Product_Videos/Black_Kurti_With_Sharara.mp4", tag:"SALE", description:"Fabric:- Rayon", color:"#e4e5d8"}
];

const $ = (selector) => document.querySelector(selector);
const productGrid = $("#productGrid");
const searchInput = $("#searchInput");
const categoryFilter = $("#categoryFilter");
const sortSelect = $("#sortSelect");
const cartDrawer = $("#cartDrawer");
const overlay = $("#overlay");
const cartItems = $("#cartItems");
const cartEmpty = $("#cartEmpty");
const cartBottom = $("#cartBottom");
const toast = $("#toast");
let cart = {};
const cartUnitSizes = {};
let toastTimer;

const money = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: CURRENCY, maximumFractionDigits: 2
}).format(amount);
const catalogMoney = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: CURRENCY, maximumFractionDigits: 0
}).format(amount);

function renderCategories() {
  [...new Set(products.map(p => p.category))].sort().forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });
}

function getVisibleProducts() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = products.filter(p => {
    const matchesQuery = `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(query);
    const matchesCategory = categoryFilter.value === "all" || p.category === categoryFilter.value;
    return matchesQuery && matchesCategory;
  });
  if (sortSelect.value === "low") visible.sort((a,b) => a.price - b.price);
  if (sortSelect.value === "high") visible.sort((a,b) => b.price - a.price);
  if (sortSelect.value === "name") visible.sort((a,b) => a.name.localeCompare(b.name));
  return visible;
}

function renderProducts() {
  const visible = getVisibleProducts();
  productGrid.replaceChildren();
  $("#emptyProducts").hidden = visible.length !== 0;
  $("#productSummary").textContent = `${visible.length} product${visible.length === 1 ? "" : "s"} to explore`;
  visible.forEach(product => {
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-image" style="background:${product.color}">
        ${product.tag ? `<span class="product-tag">${escapeHtml(product.tag)}</span>` : ""}
        <img class="catalog-photo" src="${product.image}" alt="${escapeHtml(product.name)}" role="button" tabindex="0" aria-label="Open full-size photo: ${escapeHtml(product.name)}" draggable="false">
        <video class="catalog-video" data-main-video="${product.id}" controls muted preload="metadata" playsinline aria-label="${escapeHtml(product.name)} product video" hidden></video>
        <button class="gallery-next" type="button" aria-label="Next photo or video" data-gallery-next="${product.id}" hidden>›</button>
      </div>
      <div class="product-gallery" data-gallery="${product.id}">
        <div class="gallery-controls-row">
          <div class="gallery-thumbnails" aria-label="Product photos">
            <button type="button" class="gallery-thumb active" data-gallery-photo="${product.id}" data-src="${product.image}" aria-label="Main photo">
              <img src="${product.image}" alt="">
            </button>
            ${(product.gallery || []).map((src, index) => `
              <button type="button" class="gallery-thumb" data-gallery-photo="${product.id}" data-src="${src}" aria-label="Product photo ${index + 2}">
                <img src="${src}" alt="">
              </button>`).join("")}
            <button type="button" class="gallery-thumb gallery-video-thumb" data-gallery-video="${product.id}" aria-label="Play ${escapeHtml(product.name)} video" hidden>
              <span class="video-thumb-poster"><img src="${product.image}" alt=""><span class="video-play-icon" aria-hidden="true">▶</span><small>VIDEO</small></span>
            </button>
          </div>
        </div>
      </div>
      <div class="product-info">
        <span class="product-category">${escapeHtml(product.category)}</span>
        <h3>${escapeHtml(product.name)}</h3>
        <p class="product-description">${escapeHtml(product.description)}</p>
        <div class="product-rating" aria-label="Rated ${Number(product.rating).toFixed(1)} out of 5 based on ${Number(product.reviews).toLocaleString("en-IN")} ratings">
          <span class="rating-star" aria-hidden="true">★</span>
          <strong>${Number(product.rating).toFixed(1)}</strong>
          <span class="rating-count">(${Number(product.reviews).toLocaleString("en-IN")})</span>
        </div>
        <div class="product-pricing" aria-label="Discounted price">
          <span class="price">${catalogMoney(product.price)}</span>
          <span class="mrp-label">MRP <del>${catalogMoney(product.mrp || 1499)}</del></span>
          <span class="discount-badge">${Math.round((1 - product.price / (product.mrp || 1499)) * 100)}% OFF</span>
        </div>
        <div class="product-buy">
          <div class="product-actions">
            <button class="add-button" type="button" data-add="${product.id}">＋ Add to cart</button>
            <button class="buy-now-button" type="button" data-buy="${product.id}">Buy Now</button>
          </div>
        </div>
      </div>`;
    productGrid.appendChild(card);

    // Optional local media: missing photos or videos are hidden gracefully.
    card.querySelectorAll("[data-gallery-photo]").forEach(thumb => {
      const image = thumb.querySelector("img");
      image.addEventListener("error", () => {
        if (thumb.dataset.src !== product.image) thumb.remove();
        updateGalleryControls(card, product);
      });
      image.addEventListener("load", () => updateGalleryControls(card, product));
    });
    const mainPhoto = card.querySelector(".catalog-photo");
    const video = card.querySelector("[data-main-video]");
    const videoThumb = card.querySelector("[data-gallery-video]");
    // Mobile performance: do not download product videos while the catalog is only being viewed.
    // Load an available video only after the customer opens its VIDEO thumbnail.
    video.muted = true;
    video.defaultMuted = true;
    video.preload = "none";
    video.playsInline = true;
    if (product.video) {
      video.dataset.videoSrc = product.video;
      videoThumb.hidden = false;
    } else {
      videoThumb.hidden = true;
    }
    video.addEventListener("error", () => {
      video.pause();
      video.hidden = true;
      mainPhoto.hidden = false;
      videoThumb.hidden = true;
      updateGalleryControls(card, product);
    });
    updateGalleryControls(card, product);
  });
}

function updateGalleryControls(card, product) {
  const photoThumbs = [...card.querySelectorAll("[data-gallery-photo]")];
  const extraPhotos = photoThumbs.filter(thumb => thumb.dataset.src !== product.image);
  const videoThumb = card.querySelector("[data-gallery-video]");
  const next = card.querySelector("[data-gallery-next]");
  const hasVideo = videoThumb && !videoThumb.hidden;
  next.hidden = extraPhotos.length === 0 && !hasVideo;
  const gallery = card.querySelector(".product-gallery");
  gallery.hidden = extraPhotos.length === 0 && !hasVideo;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}

function addToCart(id) {
  const product = products.find(item => item.id === Number(id));
  if (!product) {
    showToast("This catalog could not be added. Please refresh the page.");
    return;
  }
  if (!Array.isArray(cartUnitSizes[id])) cartUnitSizes[id] = [];
  cart[id] = (cart[id] || 0) + 1;
  cartUnitSizes[id].push("");
  renderCart();
  // Add to Cart should only show a brief confirmation; keep the catalog visible.
  showToast(`${product.name} added to your cart.`);

}

function buyNow(id) {
  // Buy Now starts checkout with the selected catalog only.
  cart = { [id]: 1 };
  Object.keys(cartUnitSizes).forEach(key => delete cartUnitSizes[key]);
  cartUnitSizes[id] = [""];
  renderCart();
  openCart();
  startSizeStep();
  showToast("Select a clothing size first.");
}

function startSizeStep() {
  const checkoutFields = $("#checkoutFields");
  const deliveryFields = $("#deliveryFields");
  const proceedButton = $("#proceedCheckout");
  if (checkoutFields) {
    checkoutFields.hidden = false;
    checkoutFields.dataset.opened = "true";
  }
  if (deliveryFields) deliveryFields.hidden = true;
  if (proceedButton) proceedButton.hidden = true;
  clearValidationHighlights();
  const firstProductSize = cartItems.querySelector(".cart-size-picker");
  if (firstProductSize) firstProductSize.scrollIntoView({behavior:"smooth", block:"center"});
}

function clearValidationHighlights() {
  document.querySelectorAll(".field-invalid, .size-invalid").forEach(el => el.classList.remove("field-invalid", "size-invalid"));
}

function highlightMissingFields() {
  clearValidationHighlights();
  const missing = [];
  ["customerName", "mobileNumber", "houseBuilding", "roadArea", "pincode", "city", "state"].forEach(id => {
    const field = $("#" + id);
    if (field && !field.value.trim()) {
      field.classList.add("field-invalid");
      missing.push(field);
    }
  });
  if ($("#pincode").value.trim() && !/^[0-9]{6}$/.test($("#pincode").value.trim())) {
    $("#pincode").classList.add("field-invalid");
    missing.push($("#pincode"));
  }
  const mobileField = $("#mobileNumber");
  if (mobileField && mobileField.value.trim() && !/^[6-9][0-9]{9}$/.test(mobileField.value.trim())) {
    mobileField.classList.add("field-invalid");
    missing.push(mobileField);
  }
  const first = missing.find(Boolean);
  if (first) first.scrollIntoView({behavior:"smooth", block:"center"});
  return missing;
}

function addCartUnit(id) {
  const product = products.find(item => item.id === Number(id));
  if (!product) return;
  if (!Array.isArray(cartUnitSizes[id])) cartUnitSizes[id] = [];
  cart[id] = (cart[id] || 0) + 1;
  cartUnitSizes[id].push("");
  renderCart();
}

function removeCartUnit(id, unitIndex) {
  const key = String(id);
  if (!cart[key]) return;
  const sizes = Array.isArray(cartUnitSizes[key]) ? cartUnitSizes[key] : [];
  const index = Number(unitIndex);
  if (Number.isInteger(index) && index >= 0 && index < sizes.length) sizes.splice(index, 1);
  cart[key] -= 1;
  if (cart[key] <= 0) {
    delete cart[key];
    delete cartUnitSizes[key];
  } else {
    cartUnitSizes[key] = sizes.slice(0, cart[key]);
  }
  renderCart();
}

function getCartUnits() {
  const units = [];
  Object.entries(cart).forEach(([id, quantity]) => {
    const product = products.find(item => item.id === Number(id));
    if (!product || quantity <= 0) return;
    if (!Array.isArray(cartUnitSizes[id])) cartUnitSizes[id] = [];
    while (cartUnitSizes[id].length < quantity) cartUnitSizes[id].push("");
    if (cartUnitSizes[id].length > quantity) cartUnitSizes[id].length = quantity;
    for (let unitIndex = 0; unitIndex < quantity; unitIndex += 1) {
      units.push({ product, unitIndex, size: cartUnitSizes[id][unitIndex] || "" });
    }
  });
  return units;
}

// Aggregate individual pieces by product + size for the order backend.
function getCartEntries() {
  const grouped = new Map();
  getCartUnits().forEach(unit => {
    const key = `${unit.product.id}::${unit.size}`;
    if (!grouped.has(key)) grouped.set(key, { product: unit.product, quantity: 0, size: unit.size });
    grouped.get(key).quantity += 1;
  });
  return [...grouped.values()];
}

function renderCart() {
  const previousScrollTop = cartItems.scrollTop;
  const units = getCartUnits();
  const count = units.length;
  const total = units.reduce((sum, unit) => sum + unit.product.price, 0);

  $("#cartCount").textContent = count;
  $("#drawerCount").textContent = `(${count})`;
  $("#cartTotal").textContent = money(total);

  // Render one visible row for every physical piece, so Cart (8) shows 8 rows,
  // with a separate size selection and remove action for each piece.
  cartItems.replaceChildren();
  cartItems.hidden = count === 0;
  cartEmpty.hidden = count > 0;
  cartBottom.hidden = count === 0;
  cartItems.style.display = count > 0 ? "block" : "";
  const checkoutFields = $("#checkoutFields");
  const proceedButton = $("#proceedCheckout");
  if (count === 0) {
    if (checkoutFields) {
      checkoutFields.hidden = true;
      checkoutFields.dataset.opened = "false";
    }
    if (proceedButton) proceedButton.hidden = true;
  } else if (checkoutFields && checkoutFields.dataset.opened !== "true") {
    checkoutFields.hidden = true;
    if (proceedButton) proceedButton.hidden = false;
  }

  units.forEach(({product, unitIndex, size}) => {
    const row = document.createElement("div");
    row.className = "cart-line cart-unit-line";
    row.dataset.cartProductId = String(product.id);
    row.dataset.cartUnitIndex = String(unitIndex);
    row.innerHTML = `
      <div class="cart-thumb"><img src="${product.image}" alt="${escapeHtml(product.name)}"></div>
      <div class="cart-product-details">
        <h4>${escapeHtml(product.name)}</h4>
        <div class="unit-price">${money(product.price)} / item</div>
        <div class="cart-size-picker" role="group" aria-label="Choose size for item ${unitIndex + 1}: ${escapeHtml(product.name)}">
          <span class="cart-size-label">Size:</span>
          ${["S","M","L","XL","XXL","3XL"].map(itemSize => `<button type="button" class="size-button cart-size-button ${size === itemSize ? "selected" : ""}" data-unit-size="${itemSize}" data-product-id="${product.id}" data-unit-index="${unitIndex}" aria-pressed="${size === itemSize ? "true" : "false"}">${itemSize}</button>`).join("")}
        </div>
        <div class="quantity-controls cart-unit-controls">
          <button type="button" class="cart-add-one" data-add-unit="${product.id}" aria-label="Add one more ${escapeHtml(product.name)}">＋ Add one</button>
          <button type="button" class="remove-button" data-remove-unit="${product.id}" data-unit-index="${unitIndex}">Remove item</button>
        </div>
      </div>
      <div class="line-price">${money(product.price)}</div>`;
    cartItems.appendChild(row);
  });
  cartItems.scrollTop = previousScrollTop;
}

// In-app browser Back behavior: keep Back inside the storefront when a UI panel is open.
function pushKailuUiHistory(uiName) {
  const currentState = history.state && typeof history.state === "object" ? history.state : {};
  history.pushState(
    { ...currentState, kailuUI: uiName, kailuUiToken: Date.now() + Math.random() },
    "",
    window.location.href
  );
}

function replaceKailuUiHistory(uiName) {
  const currentState = history.state && typeof history.state === "object" ? { ...history.state } : {};
  if (uiName) {
    currentState.kailuUI = uiName;
    currentState.kailuUiToken = Date.now();
  } else {
    delete currentState.kailuUI;
    delete currentState.kailuUiToken;
  }
  const nextUrl = `${window.location.pathname}${window.location.search}#products`;
  history.replaceState(currentState, "", nextUrl);
}

function scrollToCatalogList() {
  const catalogSection = $("#products");
  replaceKailuUiHistory(null);
  if (catalogSection) {
    catalogSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function openCart() {
  const wasHidden = cartDrawer.hidden;
  cartDrawer.hidden = false;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  if (wasHidden) pushKailuUiHistory("cart");
  $("#closeCart").focus();
}
function closeCart(options = {}) {
  const wasOpen = !cartDrawer.hidden;
  cartDrawer.hidden = true;
  overlay.hidden = true;
  document.body.style.overflow = "";
  if (!options.skipHistory && !options.fromPopstate && wasOpen &&
      history.state && history.state.kailuUI === "cart") {
    history.back();
  }
  if (!options.fromPopstate) $("#cartShortcut").focus();
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2100);
}

async function sendWhatsAppOrder() {
  const deliveryFields = $("#deliveryFields");
  if (deliveryFields) deliveryFields.hidden = false;
  const missingUnitSize = getCartUnits().find(unit => !unit.size);
  if (missingUnitSize) {
    const row = cartItems.querySelector(`[data-cart-product-id="${missingUnitSize.product.id}"][data-cart-unit-index="${missingUnitSize.unitIndex}"]`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast(`Please select a size for every item. Missing size: ${missingUnitSize.product.name}.`);
    return;
  }
  const pincodeValidation = validatePincode({ showIncomplete: true });
  if (!pincodeValidation.valid) {
    const pincodeField = $("#pincode");
    if (pincodeField) {
      pincodeField.scrollIntoView({ behavior: "smooth", block: "center" });
      pincodeField.focus({ preventScroll: true });
    }
    showToast(pincodeValidation.message);
    return;
  }
  const missingFields = highlightMissingFields();
  if (missingFields.length) {
    showToast("Please complete the highlighted fields.");
    return;
  }
  const entries = getCartEntries();
  if (!entries.length) {
    showToast("Please add a product first");
    return;
  }
  const name = $("#customerName").value.trim();
  const mobileNumber = $("#mobileNumber").value.trim();
  const houseBuilding = $("#houseBuilding").value.trim();
  const landmark = $("#landmark").value.trim();
  const roadArea = $("#roadArea").value.trim();
  const pincode = $("#pincode").value.trim();
  const city = $("#city").value.trim();
  const state = $("#state").value.trim();
  const fields = [
    ["customerName", name], ["mobileNumber", mobileNumber], ["houseBuilding", houseBuilding],
    ["roadArea", roadArea], ["pincode", pincode], ["city", city], ["state", state]
  ];
  const missing = fields.find(([, value]) => !value);
  if (missing) {
    $("#" + missing[0]).focus();
    showToast("Please complete all required fields");
    return;
  }
  if (!/^[0-9]{6}$/.test(pincode)) {
    $("#pincode").focus();
    showToast("Please enter a valid 6-digit PIN code");
    return;
  }
  if (!/^[6-9][0-9]{9}$/.test(mobileNumber)) {
    $("#mobileNumber").focus();
    showToast("Please enter a valid 10-digit mobile number");
    return;
  }
  if (!GOOGLE_SCRIPT_URL.startsWith("https://script.google.com/macros/s/") ||
      GOOGLE_SCRIPT_URL.includes("PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE")) {
    showToast("Order system not connected. Add your Apps Script Web App URL in script.js.");
    return;
  }

  const total = entries.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const orderItems = entries.map(({product, quantity, size}) => ({
    productName: product.name,
    productId: product.id,
    size: size || "",
    quantity,
    unitPrice: product.price,
    lineTotal: product.price * quantity
  }));
  const payload = new URLSearchParams({
    store: "KAILU CREATION™",
    customerName: name,
    mobileNumber,
    size: orderItems.map(item => `${item.size}`).join(";"),
    // size: orderItems.map(item => `${item.productName}: ${item.size}`).join("; "),
    houseBuilding,
    landmark,
    roadArea,
    pincode,
    city,
    state,
    paymentMethod: "Cash on Delivery (COD)",
    currency: "INR",
    total: String(total),
    items: JSON.stringify(orderItems)
  });

  const submitButton = $("#whatsappOrder");
  const originalText = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.textContent = "Submitting order…";
  try {
    // Apps Script is cross-origin; no-cors allows a simple form POST.
    // The browser cannot read the response, so verify a test order in Sheets/email.
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      body: payload
    });
    submitButton.textContent = "Order Request Sent";

    // Return the customer to the catalog and close the cart after submission.
    cart = {};
    Object.keys(cartUnitSizes).forEach(id => delete cartUnitSizes[id]);
    renderCart();
    closeCart({ skipHistory: true });
    ["customerName", "mobileNumber", "houseBuilding", "landmark", "roadArea", "pincode", "city", "state"].forEach(id => {
      const field = $("#" + id);
      if (field) field.value = "";
    });
    $("#products").scrollIntoView({ behavior: "smooth", block: "start" });
    const successModal = $("#orderSuccessModal");
    if (successModal) {
      replaceKailuUiHistory("success");
      successModal.hidden = false;
      document.body.classList.add("success-modal-open");
      const continueButton = $("#continueShoppingSuccess");
      if (continueButton) continueButton.focus({preventScroll:true});
    } else {
      showToast("Order request sent. Check your Google Sheet and email.");
    }
  } catch (error) {
    showToast("Could not send order. Check internet and try again.");
    submitButton.innerHTML = originalText;
    submitButton.disabled = false;
    return;
  }
  setTimeout(() => {
    submitButton.innerHTML = originalText;
    submitButton.disabled = false;
  }, 3500);
}

const continueShoppingSuccess = $("#continueShoppingSuccess");
function returnToCatalogList() {
  const successModal = $("#orderSuccessModal");
  if (successModal) successModal.hidden = true;
  document.body.classList.remove("success-modal-open");
  closeCart({ skipHistory: true });

  // Clear the in-app UI history marker and move the actual page to Shop Catalogs.
  const catalogSection = $("#products");
  replaceKailuUiHistory(null);
  if (catalogSection) {
    window.scrollTo({ top: Math.max(0, catalogSection.getBoundingClientRect().top + window.scrollY - 12), behavior: "smooth" });
  }
}
if (continueShoppingSuccess) {
  continueShoppingSuccess.addEventListener("click", returnToCatalogList);
}
document.addEventListener("keydown", event => {
  const successModal = $("#orderSuccessModal");
  if (event.key === "Escape" && successModal && !successModal.hidden) {
    returnToCatalogList();
  }
});

// Full-screen viewer sequence contains all valid product photos and, when
// available, the product video as the final gallery item.
let lightboxItems = [];
let lightboxIndex = 0;
let lightboxCard = null;

function stopLightboxVideo() {
  const video = $("#photoLightboxVideo");
  if (!video) return;
  video.pause();
  video.hidden = true;
  video.removeAttribute("src");
  video.load();
}

function showLightboxItem(index) {
  if (!lightboxItems.length) return;
  lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex];
  const img = $("#photoLightboxImage");
  const video = $("#photoLightboxVideo");

  if (item.type === "video") {
    img.hidden = true;
    video.hidden = false;
    video.pause();
    video.src = item.src;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    // load() resets playback to the beginning when switching between gallery items.
    video.load();
    // Video automatically starts silently when reached with Next/Previous.
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {
        // Native controls remain available if autoplay is blocked by the browser.
      });
    }
  } else {
    stopLightboxVideo();
    video.muted = true;
    video.defaultMuted = true;
    img.hidden = false;
    img.src = item.src;
    img.alt = item.alt || "Catalog full screen photo";
  }
}

function openPhotoLightbox(card, clickedSrc) {
  lightboxCard = card;
  lightboxItems = [...card.querySelectorAll("[data-gallery-photo][data-src]")]
    .map(button => ({ type: "photo", src: button.dataset.src, alt: button.getAttribute("aria-label") || "Catalog photo" }))
    .filter(item => Boolean(item.src));

  const videoThumb = card.querySelector("[data-gallery-video]");
  const cardVideo = card.querySelector("[data-main-video]");
  // A video is added to the full-screen sequence only after it is confirmed available.
  if (videoThumb && !videoThumb.hidden && cardVideo && cardVideo.dataset.videoSrc) {
    // Include the known local video even when it has not yet been fetched; load it only if reached.
    lightboxItems.push({ type: "video", src: cardVideo.dataset.videoSrc, alt: "Product video" });
  }
  if (!lightboxItems.length) lightboxItems = [{ type: "photo", src: clickedSrc, alt: "Catalog photo" }];

  const clickedUrl = new URL(clickedSrc, document.baseURI).href;
  const matchedIndex = lightboxItems.findIndex(item => item.type === "photo" && new URL(item.src, document.baseURI).href === clickedUrl);
  showLightboxItem(matchedIndex >= 0 ? matchedIndex : 0);
  $("#photoLightbox").hidden = false;
  document.body.classList.add("photo-viewer-open");
  pushKailuUiHistory("photo");
}

function moveLightboxPhoto(delta) {
  if (!lightboxItems.length) return;
  showLightboxItem(lightboxIndex + delta);
}

// Mobile tap fallback: open the full-screen viewer from a deliberate touch
// without mistaking a swipe/scroll gesture for a photo tap. The following
// synthetic click is ignored so one tap cannot open the viewer twice.
let photoTouchStart = null;
let lastTouchPhotoOpenedAt = 0;
productGrid.addEventListener("pointerdown", event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const photo = target && target.closest(".catalog-photo");
  if (event.pointerType === "touch" && photo && !photo.hidden) {
    photoTouchStart = { photo, x: event.clientX, y: event.clientY };
  } else if (event.pointerType === "touch") {
    photoTouchStart = null;
  }
}, { passive: true });

productGrid.addEventListener("pointerup", event => {
  if (event.pointerType !== "touch" || !photoTouchStart) return;
  const start = photoTouchStart;
  photoTouchStart = null;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const photo = target && target.closest(".catalog-photo");
  const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
  if (!photo || photo !== start.photo || photo.hidden || moved > 12) return;
  lastTouchPhotoOpenedAt = Date.now();
  openPhotoLightbox(photo.closest(".product-card"), photo.currentSrc || photo.src);
}, { passive: true });

productGrid.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const clickedPhoto = target && target.closest(".catalog-photo");
  if (clickedPhoto && !clickedPhoto.hidden) {
    // Touch browsers often dispatch click just after pointerup; avoid duplicate
    // history entries/reopening after the pointer handler already opened it.
    if (Date.now() - lastTouchPhotoOpenedAt < 900) return;
    openPhotoLightbox(clickedPhoto.closest(".product-card"), clickedPhoto.currentSrc || clickedPhoto.src);
    return;
  }
  const photoButton = event.target.closest("[data-gallery-photo]");
  const videoButton = event.target.closest("[data-gallery-video]");
  const nextButton = event.target.closest("[data-gallery-next]");

  if (photoButton) {
    const card = photoButton.closest(".product-card");
    const main = card.querySelector(".catalog-photo");
    const video = card.querySelector("[data-main-video]");
    video.pause();
    video.currentTime = 0;
    video.muted = true;
    video.defaultMuted = true;
    video.hidden = true;
    main.hidden = false;
    main.src = photoButton.dataset.src;
    card.querySelectorAll(".gallery-thumb").forEach(thumb => thumb.classList.toggle("active", thumb === photoButton));
    return;
  }
  if (videoButton && !videoButton.hidden) {
    const card = videoButton.closest(".product-card");
    const main = card.querySelector(".catalog-photo");
    const video = card.querySelector("[data-main-video]");
    const videoSrc = video.dataset.videoSrc;
    if (!videoSrc) return;
    main.hidden = true;
    video.hidden = false;
    // Load only on an intentional tap, to avoid downloading several large videos on mobile.
    if (!video.getAttribute("src")) {
      video.setAttribute("src", videoSrc);
      video.preload = "auto";
      video.load();
    }
    // Always start the product video muted; the visible speaker control can enable sound.
    video.muted = true;
    video.defaultMuted = true;
    card.querySelectorAll(".gallery-thumb").forEach(thumb => thumb.classList.toggle("active", thumb === videoButton));
    video.play().catch(() => {
      showToast("Video is loading. Tap Play when it appears.");
    });
    return;
  }
  if (nextButton) {
    const card = nextButton.closest(".product-card");
    const thumbs = [...card.querySelectorAll('[data-gallery-photo], [data-gallery-video]:not([hidden])')];
    const current = Math.max(0, thumbs.findIndex(thumb => thumb.classList.contains("active")));
    const next = thumbs[(current + 1) % thumbs.length];
    if (next) next.click();
  }
});

productGrid.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const photo = target && target.closest(".catalog-photo");
  if (!photo || photo.hidden) return;
  event.preventDefault();
  openPhotoLightbox(photo.closest(".product-card"), photo.currentSrc || photo.src);
});

productGrid.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : event.target.parentElement;
  const addButton = target && target.closest("[data-add]");
  const buyButton = target && target.closest("[data-buy]");
  if (addButton) {
    event.preventDefault();
    addToCart(Number(addButton.dataset.add));
    return;
  }
  if (buyButton) {
    event.preventDefault();
    buyNow(Number(buyButton.dataset.buy));
  }
});
function closePhotoLightbox(options = {}) {
  const photoLightbox = $("#photoLightbox");
  const wasOpen = photoLightbox && !photoLightbox.hidden;
  if (photoLightbox) photoLightbox.hidden = true;
  stopLightboxVideo();
  const lightboxImage = $("#photoLightboxImage");
  if (lightboxImage) lightboxImage.hidden = false;
  lightboxItems = [];
  lightboxIndex = 0;
  lightboxCard = null;
  document.body.classList.remove("photo-viewer-open");
  if (wasOpen && !options.fromPopstate && history.state && history.state.kailuUI === "photo") {
    history.back();
  }
}
$("#closePhotoLightbox").addEventListener("click", () => closePhotoLightbox());
$("#photoLightbox").addEventListener("click", event => {
  if (event.target.id === "photoLightbox") closePhotoLightbox();
});
$("#photoLightboxPrev").addEventListener("click", () => moveLightboxPhoto(-1));
$("#photoLightboxNext").addEventListener("click", () => moveLightboxPhoto(1));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("#photoLightbox").hidden) closePhotoLightbox();
  if (!$("#photoLightbox").hidden && event.key === "ArrowRight") moveLightboxPhoto(1);
  if (!$("#photoLightbox").hidden && event.key === "ArrowLeft") moveLightboxPhoto(-1);
});

document.querySelectorAll(".customer-input").forEach(field => {
  field.addEventListener("input", () => field.classList.remove("field-invalid"));
});

const pincodeInput = $("#pincode");
if (pincodeInput) {
  pincodeInput.addEventListener("input", () => {
    // Accept digits only and stop at six characters, including paste/autofill.
    pincodeInput.value = pincodeInput.value.replace(/\D/g, "").slice(0, 6);
    if (pincodeInput.value.length === 6) {
      validatePincode();
      return;
    }
    pincodeInput.classList.remove("field-invalid");
    pincodeInput.setAttribute("aria-invalid", "false");
    clearAutoLocationFields();
    if (pincodeInput.value.length > 0) {
      const remaining = 6 - pincodeInput.value.length;
      setPincodeFeedback(`Enter ${remaining} more digit${remaining === 1 ? "" : "s"} to look up City and State.`, "info");
    } else {
      setPincodeFeedback("Enter a 6-digit PIN code to fill City and State automatically.", "info");
    }
  });
  pincodeInput.addEventListener("blur", () => {
    if (pincodeInput.value.trim() && pincodeInput.value.length !== 6) {
      validatePincode({ showIncomplete: true });
    } else if (pincodeInput.value.length === 6) {
      validatePincode();
    }
  });
}

const continueToDetails = $("#continueToDetails");
if (continueToDetails) {
  continueToDetails.addEventListener("click", () => {
    clearValidationHighlights();
    const missingSize = getCartUnits().find(unit => !unit.size);
    if (missingSize) {
      showToast(`Please select a size for every item. Missing size: ${missingSize.product.name}.`);
      const row = cartItems.querySelector(`[data-cart-product-id="${missingSize.product.id}"][data-cart-unit-index="${missingSize.unitIndex}"]`);
      const sizePicker = row && row.querySelector(".cart-size-picker");
      if (sizePicker) {
        sizePicker.classList.add("size-invalid");
        sizePicker.scrollIntoView({behavior:"smooth", block:"center"});
      } else if (row) {
        row.scrollIntoView({behavior:"smooth", block:"center"});
      }
      return;
    }
    $("#deliveryFields").hidden = false;
    $("#deliveryFields").scrollIntoView({behavior:"smooth", block:"start"});
    const firstField = $("#customerName");
    if (firstField) firstField.focus({preventScroll:true});
  });
}

cartItems.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.unitSize && button.dataset.productId !== undefined && button.dataset.unitIndex !== undefined) {
    const productId = Number(button.dataset.productId);
    const unitIndex = Number(button.dataset.unitIndex);
    if (!Array.isArray(cartUnitSizes[productId])) cartUnitSizes[productId] = [];
    cartUnitSizes[productId][unitIndex] = button.dataset.unitSize;
    const keepScroll = cartItems.scrollTop;
    renderCart();
    cartItems.scrollTop = keepScroll;
    const selectedRow = cartItems.querySelector(`[data-cart-product-id="${productId}"][data-cart-unit-index="${unitIndex}"]`);
    if (selectedRow) selectedRow.querySelector(".cart-size-picker")?.classList.remove("size-invalid");
    return;
  }
  if (button.dataset.addUnit) addCartUnit(Number(button.dataset.addUnit));
  if (button.dataset.removeUnit !== undefined) removeCartUnit(Number(button.dataset.removeUnit), Number(button.dataset.unitIndex));
});
searchInput.addEventListener("input", renderProducts);
categoryFilter.addEventListener("change", renderProducts);
sortSelect.addEventListener("change", renderProducts);
$("#cartShortcut").addEventListener("click", () => {
  renderCart();
  openCart();
});
const proceedCheckout = $("#proceedCheckout");
if (proceedCheckout) {
  proceedCheckout.addEventListener("click", () => {
    const checkoutFields = $("#checkoutFields");
    checkoutFields.hidden = false;
    checkoutFields.dataset.opened = "true";
    proceedCheckout.hidden = true;
    checkoutFields.scrollIntoView({behavior: "smooth", block: "start"});
  });
}
$("#closeCart").addEventListener("click", closeCart);
const continueShoppingEmpty = $("#continueShoppingEmpty");
if (continueShoppingEmpty) continueShoppingEmpty.addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);
$("#whatsappOrder").addEventListener("click", sendWhatsAppOrder);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !cartDrawer.hidden) closeCart();
});

// Android/mobile browser Back: close the active UI and return to catalog instead of exiting.
window.addEventListener("popstate", () => {
  const photoLightbox = $("#photoLightbox");
  if (photoLightbox && !photoLightbox.hidden) {
    closePhotoLightbox({ fromPopstate: true });
    return;
  }

  const successModal = $("#orderSuccessModal");
  if (successModal && !successModal.hidden) {
    successModal.hidden = true;
    document.body.classList.remove("success-modal-open");
    closeCart({ skipHistory: true, fromPopstate: true });
    scrollToCatalogList();
    return;
  }

  if (!cartDrawer.hidden) {
    closeCart({ skipHistory: true, fromPopstate: true });
    scrollToCatalogList();
  }
});

renderCategories();
renderProducts();
renderCart();
