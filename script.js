// KAILU CREATION — catalog products and WhatsApp order settings.
// IMPORTANT: Replace WHATSAPP_NUMBER with your number including country code, 
// digits only. Example India: "919876543210" (no +, spaces, or hyphens).

const WHATSAPP_NUMBER = "918160621151"; // Optional WhatsApp fallback
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyIyoGbUmWSd3I164G45QWCnyz4FQcQiYgH5LMTnVYMg5DoH9dMh-6EljOoo4WqLmXSPw/exec";
const CURRENCY = "INR";

// Branded, local fallback for missing product-photo URLs (no broken-image icon).
const PHOTO_FALLBACK = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="900" viewBox="0 0 800 900"><rect width="800" height="900" fill="#f5f1e9"/><g fill="none" stroke="#b9c5bc" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><rect x="285" y="320" width="230" height="185" rx="18"/><circle cx="355" cy="375" r="22"/><path d="M300 475l65-65 54 48 38-35 43 52"/></g><text x="400" y="570" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" fill="#315448">KAILU CREATION</text><text x="400" y="610" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#78877d">Photo unavailable</text></svg>'
)}`;
const imageAvailabilityCache = new Map();
const videoAvailabilityCache = new Map();
let detailMediaLoadToken = 0;

// Check bundled/same-origin videos before exposing a player. External video URLs
// are left to the media element's error handler to avoid false negatives from CORS.
function isVideoAvailable(src) {
  if (!src) return Promise.resolve(false);
  if (videoAvailabilityCache.has(src)) return videoAvailabilityCache.get(src);
  const result = (async () => {
    try {
      const url = new URL(src, document.baseURI);
      if (url.origin !== window.location.origin) return true;
      const response = await fetch(url.href, { method: "HEAD", cache: "no-store" });
      // Some desktop browsers / static hosting layers can reject HEAD even when
      // the actual MP4 is playable. Only treat explicit missing-file statuses
      // as unavailable; the video element's own error handler validates playback.
      return response.status !== 404 && response.status !== 410;
    } catch {
      // Don't incorrectly hide a valid video when a host blocks HEAD requests.
      return true;
    }
  })();
  videoAvailabilityCache.set(src, result);
  return result;
}

// Cache both successful and failed image checks so invalid links are not retried repeatedly.
function isImageAvailable(src) {
  if (!src) return Promise.resolve(false);
  if (imageAvailabilityCache.has(src)) return imageAvailabilityCache.get(src);
  const result = new Promise(resolve => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0), { once: true });
    image.addEventListener("error", () => resolve(false), { once: true });
    image.src = src;
  });
  imageAvailabilityCache.set(src, result);
  return result;
}

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

// products-data.js is the single source of catalog truth. Both the current
// grouped format (products + size variants) and a row-per-size spreadsheet
// export are supported here, so catalog values are never duplicated below.
function readCatalogField(object, ...keys) {
  for (const key of keys) {
    if (object && Object.prototype.hasOwnProperty.call(object, key)) {
      const value = object[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
  }
  return undefined;
}

function toInventory(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function normalizeCatalogRecords(records) {
  if (!Array.isArray(records)) return [];
  // A flattened data export can contain one record per SKU/size. Merge rows
  // with the same Catalog ID (or fallback identity) into one color variant.
  const hasNestedVariants = records.some(record => Array.isArray(record.variants));
  if (hasNestedVariants) return records;

  const merged = new Map();
  records.forEach((record, index) => {
    const catalogId = readCatalogField(record, "catalogId", "Catalog ID", "id", "ID");
    const groupCode = readCatalogField(record, "groupCode", "Group Code", "group_code");
    const color = readCatalogField(record, "color", "Color");
    const name = readCatalogField(record, "name", "Product Name", "productName");
    const baseSku = readCatalogField(record, "baseSku", "Base SKU", "Short Name", "shortName", "sku", "Sku", "SKU");
    const key = String(catalogId ?? `${groupCode ?? "group"}::${color ?? "color"}::${baseSku ?? name ?? index}`);
    if (!merged.has(key)) {
      const first = { ...record, variants: [] };
      merged.set(key, first);
    }
    const target = merged.get(key);
    target.variants.push({
      sku: readCatalogField(record, "sku", "Sku", "SKU", "variantSku"),
      size: readCatalogField(record, "size", "Size"),
      inventory: readCatalogField(record, "inventory", "Inventory", "stock", "Stock"),
      mrp: readCatalogField(record, "mrp", "MRP Price", "mrpPrice", "MRP"),
      price: readCatalogField(record, "price", "Sell Price", "sellPrice", "Selling Price"),
      rating: readCatalogField(record, "rating", "Rating"),
      reviews: readCatalogField(record, "reviews", "Reviews"),
      tag: readCatalogField(record, "tag", "Tag")
    });
  });
  return [...merged.values()];
}

const rawCatalogProducts = normalizeCatalogRecords(window.KAILU_PRODUCTS || window.products || []);
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"];
const COLOR_BACKGROUNDS = {
  blue: "#e9dfd0", navy: "#e9dfd0", mustard: "#f0e4c9", yellow: "#f0e4c9",
  cream: "#e4e5d8", black: "#e4e5d8", maroon: "#f0e0e4", red: "#f0e0e4",
  white: "#f5f3ee", green: "#e1eadf", pink: "#f4e1e8", purple: "#e9e1f2"
};

function normalizeProduct(record, index) {
  const rawImages = readCatalogField(record, "images", "Images");
  const images = Array.isArray(rawImages)
    ? rawImages.map(image => typeof image === "string" ? image : readCatalogField(image, "url", "link", "src")).filter(Boolean)
    : [
        readCatalogField(record, "image1Link", "Image-1(Front) Link", "Image-1 (Front) Link", "image", "Image"),
        readCatalogField(record, "image2Link", "Image-2 Link"),
        readCatalogField(record, "image3Link", "Image-3 Link"),
        readCatalogField(record, "image4Link", "Image-4 Link"),
        readCatalogField(record, "image5Link", "Image-5 Link")
      ].filter(Boolean);
  const rawVariants = Array.isArray(record.variants) && record.variants.length ? record.variants : [record];
  const variants = rawVariants.map(variant => {
    const ratingRaw = Number(readCatalogField(variant, "rating", "Rating") ?? readCatalogField(record, "rating", "Rating") ?? 0);
    // Tolerate spreadsheet exports where 4.8 is accidentally represented as 48.
    const rating = ratingRaw > 5 && ratingRaw <= 50 ? ratingRaw / 10 : ratingRaw;
    const size = String(readCatalogField(variant, "size", "Size") ?? "").trim();
    const inventory = toInventory(readCatalogField(variant, "inventory", "Inventory", "stock", "Stock"));
    const variantSku = String(readCatalogField(variant, "sku", "Sku", "SKU", "variantSku") ?? "").trim();
    const baseSkuRaw = String(readCatalogField(record, "baseSku", "Base SKU") ?? "").trim();
    const fallbackBaseSku = String(readCatalogField(record, "sku", "Sku", "SKU") ?? "").replace(/_(XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL)$/i, "");
    const baseSku = baseSkuRaw || fallbackBaseSku;
    return {
      sku: variantSku || (baseSku && size ? `${baseSku}_${size}` : baseSku),
      size,
      inventory,
      mrp: Number(readCatalogField(variant, "mrp", "MRP Price", "mrpPrice", "MRP") ?? readCatalogField(record, "mrp", "MRP Price", "mrpPrice", "MRP") ?? 0),
      price: Number(readCatalogField(variant, "price", "Sell Price", "sellPrice", "Selling Price") ?? readCatalogField(record, "price", "Sell Price", "sellPrice", "Selling Price") ?? 0),
      rating: Number.isFinite(rating) ? rating : 0,
      reviews: Number(readCatalogField(variant, "reviews", "Reviews") ?? readCatalogField(record, "reviews", "Reviews") ?? 0),
      tag: String(readCatalogField(variant, "tag", "Tag") ?? readCatalogField(record, "tag", "Tag") ?? "").trim()
    };
  }).filter(variant => variant.size || variant.sku);
  variants.sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a.size.toUpperCase());
    const bi = SIZE_ORDER.indexOf(b.size.toUpperCase());
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.size.localeCompare(b.size);
  });

  const idValue = readCatalogField(record, "id", "Catalog ID", "catalogId", "ID");
  const baseSku = String(readCatalogField(record, "baseSku", "Base SKU") ?? variants[0]?.sku?.replace(/_(XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL)$/i, "") ?? "");
  const name = String(readCatalogField(record, "name", "Product Name", "productName") ?? readCatalogField(record, "shortName", "Short Name") ?? `Product ${index + 1}`);
  const displayColor = String(readCatalogField(record, "color", "Color") ?? "As shown in photos");
  const rawTag = String(readCatalogField(record, "tag", "Tag") ?? variants[0]?.tag ?? "SALE");
  const tag = rawTag.toLowerCase() === "sell" ? "SALE" : rawTag.toUpperCase();
  const groupCode = String(readCatalogField(record, "groupCode", "Group Code", "group_code") ?? idValue ?? index + 1);
  const firstAvailable = variants.find(variant => variant.inventory > 0) || variants[0] || {};
  const rating = Number(firstAvailable.rating ?? 0);
  const background = COLOR_BACKGROUNDS[displayColor.toLowerCase()] || "#f2eee8";

  return {
    id: Number.isFinite(Number(idValue)) ? Number(idValue) : index + 1,
    catalogId: String(idValue ?? index + 1),
    groupCode,
    category: String(readCatalogField(record, "category", "Category") ?? "Collection"),
    name,
    shortName: String(readCatalogField(record, "shortName", "Short Name") ?? name),
    baseSku,
    sku: baseSku,
    displayColor,
    colorName: displayColor,
    fabric: String(readCatalogField(record, "fabric", "Fabric") ?? ""),
    description: String(readCatalogField(record, "description", "Description") ?? ""),
    image: images[0] || "",
    gallery: images.slice(1),
    video: String(readCatalogField(record, "videoUrl", "Video Link", "videoLink", "video") ?? ""),
    localVideo: String(readCatalogField(record, "localVideo") ?? ""),
    tag,
    color: background,
    price: Number(firstAvailable.price ?? 0),
    mrp: Number(firstAvailable.mrp ?? 0),
    rating,
    reviews: Number(firstAvailable.reviews ?? 0),
    variants,
    stock: variants.reduce((sum, variant) => sum + variant.inventory, 0)
  };
}

const products = rawCatalogProducts.map(normalizeProduct).filter(product => product.image || product.variants.length);

// Wishlisted catalog IDs are stored locally on this device/browser.
const WISHLIST_STORAGE_KEY = "kailuCreationWishlistV1";
let wishlistIds = new Set();
let wishlistMode = false;
try {
  const savedWishlist = JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY) || "[]");
  if (Array.isArray(savedWishlist)) wishlistIds = new Set(savedWishlist.map(String));
} catch (error) {
  // Storage can be unavailable in private browsing; wishlist remains usable for this session.
}

function catalogWishlistKey(product) {
  return String(product?.catalogId || product?.id || "");
}

function isCatalogWishlisted(product) {
  return wishlistIds.has(catalogWishlistKey(product));
}

function persistWishlist() {
  try {
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify([...wishlistIds]));
  } catch (error) {
    // Keep the in-session selection even when persistent browser storage is blocked.
  }
}

function updateWishlistShortcut() {
  const shortcut = $("#wishlistShortcut");
  const count = $("#wishlistCount");
  if (count) count.textContent = String(wishlistIds.size);
  if (shortcut) {
    shortcut.classList.toggle("is-active", wishlistMode);
    shortcut.setAttribute("aria-pressed", String(wishlistMode));
    shortcut.title = wishlistMode ? "Show all catalogs" : "Show wishlist";
    shortcut.setAttribute("aria-label", wishlistMode ? "Show all catalogs" : `Show wishlist, ${wishlistIds.size} saved`);
  }
}

function buildCatalogShareUrl(product) {
  const url = new URL(window.location.href);
  url.searchParams.set("catalog", catalogWishlistKey(product));
  url.hash = "";
  return url.toString();
}

async function shareCatalog(productId) {
  const product = products.find(item => String(item.id) === String(productId) || String(item.catalogId) === String(productId));
  if (!product) {
    showToast("This catalog could not be found.");
    return;
  }
  const url = buildCatalogShareUrl(product);
  const shareData = {
    title: `${product.name} | KAILU CREATION™`,
    text: `View this ${product.displayColor || ""} catalog from KAILU CREATION™: ${product.name}`.trim(),
    url
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
      // Fall back to copying the link if native sharing is unavailable or fails.
    }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const field = document.createElement("textarea");
      field.value = url;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error("Clipboard copy failed");
    }
    showToast("Catalog link copied. Now send it to anyone.");
  } catch (error) {
    window.prompt("Copy this catalog link and send it:", url);
  }
}

function toggleCatalogWishlist(productId) {
  const product = products.find(item => String(item.id) === String(productId) || String(item.catalogId) === String(productId));
  if (!product) return;
  const key = catalogWishlistKey(product);
  const wasSaved = wishlistIds.has(key);
  if (wasSaved) wishlistIds.delete(key);
  else wishlistIds.add(key);
  persistWishlist();
  updateWishlistShortcut();
  renderProducts();
  showToast(wasSaved ? "Removed from Wishlist." : "Added to Wishlist ♥");
}

function getVariantForSize(product, size) {
  if (!product) return null;
  return (product.variants || []).find(variant => variant.size === String(size || "")) || null;
}
function getVariantInventory(product, size) {
  const variant = getVariantForSize(product, size);
  return variant ? variant.inventory : 0;
}
function getProductInventory(product) {
  return (product?.variants || []).reduce((sum, variant) => sum + toInventory(variant.inventory), 0);
}
function getAvailableVariantCount(product) {
  return (product?.variants || []).filter(variant => variant.inventory > 0).length;
}
function getCartVariantCount(productId, size, excludeUnitIndex = null) {
  let count = 0;
  Object.entries(cart || {}).forEach(([id, quantity]) => {
    if (Number(id) !== Number(productId)) return;
    const sizes = Array.isArray(cartUnitSizes[id]) ? cartUnitSizes[id] : [];
    for (let i = 0; i < Number(quantity || 0); i += 1) {
      if (excludeUnitIndex !== null && i === excludeUnitIndex) continue;
      if (String(sizes[i] || "") === String(size || "")) count += 1;
    }
  });
  return count;
}
function getCartProductCount(productId) {
  return Number(cart[productId] || 0);
}
function getProductGroups() {
  const groups = new Map();
  products.forEach(product => {
    const key = String(product.groupCode || product.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  });
  return [...groups.entries()].map(([groupCode, groupVariants]) => ({ groupCode, groupVariants }));
}


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
  // Show every catalog/color record separately in Shop Catalogs.
  // Group Code is still used inside the detail popup for switching colors,
  // but it no longer hides sibling colors from the listing.
  const query = searchInput.value.trim().toLowerCase();
  const visible = products.filter(product => {
    const matchesQuery = `${product.name} ${product.shortName} ${product.category} ${product.description} ${product.displayColor} ${product.baseSku}`.toLowerCase().includes(query);
    const matchesCategory = categoryFilter.value === "all" || product.category === categoryFilter.value;
    const matchesWishlist = !wishlistMode || isCatalogWishlisted(product);
    return matchesQuery && matchesCategory && matchesWishlist;
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
  const emptyHeading = $("#emptyProducts").querySelector("h3");
  const emptyText = $("#emptyProducts").querySelector("p");
  if (wishlistMode && wishlistIds.size === 0) {
    if (emptyHeading) emptyHeading.textContent = "Your wishlist is empty";
    if (emptyText) emptyText.textContent = "Tap the heart icon on a catalog to save it here.";
  } else {
    if (emptyHeading) emptyHeading.textContent = "No products found";
    if (emptyText) emptyText.textContent = wishlistMode ? "No saved catalogs match the current filters." : "Try another search or category.";
  }
  $("#productSummary").textContent = wishlistMode
    ? `${visible.length} saved catalog${visible.length === 1 ? "" : "s"}`
    : `${visible.length} catalog${visible.length === 1 ? "" : "s"} to explore`;
  updateWishlistShortcut();
  visible.forEach(product => {
    const card = document.createElement("article");
    card.className = "product-card compact-product-card";
    card.innerHTML = `
      <div class="product-image" style="background:${product.color}">
        ${product.tag ? `<span class="product-tag">${escapeHtml(product.tag)}</span>` : ""}
        <div class="catalog-card-actions" aria-label="Catalog actions">
          <button class="catalog-icon-button share-catalog-button" type="button" data-share-catalog="${product.id}" aria-label="Share ${escapeHtml(product.name)} catalog link" title="Share catalog link">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.1M8.7 13.3l6.6 4.1"/></svg>
          </button>
          <button class="catalog-icon-button wishlist-catalog-button${isCatalogWishlisted(product) ? " is-wishlisted" : ""}" type="button" data-wishlist-catalog="${product.id}" aria-label="${isCatalogWishlisted(product) ? "Remove from" : "Add to"} wishlist: ${escapeHtml(product.name)}" aria-pressed="${isCatalogWishlisted(product) ? "true" : "false"}" title="${isCatalogWishlisted(product) ? "Remove from wishlist" : "Add to wishlist"}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
          </button>
        </div>
        <img class="catalog-photo" src="${product.image}" alt="${escapeHtml(product.name)}" role="button" tabindex="0" aria-label="Open full-size photo: ${escapeHtml(product.name)}" draggable="false">
        <video class="catalog-video" data-main-video="${product.id}" controls preload="metadata" playsinline aria-label="${escapeHtml(product.name)} product video" hidden></video>
        <button class="gallery-next" type="button" aria-label="Next photo or video" data-gallery-next="${product.id}" hidden>›</button>
      </div>
      <div class="product-gallery" data-gallery="${product.id}">
        <div class="gallery-controls-row">
          <div class="gallery-dots" aria-label="Choose a product photo or video">
            <button type="button" class="gallery-dot active" data-gallery-photo="${product.id}" data-src="${product.image}" aria-label="Main photo" aria-current="true"></button>
            ${(product.gallery || []).map((src, index) => `
              <button type="button" class="gallery-dot" data-gallery-photo="${product.id}" data-src="${src}" aria-label="Product photo ${index + 2}"></button>`).join("")}
            <button type="button" class="gallery-dot gallery-video-dot" data-gallery-video="${product.id}" aria-label="Play ${escapeHtml(product.name)} video" hidden></button>
          </div>
        </div>
      </div>
      <div class="product-info compact-product-info">
        <span class="product-category">${escapeHtml(product.category)}</span>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="product-pricing compact-product-pricing" aria-label="Price ${catalogMoney(product.price)}, MRP ${catalogMoney(product.mrp || product.price)}, ${product.mrp > product.price ? Math.round((1 - product.price / product.mrp) * 100) : 0} percent off">
          <strong class="price">${catalogMoney(product.price)}</strong>
          <span class="mrp-label">MRP <del>${catalogMoney(product.mrp || product.price)}</del></span>
          ${product.mrp > product.price ? `<span class="discount-badge">${Math.round((1 - product.price / product.mrp) * 100)}% OFF</span>` : ""}
        </div>
        <button class="view-catalog-button" type="button" data-view-catalog="${product.id}">View Catalog <span aria-hidden="true">↗</span></button>
      </div>`;
    productGrid.appendChild(card);

    // Remove failed optional gallery items without breaking the remaining photos.
    card.querySelectorAll("[data-gallery-photo]").forEach(dot => {
      const image = new Image();
      image.addEventListener("error", () => {
        if (dot.dataset.src !== product.image) dot.remove();
        updateGalleryControls(card, product);
      });
      image.addEventListener("load", () => updateGalleryControls(card, product));
      image.src = dot.dataset.src;
    });
    const mainPhoto = card.querySelector(".catalog-photo");
    const video = card.querySelector("[data-main-video]");
    const videoDot = card.querySelector("[data-gallery-video]");
    mainPhoto.dataset.currentSrc = product.image;
    mainPhoto.addEventListener("error", async () => {
      const failedSrc = mainPhoto.dataset.currentSrc || mainPhoto.getAttribute("src") || "";
      if (!failedSrc || failedSrc === PHOTO_FALLBACK || mainPhoto.dataset.usingFallback === "true") return;
      const candidates = [...card.querySelectorAll("[data-gallery-photo]")]
        .map(dot => dot.dataset.src)
        .filter(src => src && src !== failedSrc);
      for (const candidate of candidates) {
        if (await isImageAvailable(candidate)) {
          mainPhoto.dataset.currentSrc = candidate;
          mainPhoto.dataset.usingFallback = "false";
          mainPhoto.src = candidate;
          mainPhoto.alt = product.name;
          card.querySelectorAll("[data-gallery-photo]").forEach(dot => {
            const active = dot.dataset.src === candidate;
            dot.classList.toggle("active", active);
            if (active) dot.setAttribute("aria-current", "true");
            else dot.removeAttribute("aria-current");
          });
          return;
        }
      }
      mainPhoto.dataset.usingFallback = "true";
      mainPhoto.dataset.currentSrc = PHOTO_FALLBACK;
      mainPhoto.src = PHOTO_FALLBACK;
      mainPhoto.alt = `${product.name} photo unavailable`;
    });
    video.muted = false;
    video.defaultMuted = false;
    video.preload = "none";
    video.playsInline = true;
    videoDot.hidden = true;
    if (product.video) {
      video.dataset.videoSrc = product.video;
      isVideoAvailable(product.video).then(available => {
        if (!card.isConnected) return;
        const usable = available && video.dataset.videoFailed !== "true";
        videoDot.hidden = !usable;
        if (!usable) delete video.dataset.videoSrc;
        updateGalleryControls(card, product);
      });
    } else {
      delete video.dataset.videoSrc;
    }
    video.addEventListener("error", () => {
      const failedVideoSrc = video.dataset.videoSrc || video.getAttribute("src") || "";
      video.dataset.videoFailed = "true";
      if (failedVideoSrc) videoAvailabilityCache.set(failedVideoSrc, Promise.resolve(false));
      delete video.dataset.videoSrc;
      video.pause();
      video.hidden = true;
      mainPhoto.hidden = false;
      videoDot.hidden = true;
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
  gallery.hidden = photoThumbs.length <= 1 && !hasVideo;
}

// Catch rare image failures in cart thumbnails/lightbox too. The catalog and detail
// images have dedicated handlers so they can try another valid product photo first.
document.addEventListener("error", event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || image.src === PHOTO_FALLBACK) return;
  if (image.classList.contains("catalog-photo") || image.id === "detailProductImage") return;
  image.src = PHOTO_FALLBACK;
  image.alt = image.alt || "Product photo unavailable";
}, true);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}

function addToCart(id, selectedSize = "") {
  const product = products.find(item => item.id === Number(id));
  if (!product) {
    showToast("This catalog could not be added. Please refresh the page.");
    return;
  }
  if (selectedSize) {
    const available = getVariantInventory(product, selectedSize);
    const alreadyInCart = getCartVariantCount(id, selectedSize);
    if (available <= alreadyInCart) {
      showToast(available <= 0 ? `${product.displayColor} / ${selectedSize}: Out of Stock.` : `Only ${available} unit(s) available for size ${selectedSize}.`);
      return;
    }
  } else if (getCartProductCount(id) >= getProductInventory(product)) {
    showToast(`${product.name}: Out of Stock.`);
    return;
  }
  if (!Array.isArray(cartUnitSizes[id])) cartUnitSizes[id] = [];
  cart[id] = (cart[id] || 0) + 1;
  cartUnitSizes[id].push(selectedSize || "");
  renderCart();
  // Add to Cart should only show a brief confirmation; keep the catalog visible.
  showToast(`${product.name} added to your cart.`);

}

function buyNow(id, selectedSize = "", quantity = 1) {
  // Buy Now starts checkout with the selected catalog only.
  const count = Math.max(1, Math.min(10, Number(quantity) || 1));
  const product = products.find(item => item.id === Number(id));
  if (!product || getProductInventory(product) <= 0) {
    showToast("This catalog is Out of Stock.");
    return;
  }
  if (selectedSize && count > getVariantInventory(product, selectedSize)) {
    showToast(`Only ${getVariantInventory(product, selectedSize)} unit(s) available for size ${selectedSize}.`);
    return;
  }
  cart = { [id]: count };
  Object.keys(cartUnitSizes).forEach(key => delete cartUnitSizes[key]);
  cartUnitSizes[id] = Array.from({ length: count }, () => selectedSize || "");
  renderCart();
  openCart();
  startSizeStep();
  showToast(selectedSize ? "Catalog added. Confirm size and delivery details." : "Select a clothing size first.");
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
  const total = units.reduce((sum, unit) => {
    const variant = getVariantForSize(unit.product, unit.size);
    return sum + Number(variant?.price ?? unit.product.price ?? 0);
  }, 0);

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
        <div class="unit-price">${money(Number(getVariantForSize(product, size)?.price ?? product.price))} / item</div>
        <div class="cart-size-picker" role="group" aria-label="Choose size for item ${unitIndex + 1}: ${escapeHtml(product.name)}">
          <span class="cart-size-label">Size:</span>
          ${(product.variants || []).map(variant => `<button type="button" class="size-button cart-size-button ${size === variant.size ? "selected" : ""}" data-unit-size="${escapeHtml(variant.size)}" data-product-id="${product.id}" data-unit-index="${unitIndex}" aria-pressed="${size === variant.size ? "true" : "false"}" ${variant.inventory <= 0 ? 'disabled title="Out of Stock"' : ""}>${escapeHtml(variant.size)}${variant.inventory <= 0 ? " · Out of Stock" : ""}</button>`).join("")}
        </div>
        <div class="quantity-controls cart-unit-controls">
          <button type="button" class="cart-add-one" data-add-unit="${product.id}" aria-label="Add one more ${escapeHtml(product.name)}">＋ Add one</button>
          <button type="button" class="remove-button" data-remove-unit="${product.id}" data-unit-index="${unitIndex}">Remove item</button>
        </div>
      </div>
      <div class="line-price">${money(Number(getVariantForSize(product, size)?.price ?? product.price))}</div>`;
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
  const customerEmail = $("#customerEmail") ? $("#customerEmail").value.trim() : "";
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    $("#customerEmail").focus();
    showToast("Please enter a valid email address or leave it blank.");
    return;
  }
  if (!GOOGLE_SCRIPT_URL.startsWith("https://script.google.com/macros/s/") ||
      GOOGLE_SCRIPT_URL.includes("PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE")) {
    showToast("Order system not connected. Add your Apps Script Web App URL in script.js.");
    return;
  }

  const orderItems = entries.map(({product, quantity, size}) => {
    const variant = getVariantForSize(product, size);
    const unitPrice = Number(variant?.price ?? product.price ?? 0);
    return {
      productName: product.name,
      productId: product.id,
      groupCode: product.groupCode,
      sku: variant?.sku || (product.baseSku && size ? `${product.baseSku}_${size}` : product.baseSku),
      color: product.displayColor,
      size: size || "",
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity
    };
  });
  const total = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const payload = new URLSearchParams({
    store: "KAILU CREATION™",
    customerName: name,
    email: customerEmail,
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
    ["customerName", "customerEmail", "mobileNumber", "houseBuilding", "landmark", "roadArea", "pincode", "city", "state"].forEach(id => {
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

// Product details popup: keep listing cards compact and show full details on request.
let activeCatalogProduct = null;
let activeCatalogMedia = [];
let activeCatalogMediaIndex = 0;
let selectedCatalogSize = "";
let catalogQuantity = 1;

const catalogDetailsModal = $("#catalogDetailsModal");
const detailGalleryDots = $("#detailGalleryDots");
const detailProductImage = $("#detailProductImage");
const detailProductVideo = $("#detailProductVideo");

detailProductImage.addEventListener("error", () => {
  const failedSrc = detailProductImage.dataset.currentImageSrc || detailProductImage.getAttribute("src") || "";
  if (!failedSrc || failedSrc === PHOTO_FALLBACK) return;

  // Mark the URL invalid, and remove it from the carousel if it is still present.
  imageAvailabilityCache.set(failedSrc, Promise.resolve(false));
  const failedIndex = activeCatalogMedia.findIndex(item => item.type === "photo" && item.src === failedSrc);
  if (failedIndex >= 0) {
    activeCatalogMedia.splice(failedIndex, 1);
    if (failedIndex <= activeCatalogMediaIndex) {
      activeCatalogMediaIndex = Math.min(failedIndex, Math.max(0, activeCatalogMedia.length - 1));
    }
  }

  // Even if the failed URL no longer matches the active gallery (for example,
  // a slow request finishing after a product switch), never leave a broken <img>.
  if (activeCatalogMedia.length) {
    activeCatalogMediaIndex = Math.max(0, Math.min(activeCatalogMediaIndex, activeCatalogMedia.length - 1));
    renderDetailGalleryDots();
    updateDetailGallery(activeCatalogMediaIndex);
    return;
  }

  detailProductVideo.pause();
  detailProductVideo.hidden = true;
  detailProductVideo.removeAttribute("src");
  detailProductVideo.load();
  detailProductImage.dataset.currentImageSrc = PHOTO_FALLBACK;
  detailProductImage.src = PHOTO_FALLBACK;
  detailProductImage.alt = `${activeCatalogProduct?.name || "Product"} photo unavailable`;
  detailProductImage.hidden = false;
  $("#detailGalleryPrev").hidden = true;
  $("#detailGalleryNext").hidden = true;
  renderDetailGalleryDots();
});

detailProductVideo.addEventListener("error", () => {
  const failedSrc = detailProductVideo.getAttribute("src") || detailProductVideo.currentSrc || "";
  if (!failedSrc) return;
  const normalizeUrl = value => {
    try { return new URL(value, document.baseURI).href; } catch { return value; }
  };
  const failedIndex = activeCatalogMedia.findIndex(item =>
    item.type === "video" && normalizeUrl(item.src) === normalizeUrl(failedSrc)
  );
  if (failedIndex < 0) return;
  videoAvailabilityCache.set(failedSrc, Promise.resolve(false));
  const failedItemSrc = activeCatalogMedia[failedIndex]?.src;
  if (failedItemSrc) videoAvailabilityCache.set(failedItemSrc, Promise.resolve(false));

  activeCatalogMedia.splice(failedIndex, 1);
  detailProductVideo.pause();
  detailProductVideo.hidden = true;
  detailProductVideo.removeAttribute("src");
  detailProductVideo.load();
  if (activeCatalogMedia.length) {
    activeCatalogMediaIndex = Math.min(failedIndex, activeCatalogMedia.length - 1);
    renderDetailGalleryDots();
    updateDetailGallery(activeCatalogMediaIndex);
  } else {
    detailProductImage.dataset.currentImageSrc = PHOTO_FALLBACK;
    detailProductImage.src = PHOTO_FALLBACK;
    detailProductImage.alt = `${activeCatalogProduct?.name || "Product"} media unavailable`;
    detailProductImage.hidden = false;
    activeCatalogMediaIndex = 0;
    renderDetailGalleryDots();
    $("#detailGalleryPrev").hidden = true;
    $("#detailGalleryNext").hidden = true;
  }
});

function updateDetailSku() {
  if (!activeCatalogProduct) return;
  const selectedVariant = getVariantForSize(activeCatalogProduct, selectedCatalogSize);
  const sku = selectedVariant?.sku || (activeCatalogProduct.baseSku && selectedCatalogSize
    ? `${activeCatalogProduct.baseSku}_${selectedCatalogSize}`
    : activeCatalogProduct.baseSku || `KC-${String(activeCatalogProduct.id).padStart(3, "0")}`);
  $("#detailProductSku").textContent = `SKU: ${sku}`;
}

function updateDetailPricing() {
  if (!activeCatalogProduct) return;
  const variant = getVariantForSize(activeCatalogProduct, selectedCatalogSize) ||
    (activeCatalogProduct.variants || []).find(item => item.inventory > 0) ||
    (activeCatalogProduct.variants || [])[0] || {};
  const price = Number(variant.price ?? activeCatalogProduct.price ?? 0);
  const mrp = Number(variant.mrp ?? activeCatalogProduct.mrp ?? price);
  const discount = mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
  $("#detailProductPricing").innerHTML = `<strong>${catalogMoney(price)}</strong><span class="detail-mrp">MRP <del>${catalogMoney(mrp)}</del></span>${discount ? `<span class="detail-discount">${discount}% OFF</span>` : ""}`;
}

function updateCatalogSizeOptions() {
  const options = $("#detailSizeOptions");
  if (!options || !activeCatalogProduct) return;
  options.replaceChildren();
  (activeCatalogProduct.variants || []).forEach(variant => {
    const button = document.createElement("button");
    const active = variant.size === selectedCatalogSize;
    button.type = "button";
    button.className = `size-button ${active ? "selected" : ""} ${variant.inventory <= 0 ? "size-out-of-stock" : ""}`;
    button.dataset.detailSize = variant.size;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.disabled = variant.inventory <= 0;
    button.title = variant.inventory <= 0 ? "Out of Stock" : `${variant.inventory} available`;
    button.textContent = variant.inventory <= 0 ? `${variant.size} · Out of Stock` : variant.size;
    options.appendChild(button);
  });
  updateDetailStock();
  updateDetailSku();
  updateDetailPricing();
}

function updateDetailStock() {
  if (!activeCatalogProduct) return;
  const stockLine = $("#detailProductStock");
  const totalStock = getProductInventory(activeCatalogProduct);
  if (totalStock <= 0) {
    stockLine.textContent = "Out of Stock";
    stockLine.classList.add("stock-out");
    return;
  }
  if (selectedCatalogSize) {
    const stock = getVariantInventory(activeCatalogProduct, selectedCatalogSize);
    stockLine.textContent = stock > 0 ? `In Stock · ${stock.toLocaleString("en-IN")} available for size ${selectedCatalogSize}` : `Out of Stock · Size ${selectedCatalogSize}`;
    stockLine.classList.toggle("stock-out", stock <= 0);
    return;
  }
  stockLine.textContent = `In Stock · ${getAvailableVariantCount(activeCatalogProduct)} size(s) available`;
  stockLine.classList.remove("stock-out");
}

function renderColorOptions() {
  const options = $("#detailColorOptions");
  if (!options || !activeCatalogProduct) return;
  const groupVariants = products.filter(product => String(product.groupCode) === String(activeCatalogProduct.groupCode));
  options.replaceChildren();
  groupVariants.forEach(variant => {
    const available = getProductInventory(variant) > 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `detail-color-button ${variant.id === activeCatalogProduct.id ? "selected" : ""} ${available ? "" : "out-of-stock"}`;
    button.dataset.detailColorId = String(variant.id);
    button.textContent = available ? variant.displayColor : `${variant.displayColor} · Out of Stock`;
    button.disabled = !available;
    button.setAttribute("aria-pressed", variant.id === activeCatalogProduct.id ? "true" : "false");
    options.appendChild(button);
  });
  const selectedColor = $("#detailProductColor");
  if (selectedColor) selectedColor.textContent = activeCatalogProduct.displayColor || "As shown in photos";
}

function setActiveCatalogProduct(product) {
  if (!product) return;
  activeCatalogProduct = product;
  const mediaLoadToken = ++detailMediaLoadToken;
  selectedCatalogSize = "";
  clearCatalogSizeWarning();
  $("#detailProductCategory").textContent = product.category;
  $("#detailProductName").textContent = product.name;
  $("#detailProductRating").innerHTML = `<span aria-hidden="true">★</span> <strong>${Number(product.rating).toFixed(1)}</strong> <span>(${Number(product.reviews).toLocaleString("en-IN")} reviews)</span>`;
  const price = Number(product.price || 0);
  const mrp = Number(product.mrp || price);
  const discount = mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
  $("#detailProductPricing").innerHTML = `<strong>${catalogMoney(price)}</strong><span class="detail-mrp">MRP <del>${catalogMoney(mrp)}</del></span>${discount ? `<span class="detail-discount">${discount}% OFF</span>` : ""}`;
  $("#detailProductFabric").textContent = product.fabric || "As shown in product details";
  $("#detailProductDescription").textContent = product.description || "Please view the product photos for design details.";
  $("#detailQuantity").textContent = "1";
  catalogQuantity = 1;
  renderColorOptions();
  updateCatalogSizeOptions();

  const candidatePhotos = [...new Set([product.image, ...(product.gallery || [])].filter(Boolean))];
  const candidateVideo = product.video ? { type: "video", src: product.video, alt: `${product.name} video` } : null;

  // Do not expose missing photo links in the detail carousel. Keep a clean placeholder
  // visible while checking, then render only the photos that actually load.
  activeCatalogMedia = [];
  activeCatalogMediaIndex = 0;
  detailGalleryDots.replaceChildren();
  detailProductVideo.pause();
  detailProductVideo.hidden = true;
  detailProductVideo.removeAttribute("src");
  detailProductVideo.load();
  detailProductImage.dataset.currentImageSrc = PHOTO_FALLBACK;
  detailProductImage.src = PHOTO_FALLBACK;
  detailProductImage.alt = `${product.name} photos loading`;
  detailProductImage.hidden = false;
  $("#detailGalleryPrev").hidden = true;
  $("#detailGalleryNext").hidden = true;

  Promise.all([
    Promise.all(candidatePhotos.map(async (src, i) => ({
      type: "photo", src, alt: `${product.name} photo ${i + 1}`, available: await isImageAvailable(src)
    }))),
    candidateVideo ? isVideoAvailable(candidateVideo.src) : Promise.resolve(false)
  ]).then(([photoResults, videoAvailable]) => {
    if (mediaLoadToken !== detailMediaLoadToken || activeCatalogProduct !== product) return;
    activeCatalogMedia = photoResults.filter(item => item.available).map(({ type, src, alt }) => ({ type, src, alt }));
    if (candidateVideo && videoAvailable) activeCatalogMedia.push(candidateVideo);
    activeCatalogMediaIndex = 0;
    renderDetailGalleryDots();
    if (activeCatalogMedia.length) {
      updateDetailGallery(0);
    } else {
      detailProductVideo.pause();
      detailProductVideo.hidden = true;
      detailProductVideo.removeAttribute("src");
      detailProductVideo.load();
      detailProductImage.dataset.currentImageSrc = PHOTO_FALLBACK;
      detailProductImage.src = PHOTO_FALLBACK;
      detailProductImage.alt = `${product.name} photo unavailable`;
      detailProductImage.hidden = false;
      $("#detailGalleryPrev").hidden = true;
      $("#detailGalleryNext").hidden = true;
    }
  });
}

function renderDetailGalleryDots() {
  if (!detailGalleryDots) return;
  const hasVideo = activeCatalogMedia.some(item => item.type === "video");
  const playVideoButton = $("#detailPlayVideo");
  if (playVideoButton) playVideoButton.hidden = !hasVideo;
  detailGalleryDots.innerHTML = activeCatalogMedia.map((item, i) => {
    const isVideo = item.type === "video";
    const active = i === activeCatalogMediaIndex;
    const label = isVideo ? "Play product video" : `Show photo ${i + 1}`;
    return `<button type="button" class="detail-gallery-dot${isVideo ? " detail-gallery-video-dot" : ""}${active ? " active" : ""}" data-detail-gallery-index="${i}" aria-label="${label}" title="${label}" ${active ? 'aria-current="true"' : ""}>${isVideo ? "▶ VIDEO" : ""}</button>`;
  }).join("");
}

function clearCatalogSizeWarning() {
  const section = document.querySelector(".detail-size-section");
  const error = $("#detailSizeError");
  if (section) section.classList.remove("size-selection-required");
  if (error) error.hidden = true;
}

function requireCatalogSize() {
  if (activeCatalogProduct && getProductInventory(activeCatalogProduct) <= 0) {
    showToast("This color is Out of Stock.");
    updateDetailStock();
    return false;
  }
  if (selectedCatalogSize && getVariantInventory(activeCatalogProduct, selectedCatalogSize) > 0) return true;
  const section = document.querySelector(".detail-size-section");
  const error = $("#detailSizeError");
  if (section) section.classList.add("size-selection-required");
  if (error) error.hidden = false;
  showToast("Please select a size first.");
  const options = $("#detailSizeOptions");
  if (options) options.scrollIntoView({ behavior: "smooth", block: "center" });
  const firstSize = options && options.querySelector("[data-detail-size]");
  if (firstSize) firstSize.focus({ preventScroll: true });
  return false;
}

// A dedicated listener ensures size clicks are always handled by the size control itself.
const detailSizeOptions = $("#detailSizeOptions");
if (detailSizeOptions) {
  detailSizeOptions.addEventListener("click", event => {
    const sizeButton = event.target instanceof Element ? event.target.closest("[data-detail-size]") : null;
    if (!sizeButton || !detailSizeOptions.contains(sizeButton)) return;
    const nextSize = sizeButton.dataset.detailSize || "";
    if (getVariantInventory(activeCatalogProduct, nextSize) <= 0) {
      showToast(`Size ${nextSize}: Out of Stock.`);
      return;
    }
    selectedCatalogSize = nextSize;
    clearCatalogSizeWarning();
    updateCatalogSizeOptions();
  });
}

function updateDetailGallery(index = activeCatalogMediaIndex) {
  if (!activeCatalogMedia.length) return;
  activeCatalogMediaIndex = (index + activeCatalogMedia.length) % activeCatalogMedia.length;
  const item = activeCatalogMedia[activeCatalogMediaIndex];
  if (item.type === "video") {
    detailProductImage.hidden = true;
    detailProductVideo.hidden = false;
    // A video-gallery selection is an explicit user action. Start playback here
    // (the previous code loaded the file but never called play() in this popup).
    // Keep sound enabled; if browser autoplay policy declines, native controls remain usable.
    detailProductVideo.controls = true;
    detailProductVideo.muted = false;
    detailProductVideo.defaultMuted = false;
    detailProductVideo.playsInline = true;
    detailProductVideo.preload = "auto";
    const resolvedVideoSrc = new URL(item.src, document.baseURI).href;
    if (detailProductVideo.src !== resolvedVideoSrc) {
      detailProductVideo.pause();
      detailProductVideo.src = resolvedVideoSrc;
      detailProductVideo.load();
    }
    // Gallery-dot click is a direct user gesture; start playback from it.
    const detailVideoPlayAttempt = detailProductVideo.play();
    if (detailVideoPlayAttempt && typeof detailVideoPlayAttempt.catch === "function") {
      detailVideoPlayAttempt.catch(() => {
        // Autoplay with sound may be blocked by browser settings; leave native Play controls available.
      });
    }
  } else {
    detailProductVideo.pause();
    detailProductVideo.hidden = true;
    detailProductVideo.removeAttribute("src");
    detailProductVideo.load();
    detailProductImage.dataset.currentImageSrc = item.src;
    detailProductImage.src = item.src;
    detailProductImage.alt = item.alt;
    detailProductImage.hidden = false;
  }
  detailGalleryDots.querySelectorAll("[data-detail-gallery-index]").forEach((button, i) => {
    const active = i === activeCatalogMediaIndex;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  $("#detailGalleryPrev").hidden = activeCatalogMedia.length < 2;
  $("#detailGalleryNext").hidden = activeCatalogMedia.length < 2;
}

function openCatalogDetails(id, options = {}) {
  const product = products.find(item => item.id === Number(id) || String(item.catalogId) === String(id));
  if (!product || !catalogDetailsModal) return;
  setActiveCatalogProduct(product);
  catalogDetailsModal.hidden = false;
  document.body.classList.add("catalog-details-open");
  if (options.trackHistory && !(history.state && history.state.kailuUI === "shared-catalog")) {
    history.pushState({ ...(history.state || {}), kailuUI: "shared-catalog", catalogId: catalogWishlistKey(product) }, "", window.location.href);
  }
  $("#closeCatalogDetails").focus();
}

function closeCatalogDetails(options = {}) {
  if (!catalogDetailsModal || catalogDetailsModal.hidden) return;
  catalogDetailsModal.hidden = true;
  document.body.classList.remove("catalog-details-open");
  detailProductVideo.pause();
  detailProductVideo.removeAttribute("src");
  detailProductVideo.load();
  activeCatalogProduct = null;
  activeCatalogMedia = [];
  if (!options.skipHistory && !options.fromPopstate && history.state && history.state.kailuUI === "shared-catalog") {
    history.back();
  }
}

catalogDetailsModal.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (target && target.closest("[data-close-catalog-details]")) {
    closeCatalogDetails();
    return;
  }
  const colorButton = target && target.closest("[data-detail-color-id]");
  if (colorButton) {
    const nextProduct = products.find(product => product.id === Number(colorButton.dataset.detailColorId));
    if (nextProduct && getProductInventory(nextProduct) > 0) setActiveCatalogProduct(nextProduct);
    return;
  }
  const playVideoButton = target && target.closest("#detailPlayVideo");
  if (playVideoButton) {
    const videoIndex = activeCatalogMedia.findIndex(item => item.type === "video");
    if (videoIndex >= 0) updateDetailGallery(videoIndex);
    return;
  }
  const galleryDot = target && target.closest("[data-detail-gallery-index]");
  if (galleryDot) {
    updateDetailGallery(Number(galleryDot.dataset.detailGalleryIndex));
    return;
  }
  const galleryNav = target && target.closest("[data-detail-gallery-nav]");
  if (galleryNav) {
    updateDetailGallery(activeCatalogMediaIndex + Number(galleryNav.dataset.detailGalleryNav));
    return;
  }
  const quantityButton = target && target.closest("[data-detail-quantity]");
  if (quantityButton) {
    catalogQuantity = Math.max(1, Math.min(10, catalogQuantity + Number(quantityButton.dataset.detailQuantity)));
    $("#detailQuantity").textContent = String(catalogQuantity);
    return;
  }
  const addButton = target && target.closest("[data-detail-add]");
  if (addButton) {
    if (!activeCatalogProduct || !requireCatalogSize()) return;
    const alreadyInCart = getCartVariantCount(activeCatalogProduct.id, selectedCatalogSize);
    const available = getVariantInventory(activeCatalogProduct, selectedCatalogSize);
    if (alreadyInCart + catalogQuantity > available) {
      showToast(`Only ${Math.max(0, available - alreadyInCart)} more unit(s) available for size ${selectedCatalogSize}.`);
      return;
    }
    for (let i = 0; i < catalogQuantity; i += 1) addToCart(activeCatalogProduct.id, selectedCatalogSize);
    closeCatalogDetails();
    return;
  }
  const buyButton = target && target.closest("[data-detail-buy]");
  if (buyButton && activeCatalogProduct) {
    if (!requireCatalogSize()) return;
    const productId = activeCatalogProduct.id;
    const size = selectedCatalogSize;
    const qty = catalogQuantity;
    closeCatalogDetails();
    buyNow(productId, size, qty);
  }
});

$("#closeCatalogDetails").addEventListener("click", closeCatalogDetails);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && catalogDetailsModal && !catalogDetailsModal.hidden) closeCatalogDetails();
  if (!catalogDetailsModal || catalogDetailsModal.hidden) return;
  if (event.key === "ArrowRight") updateDetailGallery(activeCatalogMediaIndex + 1);
  if (event.key === "ArrowLeft") updateDetailGallery(activeCatalogMediaIndex - 1);
});

// Full-screen viewer sequence contains all valid product photos and, when
// available, the product video as the final gallery item.
let lightboxItems = [];
let lightboxIndex = 0;
let lightboxCard = null;
let lightboxZoom = 1;
const LIGHTBOX_MIN_ZOOM = 1;
const LIGHTBOX_MAX_ZOOM = 4;
const LIGHTBOX_ZOOM_STEP = 0.5;

function applyLightboxZoom() {
  const img = $("#photoLightboxImage");
  if (!img) return;
  img.style.transform = `scale(${lightboxZoom})`;
  img.style.cursor = lightboxZoom > 1 ? "zoom-out" : "zoom-in";
  const zoomOut = $("#photoLightboxZoomOut");
  const zoomIn = $("#photoLightboxZoomIn");
  if (zoomOut) zoomOut.disabled = lightboxZoom <= LIGHTBOX_MIN_ZOOM;
  if (zoomIn) zoomIn.disabled = lightboxZoom >= LIGHTBOX_MAX_ZOOM;
  img.setAttribute("aria-label", lightboxZoom > 1 ? "Product photo zoomed in; click to reset zoom" : "Product photo full screen; click to zoom in");
}

function setLightboxZoom(value) {
  lightboxZoom = Math.max(LIGHTBOX_MIN_ZOOM, Math.min(LIGHTBOX_MAX_ZOOM, Number(value) || 1));
  applyLightboxZoom();
}

function resetLightboxZoom() {
  lightboxZoom = 1;
  applyLightboxZoom();
}

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
  resetLightboxZoom();
  const item = lightboxItems[lightboxIndex];
  const img = $("#photoLightboxImage");
  const video = $("#photoLightboxVideo");

  const zoomControls = document.querySelector(".photo-lightbox-zoom-controls");
  if (zoomControls) zoomControls.hidden = item.type === "video";
  if (item.type === "video") {
    img.hidden = true;
    video.hidden = false;
    video.pause();
    video.src = item.src;
    video.muted = false;
    video.defaultMuted = false;
    video.playsInline = true;
    // load() resets playback to the beginning when switching between gallery items.
    video.load();
    // Attempt playback with sound; browser autoplay rules may require a Play tap.
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {
        // Native controls remain available if autoplay is blocked by the browser.
      });
    }
  } else {
    stopLightboxVideo();
    video.muted = false;
    video.defaultMuted = false;
    img.hidden = false;
    img.src = item.src;
    img.alt = item.alt || "Catalog full screen photo";
  }
}

