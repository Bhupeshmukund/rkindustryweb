import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure folder exists
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/* =========================
   CATEGORY IMAGE UPLOAD
========================= */
const categoryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/categories";
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() + path.extname(file.originalname)
    );
  }
});

/* =========================
   PRODUCT IMAGE UPLOAD
========================= */
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/products";
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() + path.extname(file.originalname)
    );
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only images allowed"), false);
  }
};

export const uploadCategoryImage = multer({
  storage: categoryStorage,
  fileFilter
});

export const uploadProductImage = multer({
  storage: productStorage,
  fileFilter
});

export const uploadProductImages = multer({
  storage: productStorage,
  fileFilter
});

/* =========================
   PAYMENT PROOF UPLOAD
========================= */
const paymentProofStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/Payment-proofs";
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() + "-" + Math.round(Math.random() * 1E9) + path.extname(file.originalname)
    );
  }
});

const paymentProofFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images (JPG, PNG, GIF) and PDF files are allowed.'), false);
  }
};

export const uploadPaymentProof = multer({
  storage: paymentProofStorage,
  fileFilter: paymentProofFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});