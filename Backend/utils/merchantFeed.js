import { db } from "../config/db.js";

const getSiteBase = () =>
  (process.env.FRONTEND_URL || process.env.API_BASE || "https://rkindustriesexports.com").replace(
    /\/$/,
    ""
  );

const getBrand = () => process.env.MERCHANT_BRAND || "RK Industries";

const getCurrency = () => process.env.MERCHANT_FEED_CURRENCY || "USD";

export const escapeXml = (value) => {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

export const stripHtml = (html) => {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const toAbsoluteImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;

  const base = getSiteBase();
  const normalized =
    process.env.NODE_ENV === "production"
      ? imagePath.startsWith("/backend")
        ? imagePath
        : `/backend${imagePath.startsWith("/") ? imagePath : `/${imagePath}`}`
      : imagePath.startsWith("/")
        ? imagePath
        : `/${imagePath}`;

  return `${base}${normalized}`;
};

export const buildProductLink = (productId) => {
  const base = getSiteBase();
  const path = process.env.MERCHANT_PRODUCT_PATH || "/product";
  return `${base}${path}/${productId}`;
};

const buildVariantTitle = (productName, attributes) => {
  if (!attributes?.length) return productName;
  const attrText = attributes.map((a) => `${a.name}: ${a.value}`).join(", ");
  return `${productName} - ${attrText}`;
};

const buildFeedId = (productId, variantId, sku) => {
  if (sku) return String(sku).trim();
  return `product-${productId}-variant-${variantId}`;
};

const formatPrice = (price, currency) => {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return `${amount.toFixed(2)} ${currency}`;
};

export const fetchMerchantFeedItems = async () => {
  const [rows] = await db.query(
    `SELECT
       p.id AS product_id,
       p.name AS product_name,
       p.image AS product_image,
       p.description AS product_description,
       c.name AS category_name,
       pv.id AS variant_id,
       pv.sku AS variant_sku,
       pv.price AS variant_price,
       pv.stock AS variant_stock,
       va.attribute_name AS attr_name,
       va.attribute_value AS attr_value
     FROM products p
     INNER JOIN product_variants pv ON pv.product_id = p.id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN variant_attributes va ON va.variant_id = pv.id
     WHERE p.is_active = 1
     ORDER BY p.id ASC, pv.id ASC`
  );

  const variantsMap = new Map();

  for (const row of rows) {
    const key = `${row.product_id}-${row.variant_id}`;
    if (!variantsMap.has(key)) {
      variantsMap.set(key, {
        productId: row.product_id,
        variantId: row.variant_id,
        sku: row.variant_sku,
        name: row.product_name,
        description: row.product_description,
        category: row.category_name,
        image: row.product_image,
        price: row.variant_price,
        stock: row.variant_stock,
        attributes: []
      });
    }

    if (row.attr_name && row.attr_value) {
      const item = variantsMap.get(key);
      const exists = item.attributes.some(
        (a) => a.name === row.attr_name && a.value === row.attr_value
      );
      if (!exists) {
        item.attributes.push({ name: row.attr_name, value: row.attr_value });
      }
    }
  }

  const currency = getCurrency();
  const brand = getBrand();

  return Array.from(variantsMap.values())
    .map((item) => {
      const price = formatPrice(item.price, currency);
      const imageLink = toAbsoluteImageUrl(item.image);
      if (!price || !imageLink) return null;

      return {
        id: buildFeedId(item.productId, item.variantId, item.sku),
        title: buildVariantTitle(item.name, item.attributes),
        description: stripHtml(item.description) || item.name,
        link: buildProductLink(item.productId),
        imageLink,
        availability: Number(item.stock) > 0 ? "in stock" : "out of stock",
        price,
        brand,
        condition: "new",
        productType: item.category || undefined
      };
    })
    .filter(Boolean);
};

export const buildMerchantFeedXml = (items) => {
  const siteBase = getSiteBase();
  const channelTitle = process.env.MERCHANT_FEED_TITLE || "RK Industries Products";

  const itemXml = items
    .map((item) => {
      const lines = [
        "    <item>",
        `      <g:id>${escapeXml(item.id)}</g:id>`,
        `      <g:title>${escapeXml(item.title)}</g:title>`,
        `      <g:description>${escapeXml(item.description)}</g:description>`,
        `      <g:link>${escapeXml(item.link)}</g:link>`,
        `      <g:image_link>${escapeXml(item.imageLink)}</g:image_link>`,
        `      <g:availability>${escapeXml(item.availability)}</g:availability>`,
        `      <g:price>${escapeXml(item.price)}</g:price>`,
        `      <g:brand>${escapeXml(item.brand)}</g:brand>`,
        `      <g:condition>${escapeXml(item.condition)}</g:condition>`
      ];

      if (item.productType) {
        lines.push(`      <g:product_type>${escapeXml(item.productType)}</g:product_type>`);
      }

      lines.push("    </item>");
      return lines.join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${escapeXml(siteBase)}</link>
    <description>${escapeXml(channelTitle)}</description>
${itemXml}
  </channel>
</rss>`;
};