const photoLightboxVideo = $("#photoLightboxVideo");
photoLightboxVideo.addEventListener("error", () => {
  const failedSrc = photoLightboxVideo.getAttribute("src") || photoLightboxVideo.currentSrc || "";
  if (!failedSrc) return;
  const normalizeUrl = value => {
    try { return new URL(value, document.baseURI).href; } catch { return value; }
  };
  const failedIndex = lightboxItems.findIndex(item =>
    item.type === "video" && normalizeUrl(item.src) === normalizeUrl(failedSrc)
  );
  if (failedIndex < 0) return;
  videoAvailabilityCache.set(failedSrc, Promise.resolve(false));
  const failedItemSrc = lightboxItems[failedIndex]?.src;
  if (failedItemSrc) videoAvailabilityCache.set(failedItemSrc, Promise.resolve(false));
  lightboxItems.splice(failedIndex, 1);
  stopLightboxVideo();
  if (lightboxItems.length) {
    showLightboxItem(Math.min(failedIndex, lightboxItems.length - 1));
  } else {
    closePhotoLightbox();
  }
});

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

// Open the same full-screen viewer directly from the product-details popup.
function openDetailPhotoLightbox() {
  if (!activeCatalogProduct || !activeCatalogMedia.length || detailProductImage.hidden) return;
  lightboxCard = null;
  lightboxItems = activeCatalogMedia.map(item => ({ ...item }));
  showLightboxItem(activeCatalogMediaIndex);
  $("#photoLightbox").hidden = false;
  document.body.classList.add("photo-viewer-open");
  pushKailuUiHistory("photo");
}

