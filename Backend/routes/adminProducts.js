import express from "express";
import { db } from "../config/db.js";
import { uploadProductImages, uploadProductImage } from "../middleware/upload.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// TinyMCE image upload endpoint
router.post("/upload-image", uploadProductImage.single("file"), async (req, res) => {
  try {
    // Check authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const token = authHeader.substring(7);
    try {
      jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // For TinyMCE, we need to return absolute URLs to avoid path resolution issues
    // This prevents URLs like /product/backend/uploads/... when on /product/:id page
    const imagePath = `/uploads/products/${req.file.filename}`;
    let imageUrl;
    
    if (process.env.NODE_ENV === 'production') {
      // Return full absolute URL for production
      const protocol = req.protocol || 'https';
      const host = req.get('host') || 'rkindustriesexports.com';
      imageUrl = `${protocol}://${host}/backend${imagePath}`;
    } else {
      // For development, use localhost
      imageUrl = `http://localhost:5000${imagePath}`;
    }
    
    // TinyMCE expects the response in this format
    res.json({
      location: imageUrl
    });
  } catch (err) {
    console.error("IMAGE UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper function to handle image URLs for both production and local
const getImageUrl = (imagePath) => {
  if (!imagePath) return imagePath;
  // Add /backend prefix in production, keep as is in local
  return process.env.NODE_ENV === 'production' 
    ? `/backend${imagePath}` 
    : imagePath;
};

const mapProductsFromRows = rows => {
  const productsMap = new Map();

  rows.forEach(row => {
    if (!row.product_id) return;

    if (!productsMap.has(row.product_id)) {
      productsMap.set(row.product_id, {
        id: row.product_id,
        name: row.product_name,
        image: getImageUrl(row.product_image),
        description: row.product_description,
        additionalDescription: row.product_additional_description || null,
        categoryId: row.category_id,
        categoryName: row.category_name,
        isActive: row.is_active === undefined ? 1 : row.is_active,
        variants: [],
        images: []
      });
    }

    const product = productsMap.get(row.product_id);
    
    // Handle variants
    if (row.variant_id) {
      let variant = product.variants.find(v => v.id === row.variant_id);

      if (!variant) {
        variant = {
          id: row.variant_id,
          sku: row.variant_sku,
          price: row.variant_price,
          stock: row.variant_stock,
          attributes: []
        };
        product.variants.push(variant);
      }

      // Add attribute if it exists and not already added
      if (row.attr_name && row.attr_value) {
        const attrExists = variant.attributes.some(
          a => a.name === row.attr_name && a.value === row.attr_value
        );
        if (!attrExists) {
          variant.attributes.push({
            name: row.attr_name,
            value: row.attr_value
          });
        }
      }
    }

    // Handle product images
    if (row.img_id && row.img_path) {
      const product = productsMap.get(row.product_id);
      if (!product.images.find(img => img.id === row.img_id)) {
        product.images.push({
          id: row.img_id,
          image: getImageUrl(row.img_path),
          sortOrder: row.img_sort || 0
        });
      }
    }
  });

  return Array.from(productsMap.values()).map(p => ({
    ...p,
    images: p.images.sort((a, b) => a.sortOrder - b.sortOrder)
  }));
};

router.get("/products", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         p.id as product_id,
         p.name as product_name,
         p.image as product_image,
         p.description as product_description,
         p.additional_description as product_additional_description,
         p.category_id as category_id,
         c.name as category_name,
         p.is_active as is_active,
         pv.id as variant_id,
         pv.sku as variant_sku,
         pv.price as variant_price,
         pv.stock as variant_stock,
         va.attribute_name as attr_name,
         va.attribute_value as attr_value,
         pi.id as img_id,
         pi.image as img_path,
         pi.sort_order as img_sort
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants pv ON pv.product_id = p.id
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       LEFT JOIN product_images pi ON pi.product_id = p.id
       ORDER BY p.id DESC, pv.id DESC, pi.sort_order ASC`
    );

    res.json({ products: mapProductsFromRows(rows) });
  } catch (err) {
    console.error("PRODUCT LIST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/products",
  uploadProductImages.fields([
    { name: "image", maxCount: 1 },
    { name: "gallery", maxCount: 10 }
  ]),
  async (req, res) => {
    try {
      const {
        categoryName,
        productName,
        description,
        additionalDescription,
        variants
      } = req.body;

      const mainFile = req.files?.image?.[0];
      const galleryFiles = req.files?.gallery || [];

      console.log("Files received:", {
        mainImage: mainFile?.filename,
        galleryCount: galleryFiles.length,
        galleryFiles: galleryFiles.map(f => f.filename)
      });

      if (!mainFile) {
        return res.status(400).json({ error: "Product image required" });
      }

      const [[category]] = await db.query(
        "SELECT id, name FROM categories WHERE name = ?",
        [categoryName]
      );

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      const [productResult] = await db.query(
        `INSERT INTO products (category_id, name, image, description, additional_description, is_active)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, 1))`,
        [
          category.id,
          productName,
          `/uploads/products/${mainFile.filename}`,
          description,
          additionalDescription || null,
          1
        ]
      );

      const productId = productResult.insertId;

      // Save gallery images
      if (galleryFiles && galleryFiles.length > 0) {
        console.log(`Saving ${galleryFiles.length} gallery images for product ${productId}`);
        for (let index = 0; index < galleryFiles.length; index++) {
          const file = galleryFiles[index];
          try {
            await db.query(
              `INSERT INTO product_images (product_id, image, sort_order)
               VALUES (?, ?, ?)`,
              [
                productId,
                `/uploads/products/${file.filename}`,
                index
              ]
            );
            console.log(`Saved gallery image ${index + 1}: ${file.filename}`);
          } catch (imgErr) {
            console.error(`Error saving gallery image ${index + 1}:`, imgErr);
            // Continue with other images even if one fails
          }
        }
      }

      const parsedVariants = JSON.parse(variants || "[]");
      console.log(`Creating product with ${parsedVariants.length} variants`);

      for (const variant of parsedVariants) {
        console.log(`Processing variant SKU: ${variant.sku}, Attributes count: ${(variant.attributes || []).length}`);
        const [variantResult] = await db.query(
          `INSERT INTO product_variants
           (product_id, sku, price, stock)
           VALUES (?, ?, ?, ?)`,
          [
            productId,
            variant.sku,
            variant.price,
            variant.stock
          ]
        );

        const variantId = variantResult.insertId;

        // Deduplicate attributes before inserting
        const uniqueAttributes = [];
        const seenAttrs = new Set();
        
        for (const attr of variant.attributes || []) {
          if (!attr.name || !attr.value) continue; // Skip empty attributes
          
          const attrKey = `${attr.name}:${attr.value}`;
          if (!seenAttrs.has(attrKey)) {
            seenAttrs.add(attrKey);
            uniqueAttributes.push(attr);
          }
        }

        // Insert unique attributes only
        for (const attr of uniqueAttributes) {
          await db.query(
            `INSERT INTO variant_attributes
             (variant_id, attribute_name, attribute_value)
             VALUES (?, ?, ?)`,
            [variantId, attr.name, attr.value]
          );
        }
        
        console.log(`Inserted ${uniqueAttributes.length} unique attributes for variant ${variantId} (SKU: ${variant.sku})`);
      }

      res.json({ success: true, productId });

    } catch (err) {
      console.error("PRODUCT ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Save multiple variants for a product (transactional)
// POST /api/admin/products/:productId/variants
// Payload: [ { price, stock, sku?, attributes: { Size: '8 inches', Color: 'Red' } } ]
router.post("/products/:productId/variants", async (req, res) => {
  const { productId } = req.params;
  const variants = req.body;

  if (!Array.isArray(variants)) {
    return res.status(400).json({ error: "Request body must be an array of variants" });
  }

  const conn = await db.getConnection();
  try {
    // Ensure product exists
    const [[product]] = await conn.query("SELECT id FROM products WHERE id = ?", [productId]);
    if (!product) {
      conn.release();
      return res.status(404).json({ error: "Product not found" });
    }

    await conn.beginTransaction();

    const created = [];

    for (const v of variants) {
      const price = Number(v.price || 0);
      const stock = Number.isFinite(Number(v.stock)) ? Number(v.stock) : 0;
      let sku = v.sku && v.sku.trim() ? v.sku.trim() : null;

      // Auto-generate SKU when missing: P<productId>-<ts>-<rand>
      if (!sku) {
        sku = `P${productId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`.toUpperCase();
      }

      const [variantResult] = await conn.query(
        `INSERT INTO product_variants (product_id, sku, price, stock) VALUES (?, ?, ?, ?)`,
        [productId, sku, price, stock]
      );

      const variantId = variantResult.insertId;

      // Normalize attributes: support both object map and array of {name,value}
      const attrs = v.attributes || {};
      const attrArray = Array.isArray(attrs)
        ? attrs.filter(a => a && a.name && a.value)
        : Object.keys(attrs).map(name => ({ name, value: attrs[name] }));

      // Deduplicate before inserting
      const seen = new Set();
      for (const attr of attrArray) {
        const key = `${attr.name}:::${attr.value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await conn.query(
          `INSERT INTO variant_attributes (variant_id, attribute_name, attribute_value) VALUES (?, ?, ?)`,
          [variantId, attr.name, attr.value]
        );
      }

      created.push({ variantId, sku });
    }

    await conn.commit();

    res.json({ success: true, created });
  } catch (err) {
    await conn.rollback();
    console.error("ADMIN SAVE VARIANTS ERROR:", err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// NEW: GET product edit data including variants and grouped attributes
router.get("/products/:productId/edit", async (req, res) => {
  try {
    const { productId } = req.params;

    const [[productRow]] = await db.query(
      `SELECT id, category_id, name, image, description, additional_description, is_active FROM products WHERE id = ?`,
      [productId]
    );

    if (!productRow) {
      return res.status(404).json({ error: "Product not found" });
    }

    const [rows] = await db.query(
      `SELECT
         pv.id as variant_id,
         pv.sku as sku,
         pv.price as price,
         pv.stock as stock,
         va.attribute_name as attr_name,
         va.attribute_value as attr_value
       FROM product_variants pv
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       WHERE pv.product_id = ?
       ORDER BY pv.id ASC`,
      [productId]
    );

    // Group variants
    const variantsMap = new Map();
    for (const r of rows) {
      if (!variantsMap.has(r.variant_id)) {
        variantsMap.set(r.variant_id, {
          variant_id: r.variant_id,
          sku: r.sku,
          price: r.price,
          stock: r.stock,
          attributes: {}
        });
      }
      if (r.attr_name && r.attr_value) {
        variantsMap.get(r.variant_id).attributes[r.attr_name] = r.attr_value;
      }
    }

    const variants = Array.from(variantsMap.values());

    // Fetch gallery images
    const [imageRows] = await db.query(
      `SELECT id, image, sort_order 
       FROM product_images 
       WHERE product_id = ? 
       ORDER BY sort_order ASC`,
      [productId]
    );

    const images = imageRows.map(img => ({
      id: img.id,
      image: getImageUrl(img.image),
      sortOrder: img.sort_order || 0
    }));

    res.json({ 
      product: {
        ...productRow,
        image: getImageUrl(productRow.image),
        images: images
      }, 
      variants 
    });
  } catch (err) {
    console.error("PRODUCT EDIT FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// NEW: update a single variant details (sku, price, stock)
router.put("/variants/:variantId", async (req, res) => {
  try {
    const { variantId } = req.params;
    const { sku, price, stock, attributes } = req.body;

    // Validate variant exists
    const [[variantRow]] = await db.query("SELECT id FROM product_variants WHERE id = ?", [variantId]);
    if (!variantRow) return res.status(404).json({ error: "Variant not found" });

    const fields = [];
    const values = [];
    if (sku !== undefined) {
      fields.push("sku = ?"); values.push(String(sku).trim());
    }
    if (price !== undefined) {
      fields.push("price = ?"); values.push(Number(price) || 0);
    }
    if (stock !== undefined) {
      fields.push("stock = ?"); values.push(Number(stock) || 0);
    }

    // Begin transaction for safe update when attributes are replaced
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      if (fields.length > 0) {
        values.push(variantId);
        await conn.query(`UPDATE product_variants SET ${fields.join(", ")} WHERE id = ?`, values);
      }

      // If attributes key is present, replace attributes for this variant (explicit operation)
      if (attributes !== undefined) {
        // Normalize attributes to array of {name, value}
        let attrsArray = [];
        if (Array.isArray(attributes)) {
          attrsArray = attributes.map(a => ({ name: a.name, value: a.value })).filter(a => a.name && a.value);
        } else if (typeof attributes === 'object' && attributes !== null) {
          attrsArray = Object.keys(attributes).map(name => ({ name, value: attributes[name] })).filter(a => a.name && a.value);
        }

        // Delete existing attributes and insert new ones (deduplicated)
        await conn.query("DELETE FROM variant_attributes WHERE variant_id = ?", [variantId]);
        const seen = new Set();
        for (const attr of attrsArray) {
          const key = `${attr.name}:${attr.value}`;
          if (seen.has(key)) continue;
          seen.add(key);
          await conn.query(
            `INSERT INTO variant_attributes (variant_id, attribute_name, attribute_value) VALUES (?, ?, ?)`,
            [variantId, attr.name, attr.value]
          );
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      conn.release();
      console.error('VARIANT UPDATE TRANSACTION ERROR:', err);
      return res.status(500).json({ error: err.message });
    } finally {
      conn.release();
    }

    // Return updated variant with attributes
    const [rows] = await db.query(
      `SELECT
         pv.id as variant_id,
         pv.sku as sku,
         pv.price as price,
         pv.stock as stock,
         va.attribute_name as attr_name,
         va.attribute_value as attr_value
       FROM product_variants pv
       LEFT JOIN variant_attributes va ON va.variant_id = pv.id
       WHERE pv.id = ?`,
      [variantId]
    );

    const vMap = { variant_id: variantId, attributes: {}, sku: null, price: null, stock: null };
    for (const r of rows) {
      vMap.sku = r.sku;
      vMap.price = r.price;
      vMap.stock = r.stock;
      if (r.attr_name && r.attr_value) vMap.attributes[r.attr_name] = r.attr_value;
    }

    res.json({ variant: vMap });
  } catch (err) {
    console.error("VARIANT UPDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/variants/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      "DELETE FROM variant_attributes WHERE variant_id = ?",
      [id]
    );
    const [result] = await db.query(
      "DELETE FROM product_variants WHERE id = ?",
      [id]
    );

    res.json({ success: true, deleted: result.affectedRows });
  } catch (err) {
    console.error("VARIANT DELETE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete variants
router.post("/variants/bulk-delete", async (req, res) => {
  try {
    const { variantIds } = req.body;

    if (!variantIds || !Array.isArray(variantIds) || variantIds.length === 0) {
      return res.status(400).json({ error: "variantIds array is required" });
    }

    // Validate all IDs are numbers
    const validIds = variantIds.filter(id => Number.isInteger(Number(id)) && Number(id) > 0);
    if (validIds.length === 0) {
      return res.status(400).json({ error: "Invalid variant IDs provided" });
    }

    // Create placeholders for the IN clause
    const placeholders = validIds.map(() => "?").join(",");

    // Delete variant attributes first (foreign key constraint)
    await db.query(
      `DELETE FROM variant_attributes WHERE variant_id IN (${placeholders})`,
      validIds
    );

    // Delete variants
    const [result] = await db.query(
      `DELETE FROM product_variants WHERE id IN (${placeholders})`,
      validIds
    );

    res.json({ 
      success: true, 
      deleted: result.affectedRows,
      message: `Successfully deleted ${result.affectedRows} variant(s)` 
    });
  } catch (err) {
    console.error("BULK VARIANT DELETE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // delete variant attributes first
    await db.query(
      `DELETE va FROM variant_attributes va
       JOIN product_variants pv ON pv.id = va.variant_id
       WHERE pv.product_id = ?`,
      [id]
    );
    await db.query(
      "DELETE FROM product_variants WHERE product_id = ?",
      [id]
    );
    const [result] = await db.query(
      "DELETE FROM products WHERE id = ?",
      [id]
    );

    res.json({ success: true, deleted: result.affectedRows });
  } catch (err) {
    console.error("PRODUCT DELETE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/products/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const [result] = await db.query(
      "UPDATE products SET is_active = ? WHERE id = ?",
      [isActive ? 1 : 0, id]
    );

    res.json({ success: true, updated: result.affectedRows });
  } catch (err) {
    console.error("PRODUCT STATUS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.put("/products/:id", uploadProductImages.fields([
  { name: "image", maxCount: 1 },
  { name: "gallery", maxCount: 10 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryName, productName, description, additionalDescription, keepImageIds, variants } = req.body;

    console.log("=== PRODUCT UPDATE REQUEST ===");
    console.log("Product ID:", id);
    console.log("Body data:", {
      categoryName,
      productName,
      description: description ? description.substring(0, 50) + "..." : "",
      keepImageIds,
      variants: variants ? "present" : "missing"
    });
    console.log("Files:", {
      mainImage: req.files?.image?.[0]?.filename || "none",
      galleryCount: req.files?.gallery?.length || 0
    });

    const [[product]] = await db.query(
      "SELECT id FROM products WHERE id = ?",
      [id]
    );
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    let categoryId = null;
    if (categoryName) {
      const [[cat]] = await db.query(
        "SELECT id FROM categories WHERE name = ?",
        [categoryName]
      );
      categoryId = cat?.id || null;
    }

    const mainFile = req.files?.image?.[0];
    const galleryFiles = req.files?.gallery || [];

    console.log("Update - Files received:", {
      mainImage: mainFile?.filename,
      galleryCount: galleryFiles.length,
      galleryFiles: galleryFiles.map(f => f.filename)
    });

    const imagePath = mainFile
      ? `/uploads/products/${mainFile.filename}`
      : undefined;

    // Build update query dynamically based on what's provided
    const updateFields = [];
    const updateValues = [];

    if (productName !== undefined && productName !== null && productName !== "") {
      updateFields.push("name = ?");
      updateValues.push(productName);
      console.log("Will update name:", productName);
    }

    if (description !== undefined && description !== null) {
      // Allow empty description
      updateFields.push("description = ?");
      updateValues.push(description || "");
      console.log("Will update description");
    }

    if (additionalDescription !== undefined && additionalDescription !== null) {
      // Allow empty additional description
      updateFields.push("additional_description = ?");
      updateValues.push(additionalDescription || "");
      console.log("Will update additional_description");
    }

    if (categoryId !== null && categoryId !== undefined) {
      updateFields.push("category_id = ?");
      updateValues.push(categoryId);
      console.log("Will update category_id:", categoryId);
    }

    if (imagePath !== undefined) {
      updateFields.push("image = ?");
      updateValues.push(imagePath);
      console.log("Will update image:", imagePath);
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      const updateQuery = `UPDATE products SET ${updateFields.join(", ")} WHERE id = ?`;
      console.log("Executing query:", updateQuery);
      console.log("With values:", updateValues);
      await db.query(updateQuery, updateValues);
      console.log(`✅ Updated product ${id} fields: ${updateFields.join(", ")}`);
    } else {
      console.log(`⚠️ No fields to update for product ${id}`);
    }

    // Handle existing images - delete ones not in keepImageIds
    if (keepImageIds) {
      try {
        const keepIds = JSON.parse(keepImageIds);
        if (Array.isArray(keepIds) && keepIds.length >= 0) {
          // Delete images not in the keep list
          const placeholders = keepIds.map(() => "?").join(",");
          const deleteQuery = keepIds.length > 0
            ? `DELETE FROM product_images WHERE product_id = ? AND id NOT IN (${placeholders})`
            : `DELETE FROM product_images WHERE product_id = ?`;
          const deleteParams = keepIds.length > 0 ? [id, ...keepIds] : [id];
          await db.query(deleteQuery, deleteParams);
          console.log(`Deleted images not in keep list for product ${id}`);
        }
      } catch (keepErr) {
        console.error("Error handling keepImageIds:", keepErr);
      }
    }

    // Save new gallery images if any
    if (galleryFiles && galleryFiles.length > 0) {
      console.log(`Saving ${galleryFiles.length} new gallery images for product ${id}`);
      // Get current max sort_order
      const [[maxSort]] = await db.query(
        "SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM product_images WHERE product_id = ?",
        [id]
      );
      let nextSort = (maxSort?.max_sort || -1) + 1;

      for (const file of galleryFiles) {
        try {
          await db.query(
            `INSERT INTO product_images (product_id, image, sort_order)
             VALUES (?, ?, ?)`,
            [
              id,
              `/uploads/products/${file.filename}`,
              nextSort++
            ]
          );
          console.log(`Saved gallery image: ${file.filename}`);
        } catch (imgErr) {
          console.error(`Error saving gallery image:`, imgErr);
          // Continue with other images even if one fails
        }
      }
    }

    // Handle variants update (do NOT delete existing variants unless explicitly requested)
    if (variants) {
      try {
        let parsedVariants;
        if (typeof variants === 'string') {
          parsedVariants = JSON.parse(variants);
        } else {
          parsedVariants = variants;
        }

        console.log(`Processing ${parsedVariants.length} variants for product ${id}`);
        console.log("Variants data:", JSON.stringify(parsedVariants, null, 2));

        for (const variant of parsedVariants) {
          // If an id is provided, update existing variant fields (sku, price, stock)
          if (variant.id) {
            const fields = [];
            const values = [];

            if (variant.sku !== undefined) { fields.push("sku = ?"); values.push(String(variant.sku).trim()); }
            if (variant.price !== undefined) { fields.push("price = ?"); values.push(Number(variant.price) || 0); }
            if (variant.stock !== undefined) { fields.push("stock = ?"); values.push(Number(variant.stock) || 0); }

            if (fields.length > 0) {
              values.push(variant.id);
              await db.query(`UPDATE product_variants SET ${fields.join(", ")} WHERE id = ?`, values);
              console.log(`Updated variant ${variant.id} fields: ${fields.join(", ")}`);
            }

            // If attributes are explicitly provided for this existing variant, replace its attributes
            if (variant.attributes) {
              // Delete existing attributes for this variant and insert new ones
              await db.query("DELETE FROM variant_attributes WHERE variant_id = ?", [variant.id]);

              const attrsArray = Array.isArray(variant.attributes)
                ? variant.attributes
                : (typeof variant.attributes === 'object' ? Object.keys(variant.attributes).map(name => ({ name, value: variant.attributes[name] })) : []);

              const seen = new Set();
              for (const attr of attrsArray) {
                if (!attr.name || !attr.value) continue;
                const key = `${attr.name}:${attr.value}`;
                if (seen.has(key)) continue;
                seen.add(key);
                await db.query(
                  `INSERT INTO variant_attributes (variant_id, attribute_name, attribute_value) VALUES (?, ?, ?)`,
                  [variant.id, attr.name, attr.value]
                );
              }
              console.log(`Replaced attributes for variant ${variant.id}`);
            }

          } else {
            // No id -> create a new variant (do not delete any existing variants)
            let sku = variant.sku && variant.sku.trim() ? variant.sku.trim() : null;
            if (!sku) {
              sku = `P${id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`.toUpperCase();
              console.log(`Auto-generated SKU for new variant: ${sku}`);
            }

            const price = Number.isFinite(Number(variant.price)) ? Number(variant.price) : 0;
            const stock = Number.isFinite(Number(variant.stock)) ? Number(variant.stock) : 0;

            const [ins] = await db.query(
              `INSERT INTO product_variants (product_id, sku, price, stock) VALUES (?, ?, ?, ?)`,
              [id, sku, price, stock]
            );

            const newVariantId = ins.insertId;

            // Insert attributes if provided
            const attrsArray = Array.isArray(variant.attributes)
              ? variant.attributes
              : (typeof variant.attributes === 'object' ? Object.keys(variant.attributes).map(name => ({ name, value: variant.attributes[name] })) : []);

            const seen = new Set();
            for (const attr of attrsArray) {
              if (!attr.name || !attr.value) continue;
              const key = `${attr.name}:${attr.value}`;
              if (seen.has(key)) continue;
              seen.add(key);
              await db.query(
                `INSERT INTO variant_attributes (variant_id, attribute_name, attribute_value) VALUES (?, ?, ?)`,
                [newVariantId, attr.name, attr.value]
              );
            }

            console.log(`Inserted new variant ${newVariantId} (SKU: ${sku})`);
          }
        }

        console.log(`✅ Successfully processed variants for product ${id}`);
      } catch (variantErr) {
        console.error("❌ Error processing variants:", variantErr);
        // Don't fail the whole update if variants fail, but log it
      }
    } else {
      console.log("⚠️ No variants data provided in update request");
    }

    res.json({ success: true });
  } catch (err) {
    console.error("PRODUCT UPDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
