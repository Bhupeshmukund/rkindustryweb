import express from "express";
import { db } from "../config/db.js";
import { sendDealershipThankYouEmail, sendDealershipAdminNotification } from "../utils/emailService.js";

const router = express.Router();

// Submit dealership application
router.post("/submit-application", async (req, res) => {
  try {
    const {
      // Step 1: Basic Details
      companyName,
      country,
      city,
      contactPersonName,
      designation,
      email,
      mobileNumber,
      
      // Step 2: Business Qualification
      natureOfBusiness,
      yearsInBusiness,
      productCategories,
      warehouseFacility,
      briefMessage,
      
      // reCAPTCHA
      recaptchaToken
    } = req.body;

    // Validation
    if (!companyName || !country || !contactPersonName || !email || !mobileNumber) {
      return res.status(400).json({ 
        error: "Missing required fields",
        message: "Please fill in all required fields"
      });
    }

    if (!natureOfBusiness || !yearsInBusiness || !warehouseFacility) {
      return res.status(400).json({ 
        error: "Missing required fields",
        message: "Please complete all business qualification fields"
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: "Invalid email format"
      });
    }

    // Verify reCAPTCHA token
    if (!recaptchaToken) {
      return res.status(400).json({ 
        error: "reCAPTCHA verification required"
      });
    }

    // Verify reCAPTCHA token with Google
    try {
      const secretKey = process.env.RECAPTCHA_SECRET_KEY || "6LcHb2ssAAAAAFts7YdOqNbPPT7h7cxgCTK2STwk";
      const verificationUrl = `https://www.google.com/recaptcha/api/siteverify`;
      
      const verificationResponse = await fetch(verificationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `secret=${secretKey}&response=${recaptchaToken}`
      });

      const verificationData = await verificationResponse.json();

      if (!verificationData.success) {
        return res.status(400).json({
          error: "reCAPTCHA verification failed",
          message: "Please complete the reCAPTCHA verification"
        });
      }
    } catch (recaptchaError) {
      console.error("reCAPTCHA verification error:", recaptchaError);
      return res.status(500).json({
        error: "reCAPTCHA verification error",
        message: "Failed to verify reCAPTCHA. Please try again."
      });
    }

    // Insert into database
    const [result] = await db.execute(
      `INSERT INTO dealership_applications (
        company_name, country, city, contact_person_name, designation,
        email, mobile_number, nature_of_business, years_in_business,
        product_categories, warehouse_facility, brief_message, recaptcha_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyName,
        country,
        city || null,
        contactPersonName,
        designation || null,
        email,
        mobileNumber,
        natureOfBusiness,
        yearsInBusiness,
        JSON.stringify(productCategories || []),
        warehouseFacility,
        briefMessage || null,
        recaptchaToken
      ]
    );

    const applicationId = result.insertId;

    // Prepare application data for emails
    const applicationData = {
      applicationId,
      companyName,
      country,
      city,
      contactPersonName,
      designation,
      email,
      mobileNumber,
      natureOfBusiness,
      yearsInBusiness,
      warehouseFacility,
      briefMessage
    };

    // Send thank you email to dealer (from info@rkindustriesexports.com)
    sendDealershipThankYouEmail(email, applicationData).catch(err => {
      console.error("Failed to send thank you email to dealer:", err);
      // Don't fail the request if email fails
    });

    // Send notification email to admin
    const adminEmail = process.env.ADMIN_EMAIL || "info@rkindustriesexports.com";
    sendDealershipAdminNotification(adminEmail, applicationData).catch(err => {
      console.error("Failed to send admin notification email:", err);
      // Don't fail the request if email fails
    });

    res.status(201).json({
      success: true,
      message: "Application submitted successfully! We will contact you soon.",
      applicationId
    });
  } catch (error) {
    console.error("Error submitting dealership application:", error);
    res.status(500).json({
      error: "Failed to submit application",
      message: "An error occurred while processing your application. Please try again."
    });
  }
});

// Get all applications (Admin only - add auth middleware later)
router.get("/applications", async (req, res) => {
  try {
    const [applications] = await db.execute(
      `SELECT 
        id, company_name, country, city, contact_person_name, designation,
        email, mobile_number, nature_of_business, years_in_business,
        product_categories, warehouse_facility, brief_message,
        status, admin_notes, created_at, updated_at
      FROM dealership_applications
      ORDER BY created_at DESC`
    );

    // Parse JSON fields
    const parsedApplications = applications.map(app => ({
      ...app,
      product_categories: app.product_categories ? JSON.parse(app.product_categories) : []
    }));

    res.json({ success: true, applications: parsedApplications });
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
});

// Update application status (Admin only)
router.put("/applications/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    if (!status || !['pending', 'reviewed', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    await db.execute(
      `UPDATE dealership_applications 
       SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, adminNotes || null, id]
    );

    res.json({ success: true, message: "Application status updated" });
  } catch (error) {
    console.error("Error updating application status:", error);
    res.status(500).json({ error: "Failed to update application status" });
  }
});

export default router;