detailProductImage.addEventListener("click", openDetailPhotoLightbox);
detailProductImage.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openDetailPhotoLightbox();
  }
});

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
    video.muted = false;
    video.defaultMuted = false;
    video.hidden = true;
    main.hidden = false;
    main.dataset.currentSrc = photoButton.dataset.src;
    main.dataset.usingFallback = "false";
    main.src = photoButton.dataset.src;
    card.querySelectorAll(".gallery-dot").forEach(dot => {
      const active = dot === photoButton;
      dot.classList.toggle("active", active);
      if (active) dot.setAttribute("aria-current", "true"); else dot.removeAttribute("aria-current");
    });
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
    // Start with audio enabled when the customer chooses the video.
    video.muted = false;
    video.defaultMuted = false;
    card.querySelectorAll(".gallery-dot").forEach(dot => {
      const active = dot === videoButton;
      dot.classList.toggle("active", active);
      if (active) dot.setAttribute("aria-current", "true"); else dot.removeAttribute("aria-current");
    });
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
  const shareButton = target && target.closest("[data-share-catalog]");
  if (shareButton) {
    event.preventDefault();
    event.stopPropagation();
    shareCatalog(shareButton.dataset.shareCatalog);
    return;
  }
  const wishlistButton = target && target.closest("[data-wishlist-catalog]");
  if (wishlistButton) {
    event.preventDefault();
    event.stopPropagation();
    toggleCatalogWishlist(wishlistButton.dataset.wishlistCatalog);
    return;
  }
  const colorChoice = target && target.closest("[data-view-color-id]");
  const viewButton = target && target.closest("[data-view-catalog]");
  const addButton = target && target.closest("[data-add]");
  if (colorChoice) {
    event.preventDefault();
    openCatalogDetails(Number(colorChoice.dataset.viewColorId));
    return;
  }
  const buyButton = target && target.closest("[data-buy]");
  if (viewButton) {
    event.preventDefault();
    openCatalogDetails(Number(viewButton.dataset.viewCatalog));
    return;
  }
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
$("#photoLightboxZoomOut").addEventListener("click", event => {
  event.stopPropagation();
  setLightboxZoom(lightboxZoom - LIGHTBOX_ZOOM_STEP);
});
$("#photoLightboxZoomIn").addEventListener("click", event => {
  event.stopPropagation();
  setLightboxZoom(lightboxZoom + LIGHTBOX_ZOOM_STEP);
});
$("#photoLightboxZoomReset").addEventListener("click", event => {
  event.stopPropagation();
  resetLightboxZoom();
});
$("#photoLightboxImage").addEventListener("click", () => {
  // A direct tap/click on the full-screen photo toggles between fit-to-screen and 2x zoom.
  setLightboxZoom(lightboxZoom > 1 ? 1 : 2);
});
$("#photoLightboxImage").addEventListener("wheel", event => {
  event.preventDefault();
  setLightboxZoom(lightboxZoom + (event.deltaY < 0 ? LIGHTBOX_ZOOM_STEP : -LIGHTBOX_ZOOM_STEP));
}, { passive: false });
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
    const selectedSize = button.dataset.unitSize;
    const product = products.find(item => item.id === productId);
    const available = getVariantInventory(product, selectedSize);
    const alreadySelected = getCartVariantCount(productId, selectedSize, unitIndex);
    if (available <= alreadySelected) {
      showToast(available <= 0 ? `Size ${selectedSize}: Out of Stock.` : `Only ${available} unit(s) available for size ${selectedSize}.`);
      return;
    }
    cartUnitSizes[productId][unitIndex] = selectedSize;
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
const wishlistShortcut = $("#wishlistShortcut");
if (wishlistShortcut) {
  wishlistShortcut.addEventListener("click", () => {
    if (wishlistMode) {
      wishlistMode = false;
      updateWishlistShortcut();
      renderProducts();
      showToast("Showing all catalogs.");
      return;
    }
    if (wishlistIds.size === 0) {
      showToast("Your wishlist is empty. Tap a catalog heart to save it.");
      return;
    }
    wishlistMode = true;
    searchInput.value = "";
    categoryFilter.value = "all";
    updateWishlistShortcut();
    renderProducts();
    $("#products").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
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

  if (catalogDetailsModal && !catalogDetailsModal.hidden) {
    closeCatalogDetails({ fromPopstate: true, skipHistory: true });
    scrollToCatalogList();
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

// A shared catalog URL opens that exact catalog detail popup automatically.
const requestedCatalogId = new URLSearchParams(window.location.search).get("catalog");
if (requestedCatalogId) {
  const linkedProduct = products.find(product => String(product.catalogId) === requestedCatalogId || String(product.id) === requestedCatalogId);
  if (linkedProduct) {
    window.setTimeout(() => {
      $("#products").scrollIntoView({ behavior: "auto", block: "start" });
      openCatalogDetails(linkedProduct.id, { trackHistory: true });
    }, 0);
  } else {
    showToast("This catalog link is no longer available.");
  }
}
