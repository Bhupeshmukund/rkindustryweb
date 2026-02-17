import express from "express";
import slugify from "slugify";
import { db } from "../config/db.js";
import { uploadCategoryImage } from "../middleware/upload.js";

const router = express.Router();

router.post(
  "/categories",
  uploadCategoryImage.single("image"),
  async (req, res) => {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Category name required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Category image required" });
      }

      const slug = slugify(name, { lower: true });
      const imageUrl = `/uploads/categories/${req.file.filename}`;

      const [result] = await db.query(
        "INSERT INTO categories (name, slug, image) VALUES (?, ?, ?)",
        [name, slug, imageUrl]
      );

      res.json({
        success: true,
        categoryId: result.insertId
      });

    } catch (err) {
      console.error("CATEGORY ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.put(
  "/categories/:id",
  uploadCategoryImage.single("image"),
  async (req, res) => {
    try {
      const categoryId = parseInt(req.params.id);
      const { name } = req.body;

      if (!categoryId || isNaN(categoryId)) {
        return res.status(400).json({ error: "Invalid category ID" });
      }

      if (!name || name.trim() === "") {
        return res.status(400).json({ error: "Category name required" });
      }

      // Check if category exists
      const [[category]] = await db.query(
        "SELECT id, name, image FROM categories WHERE id = ?",
        [categoryId]
      );

      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      const slug = slugify(name, { lower: true });
      let imageUrl = category.image; // Keep existing image if no new one uploaded

      // If new image is uploaded, use it
      if (req.file) {
        imageUrl = `/uploads/categories/${req.file.filename}`;
      }

      // Update category
      await db.query(
        "UPDATE categories SET name = ?, slug = ?, image = ? WHERE id = ?",
        [name, slug, imageUrl, categoryId]
      );

      res.json({
        success: true,
        message: "Category updated successfully",
        category: {
          id: categoryId,
          name,
          slug,
          image: imageUrl
        }
      });

    } catch (err) {
      console.error("UPDATE CATEGORY ERROR:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.delete("/categories/:id", async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);

    if (!categoryId || isNaN(categoryId)) {
      return res.status(400).json({ error: "Invalid category ID" });
    }

    // Check if category exists
    const [[category]] = await db.query(
      "SELECT id, name, image FROM categories WHERE id = ?",
      [categoryId]
    );

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Check if there are any products in this category
    const [products] = await db.query(
      "SELECT COUNT(*) as count FROM products WHERE category_id = ?",
      [categoryId]
    );

    if (products[0].count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete category. There are ${products[0].count} product(s) associated with this category. Please remove or reassign products first.` 
      });
    }

    // Delete the category
    await db.query("DELETE FROM categories WHERE id = ?", [categoryId]);

    res.json({
      success: true,
      message: "Category deleted successfully"
    });

  } catch (err) {
    console.error("DELETE CATEGORY ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
