(() => {
  const demo = document.getElementById("demo-market");
  if (!demo) return;

  // Fictional catalog: local illustrations and integer cents, never production data.
  const products = [
    { id: 101, key: "Pack", image: "pack", shop: "1", category: "1", cents: 6800000, discount: 15 },
    { id: 102, key: "Bottle", image: "bottle", shop: "2", category: "2", cents: 2400000, discount: 0 },
    { id: 103, key: "Fleece", image: "fleece", shop: "1", category: "3", cents: 5200000, discount: 10 },
    { id: 104, key: "Mug", image: "mug", shop: "2", category: "2", cents: 1250000, discount: 0 },
    { id: 105, key: "Beanie", image: "beanie", shop: "3", category: "3", cents: 1800000, discount: 0 },
    { id: 106, key: "Duffel", image: "duffel", shop: "3", category: "1", cents: 4600000, discount: 5 }
  ];
  const shops = { "1": "Sendero", "2": "Refugio", "3": "Lago" };
  const categories = { "1": "marketEquipment", "2": "marketAccessories", "3": "marketClothing" };
  const form = demo.querySelector("form");
  const grid = demo.querySelector(".market-grid");
  const dialog = document.getElementById("market-product-dialog");
  let selectedProduct = null;

  function normalize(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
  }

  function money(cents) {
    return new Intl.NumberFormat(currentLanguage() === "en" ? "en-US" : "es-AR", {
      style: "currency", currency: "ARS", currencyDisplay: "code", maximumFractionDigits: 0
    }).format(cents / 100);
  }

  function finalPrice(product) {
    return Math.round(product.cents * (100 - product.discount) / 100);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function imagePath(product) {
    return `assets/img/market/${product.image}.svg`;
  }

  function updateDialog(product) {
    const copy = translations[currentLanguage()];
    const name = copy[`market${product.key}Name`];
    dialog.querySelector("img").src = imagePath(product);
    dialog.querySelector("img").alt = name;
    dialog.querySelector("h3").textContent = name;
    dialog.querySelector("[data-market-description]").textContent = copy[`market${product.key}Description`];
    dialog.querySelector("[data-market-shop]").textContent = shops[product.shop];
    dialog.querySelector("[data-market-category]").textContent = copy[categories[product.category]];
    dialog.querySelector("[data-market-price]").textContent = money(finalPrice(product));
    const original = dialog.querySelector("del");
    original.hidden = !product.discount;
    original.textContent = product.discount ? money(product.cents) : "";
    dialog.querySelector(".market-dialog-discount").hidden = !product.discount;
    dialog.querySelector(".market-dialog-discount").textContent = copy.marketDiscount.replace("{discount}", product.discount);
  }

  function requestFor(query, shop, category) {
    // These paths are grounded in shop/urls.py and shop/Api/product.py.
    if (query) return `/api/products/search/?${new URLSearchParams({ query })}`;
    if (shop && category) return `/api/products/shop/${shop}/category/${category}/?page=1&limit=6`;
    if (shop) return `/api/products/shop/${shop}/`;
    if (category) return `/api/products/category/${category}/?page=1&limit=6`;
    return "/api/products/search/";
  }

  function render() {
    const copy = translations[currentLanguage()];
    const query = form.elements.search.value.trim();
    const shop = form.elements.shop.value;
    const category = form.elements.category.value;
    const search = normalize(query);
    // Search both translations so a language switch preserves the result set.
    const filtered = products.filter(product => {
      const terms = [shops[product.shop], ...["es", "en"].flatMap(language => [
        translations[language][`market${product.key}Name`], translations[language][categories[product.category]]
      ])];
      return (!shop || product.shop === shop) && (!category || product.category === category) &&
        (!search || terms.some(term => normalize(term).includes(search)));
    });
    const fragment = document.createDocumentFragment();
    filtered.forEach(product => {
      const name = copy[`market${product.key}Name`];
      const item = element("li");
      const button = element("button", "market-product");
      button.type = "button";
      button.dataset.productId = product.id;
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-label", `${copy.marketViewProduct}: ${name}. ${money(finalPrice(product))}. ${shops[product.shop]}.`);
      const visual = element("span", "market-product-visual");
      const image = element("img");
      image.src = imagePath(product);
      image.alt = "";
      image.width = 400;
      image.height = 300;
      visual.append(image);
      if (product.discount) visual.append(element("span", "market-discount", `−${product.discount}%`));
      const body = element("span", "market-product-body");
      body.append(element("span", "market-product-shop", shops[product.shop]));
      body.append(element("strong", "market-product-name", name));
      body.append(element("span", "market-product-category", copy[categories[product.category]]));
      const price = element("span", "market-product-price");
      price.append(element("strong", "", money(finalPrice(product))));
      if (product.discount) price.append(element("del", "", money(product.cents)));
      body.append(price);
      const action = element("span", "market-product-action", copy.marketViewProduct);
      const arrow = element("span", "", "↗");
      arrow.setAttribute("aria-hidden", "true");
      action.append(arrow);
      body.append(action);
      button.append(visual, body);
      item.append(button);
      fragment.append(item);
    });
    grid.replaceChildren(fragment);
    grid.hidden = !filtered.length;
    demo.querySelector(".market-empty").hidden = !!filtered.length;
    demo.querySelector("[data-market-count]").textContent = copy[filtered.length === 1 ? "marketCountOne" : "marketCount"]
      .replace("{count}", filtered.length);
    form.elements.search.placeholder = copy.marketSearchPlaceholder;
    demo.querySelector("[data-market-request]").textContent = `GET ${requestFor(query, shop, category)}`;
    demo.querySelector("[data-market-local-filter]").hidden = !(query && (shop || category));
    if (selectedProduct) updateDialog(selectedProduct);
  }

  grid.addEventListener("click", event => {
    const button = event.target.closest("[data-product-id]");
    if (!button) return;
    selectedProduct = products.find(product => String(product.id) === button.dataset.productId);
    updateDialog(selectedProduct);
    dialog.showModal();
    document.body.classList.add("market-dialog-open");
  });
  dialog.querySelector("[data-market-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("market-dialog-open");
    const trigger = selectedProduct && grid.querySelector(`[data-product-id="${selectedProduct.id}"]`);
    selectedProduct = null;
    (trigger || form.elements.search).focus({ preventScroll: true });
  });
  form.elements.search.addEventListener("input", render);
  form.elements.shop.addEventListener("change", render);
  form.elements.category.addEventListener("change", render);
  form.addEventListener("submit", event => event.preventDefault());
  demo.querySelector("[data-market-reset]").addEventListener("click", () => {
    form.reset();
    render();
  });
  demo.querySelector("[data-market-empty-reset]").addEventListener("click", () => {
    form.reset();
    render();
    form.elements.search.focus();
  });
  document.addEventListener("portfolio:languagechange", render);

  render();
  demo.querySelector("fieldset").disabled = false;
  demo.querySelector(".market-results").hidden = false;
  demo.querySelector(".market-fallback").hidden = true;
})();
