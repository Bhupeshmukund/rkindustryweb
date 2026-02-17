import nodemailer from 'nodemailer';
import { fetchUSDToINR, isIndia, formatEmailPrice } from './emailPriceHelper.js';

// Create reusable transporter object using SMTP transport
// Note: Authenticate with the main account (bhupesh@rkindustriesexports.com)
// but send emails from the alias (sales@rkindustriesexports.com)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'bhupesh@rkindustriesexports.com',
    pass: process.env.SMTP_PASSWORD || 'Bhupesh981@'
  }
});

// Verify transporter configuration
transporter.verify(function (error, success) {
  if (error) {
    console.error('SMTP configuration error:', error);
  } else {
    console.log('SMTP server is ready to send emails');
  }
});


/**
 * Send order confirmation email to customer
 */
export const sendOrderConfirmationEmail = async (customerEmail, orderData) => {
  try {
    const { orderId, items, total, billing, paymentMethod, orderDate } = orderData;

    // Helper to get full image URL
    const getImageUrl = (imagePath) => {
      if (!imagePath) return '';
      if (imagePath.startsWith('http')) return imagePath;
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://rkindustriesexports.com'
        : (process.env.API_BASE || 'http://localhost:5000');
      return `${baseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
    };

    // Check if order is from India and get exchange rate
    const orderIsIndia = isIndia(billing?.country);
    const exchangeRate = orderIsIndia ? await fetchUSDToINR() : 1;
    
    // Helper to format price
    const formatPrice = (price) => formatEmailPrice(price, billing?.country, exchangeRate);

    // Build order items HTML
    const itemsHtml = items.map(item => {
      const attributes = item.attributes && item.attributes.length > 0
        ? ` (${item.attributes.map(attr => `${attr.name}: ${attr.value}`).join(', ')})`
        : '';
      const imageUrl = getImageUrl(item.image);
      const itemPrice = formatPrice(item.price);
      const itemTotal = formatPrice(item.price * item.quantity);
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            ${imageUrl ? `<img src="${imageUrl}" alt="${item.productName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;" />` : '<div style="width: 60px; height: 60px; background: #f0f0f0; border-radius: 4px;"></div>'}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName}${attributes}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemPrice}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemTotal}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #00ACEE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .order-info { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #00ACEE; color: white; padding: 10px; text-align: left; }
          .total { font-size: 18px; font-weight: bold; color: #00ACEE; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Confirmation</h1>
          </div>
          <div class="content">
            <p>Dear ${billing?.name || 'Customer'},</p>
            <p>Thank you for your order! We have received your order and will process it shortly.</p>
            
            <div class="order-info">
              <h3>Order Details</h3>
              <p><strong>Order ID:</strong> #${orderId}</p>
              <p><strong>Order Date:</strong> ${orderDate || new Date().toLocaleString('en-IN')}</p>
              <p><strong>Payment Method:</strong> ${paymentMethod === 'razorpay' ? 'Online Payment' : 'Bank Transfer'}</p>
            </div>

            <h3>Order Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="order-info">
              <p style="text-align: right;"><span class="total">Total Amount: ${formatPrice(total)}</span></p>
            </div>

            <div class="order-info">
              <h3>Shipping Address</h3>
              <p>${billing?.name || ''}<br>
              ${billing?.address || ''}<br>
              ${billing?.city || ''}, ${billing?.state || ''} ${billing?.pincode || ''}<br>
              ${billing?.country || ''}<br>
              Phone: ${billing?.phone || ''}</p>
            </div>

            <p>We will send you another email once your order has been shipped.</p>
            <p>If you have any questions, please contact us at sales@rkindustriesexports.com</p>
          </div>
          <div class="footer">
            <p>RK Industries Exports<br>
            Thank you for shopping with us!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"RK Industries Exports" <${process.env.SMTP_USER || 'sales@rkindustriesexports.com'}>`,
      to: customerEmail,
      subject: `Order Confirmation - Order #${orderId}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Order confirmation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send new order notification email to admin
 */
export const sendAdminOrderNotification = async (adminEmail, orderData) => {
  try {
    const { orderId, items, total, billing, paymentMethod, customerEmail, orderDate } = orderData;

    // Helper to get full image URL
    const getImageUrl = (imagePath) => {
      if (!imagePath) return '';
      if (imagePath.startsWith('http')) return imagePath;
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://rkindustriesexports.com'
        : (process.env.API_BASE || 'http://localhost:5000');
      return `${baseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
    };

    // Check if order is from India and get exchange rate (for admin, show both currencies)
    const orderIsIndia = isIndia(billing?.country);
    const exchangeRate = orderIsIndia ? await fetchUSDToINR() : 1;
    
    // Helper to format price (admin sees both USD and INR if India)
    const formatPrice = (price) => {
      if (orderIsIndia) {
        const inrPrice = parseFloat(price) * exchangeRate;
        return `$${parseFloat(price).toFixed(2)} (₹${inrPrice.toFixed(2)})`;
      }
      return `$${parseFloat(price).toFixed(2)}`;
    };

    // Build order items HTML
    const itemsHtml = items.map(item => {
      const attributes = item.attributes && item.attributes.length > 0
        ? ` (${item.attributes.map(attr => `${attr.name}: ${attr.value}`).join(', ')})`
        : '';
      const imageUrl = getImageUrl(item.image);
      const itemPrice = formatPrice(item.price);
      const itemTotal = formatPrice(item.price * item.quantity);
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            ${imageUrl ? `<img src="${imageUrl}" alt="${item.productName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;" />` : '<div style="width: 60px; height: 60px; background: #f0f0f0; border-radius: 4px;"></div>'}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName}${attributes}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemPrice}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemTotal}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .order-info { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #dc3545; color: white; padding: 10px; text-align: left; }
          .total { font-size: 18px; font-weight: bold; color: #dc3545; }
          .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Order Received</h1>
          </div>
          <div class="content">
            <div class="alert">
              <strong>New Order Alert!</strong> A new order has been placed and requires your attention.
            </div>
            
            <div class="order-info">
              <h3>Order Details</h3>
              <p><strong>Order ID:</strong> #${orderId}</p>
              <p><strong>Order Date:</strong> ${orderDate || new Date().toLocaleString('en-IN')}</p>
              <p><strong>Customer Email:</strong> ${customerEmail || 'N/A'}</p>
              <p><strong>Payment Method:</strong> ${paymentMethod === 'razorpay' ? 'Online Payment (Razorpay)' : 'Bank Transfer'}</p>
              <p><strong>Status:</strong> ${paymentMethod === 'razorpay' ? 'Paid' : 'Pending'}</p>
            </div>

            <h3>Order Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="order-info">
              <p style="text-align: right;"><span class="total">Total Amount: ${formatPrice(total)}</span></p>
            </div>

            <div class="order-info">
              <h3>Customer Shipping Address</h3>
              <p>${billing?.name || ''}<br>
              ${billing?.address || ''}<br>
              ${billing?.city || ''}, ${billing?.state || ''} ${billing?.pincode || ''}<br>
              ${billing?.country || ''}<br>
              Phone: ${billing?.phone || ''}</p>
            </div>

            <p><strong>Action Required:</strong> Please review this order and process it accordingly.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"RK Industries Exports" <${process.env.SMTP_USER || 'sales@rkindustriesexports.com'}>`,
      to: adminEmail,
      subject: `New Order Received - Order #${orderId}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Admin order notification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending admin order notification email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send payment verification pending email (for bank transfer orders)
 */
export const sendPaymentVerificationPendingEmail = async (customerEmail, orderData) => {
  try {
    const { orderId, items, total, billing, orderDate } = orderData;

    // Helper to get full image URL
    const getImageUrl = (imagePath) => {
      if (!imagePath) return '';
      if (imagePath.startsWith('http')) return imagePath;
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://rkindustriesexports.com'
        : (process.env.API_BASE || 'http://localhost:5000');
      return `${baseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
    };

    // Check if order is from India and get exchange rate
    const orderIsIndia = isIndia(billing?.country);
    const exchangeRate = orderIsIndia ? await fetchUSDToINR() : 1;
    
    // Helper to format price
    const formatPrice = (price) => formatEmailPrice(price, billing?.country, exchangeRate);

    // Build order items HTML
    const itemsHtml = items.map(item => {
      const attributes = item.attributes && item.attributes.length > 0
        ? ` (${item.attributes.map(attr => `${attr.name}: ${attr.value}`).join(', ')})`
        : '';
      const imageUrl = getImageUrl(item.image);
      const itemPrice = formatPrice(item.price);
      const itemTotal = formatPrice(item.price * item.quantity);
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            ${imageUrl ? `<img src="${imageUrl}" alt="${item.productName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;" />` : '<div style="width: 60px; height: 60px; background: #f0f0f0; border-radius: 4px;"></div>'}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName}${attributes}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemPrice}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemTotal}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ff9800; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .order-info { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #ff9800; color: white; padding: 10px; text-align: left; }
          .total { font-size: 18px; font-weight: bold; color: #ff9800; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Verification Pending</h1>
          </div>
          <div class="content">
            <p>Dear ${billing?.name || 'Customer'},</p>
            <p>Thank you for your order! We have received your order and payment details.</p>
            
            <div class="alert">
              <strong>⚠️ Payment Verification Pending</strong><br>
              Your payment verification is currently pending. We will verify your bank transfer and update you once the payment is confirmed.
            </div>
            
            <div class="order-info">
              <h3>Order Details</h3>
              <p><strong>Order ID:</strong> #${orderId}</p>
              <p><strong>Order Date:</strong> ${orderDate || new Date().toLocaleString('en-IN')}</p>
              <p><strong>Payment Method:</strong> Bank Transfer</p>
              <p><strong>Status:</strong> Payment Verification Pending</p>
            </div>

            <h3>Order Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="order-info">
              <p style="text-align: right;"><span class="total">Total Amount: ${formatPrice(total)}</span></p>
            </div>

            <div class="order-info">
              <h3>Shipping Address</h3>
              <p>${billing?.name || ''}<br>
              ${billing?.address || ''}<br>
              ${billing?.city || ''}, ${billing?.state || ''} ${billing?.pincode || ''}<br>
              ${billing?.country || ''}<br>
              Phone: ${billing?.phone || ''}</p>
            </div>

            <p>We will send you another email once your payment is verified and your order is being processed.</p>
            <p>If you have any questions, please contact us at sales@rkindustriesexports.com</p>
          </div>
          <div class="footer">
            <p>RK Industries Exports<br>
            Thank you for shopping with us!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"RK Industries Exports" <${process.env.SMTP_USER || 'sales@rkindustriesexports.com'}>`,
      to: customerEmail,
      subject: `Payment Verification Pending - Order #${orderId}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Payment verification pending email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending payment verification pending email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send payment confirmed and processing email
 */
export const sendPaymentConfirmedEmail = async (customerEmail, orderData) => {
  try {
    const { orderId, items, total, billing, orderDate } = orderData;

    // Helper to get full image URL
    const getImageUrl = (imagePath) => {
      if (!imagePath) return '';
      if (imagePath.startsWith('http')) return imagePath;
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://rkindustriesexports.com'
        : (process.env.API_BASE || 'http://localhost:5000');
      return `${baseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
    };

    // Check if order is from India and get exchange rate
    const orderIsIndia = isIndia(billing?.country);
    const exchangeRate = orderIsIndia ? await fetchUSDToINR() : 1;
    
    // Helper to format price
    const formatPrice = (price) => formatEmailPrice(price, billing?.country, exchangeRate);

    // Build order items HTML
    const itemsHtml = items.map(item => {
      const attributes = item.attributes && item.attributes.length > 0
        ? ` (${item.attributes.map(attr => `${attr.name}: ${attr.value}`).join(', ')})`
        : '';
      const imageUrl = getImageUrl(item.image);
      const itemPrice = formatPrice(item.price);
      const itemTotal = formatPrice(item.price * item.quantity);
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            ${imageUrl ? `<img src="${imageUrl}" alt="${item.productName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;" />` : '<div style="width: 60px; height: 60px; background: #f0f0f0; border-radius: 4px;"></div>'}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName}${attributes}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemPrice}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemTotal}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .order-info { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .alert { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 15px 0; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #28a745; color: white; padding: 10px; text-align: left; }
          .total { font-size: 18px; font-weight: bold; color: #28a745; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Confirmed - Order Processing</h1>
          </div>
          <div class="content">
            <p>Dear ${billing?.name || 'Customer'},</p>
            <p>Great news! Your payment has been confirmed and your order is now being processed.</p>
            
            <div class="alert">
              <strong>✅ Payment Confirmed</strong><br>
              Your payment has been verified and your order is now under processing. We will keep you updated on the progress.
            </div>
            
            <div class="order-info">
              <h3>Order Details</h3>
              <p><strong>Order ID:</strong> #${orderId}</p>
              <p><strong>Order Date:</strong> ${orderDate || new Date().toLocaleString('en-IN')}</p>
              <p><strong>Status:</strong> Processing</p>
            </div>

            <h3>Order Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="order-info">
              <p style="text-align: right;"><span class="total">Total Amount: ${formatPrice(total)}</span></p>
            </div>

            <div class="order-info">
              <h3>Shipping Address</h3>
              <p>${billing?.name || ''}<br>
              ${billing?.address || ''}<br>
              ${billing?.city || ''}, ${billing?.state || ''} ${billing?.pincode || ''}<br>
              ${billing?.country || ''}<br>
              Phone: ${billing?.phone || ''}</p>
            </div>

            <p>We will send you another email once your order is completed and ready for shipment.</p>
            <p>If you have any questions, please contact us at sales@rkindustriesexports.com</p>
          </div>
          <div class="footer">
            <p>RK Industries Exports<br>
            Thank you for shopping with us!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"RK Industries Exports" <${process.env.SMTP_USER || 'sales@rkindustriesexports.com'}>`,
      to: customerEmail,
      subject: `Payment Confirmed - Order #${orderId} is Processing`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Payment confirmed email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending payment confirmed email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send order completed email
 */
export const sendOrderCompletedEmail = async (customerEmail, orderData) => {
  try {
    const { orderId, items, total, billing, orderDate } = orderData;

    // Helper to get full image URL
    const getImageUrl = (imagePath) => {
      if (!imagePath) return '';
      if (imagePath.startsWith('http')) return imagePath;
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://rkindustriesexports.com'
        : (process.env.API_BASE || 'http://localhost:5000');
      return `${baseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
    };

    // Check if order is from India and get exchange rate
    const orderIsIndia = isIndia(billing?.country);
    const exchangeRate = orderIsIndia ? await fetchUSDToINR() : 1;
    
    // Helper to format price
    const formatPrice = (price) => formatEmailPrice(price, billing?.country, exchangeRate);

    // Build order items HTML
    const itemsHtml = items.map(item => {
      const attributes = item.attributes && item.attributes.length > 0
        ? ` (${item.attributes.map(attr => `${attr.name}: ${attr.value}`).join(', ')})`
        : '';
      const imageUrl = getImageUrl(item.image);
      const itemPrice = formatPrice(item.price);
      const itemTotal = formatPrice(item.price * item.quantity);
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            ${imageUrl ? `<img src="${imageUrl}" alt="${item.productName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;" />` : '<div style="width: 60px; height: 60px; background: #f0f0f0; border-radius: 4px;"></div>'}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName}${attributes}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemPrice}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemTotal}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #17a2b8; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .order-info { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .alert { background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 15px 0; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #17a2b8; color: white; padding: 10px; text-align: left; }
          .total { font-size: 18px; font-weight: bold; color: #17a2b8; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Completed</h1>
          </div>
          <div class="content">
            <p>Dear ${billing?.name || 'Customer'},</p>
            <p>We're excited to inform you that your order has been completed!</p>
            
            <div class="alert">
              <strong>✅ Order Completed</strong><br>
              Your order has been processed and completed successfully. We hope you enjoy your purchase!
            </div>
            
            <div class="order-info">
              <h3>Order Details</h3>
              <p><strong>Order ID:</strong> #${orderId}</p>
              <p><strong>Order Date:</strong> ${orderDate || new Date().toLocaleString('en-IN')}</p>
              <p><strong>Status:</strong> Completed</p>
            </div>

            <h3>Order Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="order-info">
              <p style="text-align: right;"><span class="total">Total Amount: ${formatPrice(total)}</span></p>
            </div>

            <div class="order-info">
              <h3>Shipping Address</h3>
              <p>${billing?.name || ''}<br>
              ${billing?.address || ''}<br>
              ${billing?.city || ''}, ${billing?.state || ''} ${billing?.pincode || ''}<br>
              ${billing?.country || ''}<br>
              Phone: ${billing?.phone || ''}</p>
            </div>

            <p>Thank you for your business! We appreciate your trust in RK Industries Exports.</p>
            <p>If you have any questions or need assistance, please contact us at sales@rkindustriesexports.com</p>
          </div>
          <div class="footer">
            <p>RK Industries Exports<br>
            Thank you for shopping with us!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"RK Industries Exports" <${process.env.SMTP_USER || 'sales@rkindustriesexports.com'}>`,
      to: customerEmail,
      subject: `Order Completed - Order #${orderId}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Order completed email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending order completed email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send order cancelled email with reason
 */
export const sendOrderCancelledEmail = async (customerEmail, orderData) => {
  try {
    const { orderId, items, total, billing, orderDate, cancellationReason } = orderData;

    // Helper to get full image URL
    const getImageUrl = (imagePath) => {
      if (!imagePath) return '';
      if (imagePath.startsWith('http')) return imagePath;
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://rkindustriesexports.com'
        : (process.env.API_BASE || 'http://localhost:5000');
      return `${baseUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
    };

    // Check if order is from India and get exchange rate
    const orderIsIndia = isIndia(billing?.country);
    const exchangeRate = orderIsIndia ? await fetchUSDToINR() : 1;
    
    // Helper to format price
    const formatPrice = (price) => formatEmailPrice(price, billing?.country, exchangeRate);

    // Build order items HTML
    const itemsHtml = items.map(item => {
      const attributes = item.attributes && item.attributes.length > 0
        ? ` (${item.attributes.map(attr => `${attr.name}: ${attr.value}`).join(', ')})`
        : '';
      const imageUrl = getImageUrl(item.image);
      const itemPrice = formatPrice(item.price);
      const itemTotal = formatPrice(item.price * item.quantity);
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            ${imageUrl ? `<img src="${imageUrl}" alt="${item.productName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;" />` : '<div style="width: 60px; height: 60px; background: #f0f0f0; border-radius: 4px;"></div>'}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName}${attributes}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemPrice}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${itemTotal}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .order-info { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .alert { background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .reason-box { background: #fff; border: 1px solid #dc3545; padding: 15px; margin: 15px 0; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #dc3545; color: white; padding: 10px; text-align: left; }
          .total { font-size: 18px; font-weight: bold; color: #dc3545; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Cancelled</h1>
          </div>
          <div class="content">
            <p>Dear ${billing?.name || 'Customer'},</p>
            <p>We regret to inform you that your order has been cancelled.</p>
            
            <div class="alert">
              <strong>❌ Order Cancelled</strong><br>
              Your order has been cancelled. Please see the reason below.
            </div>
            
            ${cancellationReason ? `
            <div class="reason-box">
              <h3 style="margin-top: 0; color: #dc3545;">Cancellation Reason:</h3>
              <p style="margin-bottom: 0;">${cancellationReason}</p>
            </div>
            ` : ''}
            
            <div class="order-info">
              <h3>Order Details</h3>
              <p><strong>Order ID:</strong> #${orderId}</p>
              <p><strong>Order Date:</strong> ${orderDate || new Date().toLocaleString('en-IN')}</p>
              <p><strong>Status:</strong> Cancelled</p>
            </div>

            <h3>Order Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="order-info">
              <p style="text-align: right;"><span class="total">Total Amount: ${formatPrice(total)}</span></p>
            </div>

            <p>If you have any questions about this cancellation or would like to place a new order, please contact us at sales@rkindustriesexports.com</p>
            <p>We apologize for any inconvenience caused.</p>
          </div>
          <div class="footer">
            <p>RK Industries Exports<br>
            Thank you for your understanding.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"RK Industries Exports" <${process.env.SMTP_USER || 'sales@rkindustriesexports.com'}>`,
      to: customerEmail,
      subject: `Order Cancelled - Order #${orderId}`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Order cancelled email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending order cancelled email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send thank you email to user after contact form submission
 */
export const sendContactThankYouEmail = async (customerEmail, contactData) => {
  try {
    const { name, email, message } = contactData;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #00ACEE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .message-box { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; border-left: 4px solid #00ACEE; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Thank You for Contacting Us</h1>
          </div>
          <div class="content">
            <p>Dear ${name},</p>
            <p>Thank you for reaching out to RK Industries Exports! We have received your message and our team will get back to you shortly.</p>
            
            <div class="message-box">
              <h3 style="margin-top: 0;">Your Message:</h3>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>

            <p>We typically respond within 24-48 hours. If your inquiry is urgent, please feel free to call us at:</p>
            <p><strong>Phone:</strong> +91-8685933785 / +91-9896099653</p>
            <p><strong>Email:</strong> sales@rkindustriesexports.com</p>

            <p>We appreciate your interest in our products and services.</p>
            <p>Best regards,<br>RK Industries Exports Team</p>
          </div>
          <div class="footer">
            <p>RK Industries Exports<br>
            Thank you for your inquiry!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Use the same transporter but send from info@ email address
    const mailOptions = {
      from: `"RK Industries Exports" <info@rkindustriesexports.com>`,
      to: customerEmail,
      subject: `Thank You for Contacting RK Industries Exports`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Contact thank you email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending contact thank you email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send contact form notification email to admin
 */
export const sendContactAdminNotification = async (adminEmail, contactData) => {
  try {
    const { name, email, message } = contactData;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .message-box { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; border-left: 4px solid #dc3545; }
          .info-box { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Contact Form Submission</h1>
          </div>
          <div class="content">
            <div class="alert">
              <strong>New Message Alert!</strong> A new message has been received through the contact form.
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0;">Contact Information</h3>
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
              <p><strong>Submitted:</strong> ${new Date().toLocaleString('en-IN')}</p>
            </div>

            <div class="message-box">
              <h3 style="margin-top: 0;">Message:</h3>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>

            <p><strong>Action Required:</strong> Please respond to this inquiry at your earliest convenience.</p>
            <p>You can reply directly to: <a href="mailto:${email}">${email}</a></p>
          </div>
          <div class="footer">
            <p>RK Industries Exports Admin</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"RK Industries Exports" <${process.env.SMTP_USER || 'sales@rkindustriesexports.com'}>`,
      to: adminEmail,
      subject: `New Contact Form Message from ${name}`,
      html: htmlContent,
      replyTo: email // Allow admin to reply directly to the customer
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Contact admin notification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending contact admin notification email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send email verification email to new user
 */
export const sendVerificationEmail = async (userEmail, userName, verificationLink) => {
  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #00ACEE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #00ACEE; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verify Your Email Address</h1>
          </div>
          <div class="content">
            <p>Dear ${userName},</p>
            <p>Thank you for signing up with RK Industries Exports!</p>
            <p>Please verify your email address by clicking the button below:</p>
            <div style="text-align: center;">
              <a href="${verificationLink}" class="button">Verify Email Address</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #00ACEE;">${verificationLink}</p>
            <p>This verification link will expire in 24 hours.</p>
            <p>If you did not create an account, please ignore this email.</p>
            <div class="footer">
              <p>Best regards,<br>RK Industries Exports Team</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: '"RK Industries Exports" <info@rkindustriesexports.com>',
      to: userEmail,
      subject: 'Verify Your Email Address - RK Industries Exports',
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};

/**
 * Send password reset email to user
 */
export const sendPasswordResetEmail = async (userEmail, userName, resetLink) => {
  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #00ACEE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #00ACEE; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Reset Your Password</h1>
          </div>
          <div class="content">
            <p>Dear ${userName},</p>
            <p>We received a request to reset your password for your RK Industries Exports account.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center;">
              <a href="${resetLink}" class="button">Reset Password</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #00ACEE;">${resetLink}</p>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you did not request a password reset, please ignore this email and your password will remain unchanged.
            </div>
            <p>If you did not request this password reset, please contact us immediately.</p>
            <div class="footer">
              <p>Best regards,<br>RK Industries Exports Team</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: '"RK Industries Exports" <info@rkindustriesexports.com>',
      to: userEmail,
      subject: 'Reset Your Password - RK Industries Exports',
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

/**
 * Send thank you email to dealer after dealership application submission
 */
export const sendDealershipThankYouEmail = async (dealerEmail, applicationData) => {
  try {
    const { companyName, contactPersonName, country, city } = applicationData;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #00ACEE; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .message-box { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; border-left: 4px solid #00ACEE; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Thank You for Your Interest</h1>
          </div>
          <div class="content">
            <p>Dear ${contactPersonName || 'Valued Partner'},</p>
            <p>Thank you for filling out the dealership application form for R.K Industries!</p>
            <p>We have successfully received your application and our team will review it carefully.</p>
            
            <div class="message-box">
              <h3 style="margin-top: 0;">Application Details:</h3>
              <p><strong>Company Name:</strong> ${companyName || 'N/A'}</p>
              <p><strong>Country:</strong> ${country || 'N/A'}</p>
              ${city ? `<p><strong>City:</strong> ${city}</p>` : ''}
            </div>

            <p>Our team will review your application and get back to you within 3-5 business days. We appreciate your interest in becoming an authorized distributor for R.K Industries.</p>
            
            <p>If you have any questions or need to provide additional information, please feel free to contact us:</p>
            <p><strong>Email:</strong> info@rkindustriesexports.com</p>
            <p><strong>Phone:</strong> +91-8685933785</p>

            <p>We look forward to the possibility of partnering with you!</p>
            <p>Best regards,<br>R.K Industries Team</p>
          </div>
          <div class="footer">
            <p>R.K Industries<br>
            India's Trusted Manufacturer of Laboratory & Civil Testing Equipment</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"R.K Industries" <info@rkindustriesexports.com>`,
      to: dealerEmail,
      subject: `Thank You for Your Dealership Application - R.K Industries`,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Dealership thank you email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending dealership thank you email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send dealership application notification email to admin
 */
export const sendDealershipAdminNotification = async (adminEmail, applicationData) => {
  try {
    const {
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
      briefMessage,
      applicationId
    } = applicationData;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 4px; }
          .info-box { background: white; padding: 15px; margin: 15px 0; border-radius: 4px; border-left: 4px solid #dc3545; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .section { margin: 20px 0; }
          .section h3 { color: #dc3545; margin-top: 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Dealership Application Received</h1>
          </div>
          <div class="content">
            <div class="alert">
              <strong>New Application Alert!</strong> A new dealership application has been submitted and requires your review.
            </div>
            
            <div class="info-box">
              <h3 style="margin-top: 0;">Application ID: #${applicationId || 'N/A'}</h3>
              <p><strong>Submitted:</strong> ${new Date().toLocaleString('en-IN')}</p>
            </div>

            <div class="section">
              <h3>Company Information</h3>
              <p><strong>Company Name:</strong> ${companyName || 'N/A'}</p>
              <p><strong>Country:</strong> ${country || 'N/A'}</p>
              ${city ? `<p><strong>City:</strong> ${city}</p>` : ''}
            </div>

            <div class="section">
              <h3>Contact Information</h3>
              <p><strong>Contact Person:</strong> ${contactPersonName || 'N/A'}</p>
              ${designation ? `<p><strong>Designation:</strong> ${designation}</p>` : ''}
              <p><strong>Email:</strong> <a href="mailto:${email}">${email || 'N/A'}</a></p>
              <p><strong>Mobile Number:</strong> <a href="tel:${mobileNumber}">${mobileNumber || 'N/A'}</a></p>
            </div>

            <div class="section">
              <h3>Business Details</h3>
              <p><strong>Nature of Business:</strong> ${natureOfBusiness || 'N/A'}</p>
              <p><strong>Years in Business:</strong> ${yearsInBusiness || 'N/A'}</p>
              <p><strong>Warehouse Facility:</strong> ${warehouseFacility || 'N/A'}</p>
            </div>

            ${briefMessage ? `
            <div class="section">
              <h3>Additional Message</h3>
              <p style="white-space: pre-wrap; background: white; padding: 15px; border-radius: 4px;">${briefMessage}</p>
            </div>
            ` : ''}

            <p><strong>Action Required:</strong> Please review this application and respond to the applicant at your earliest convenience.</p>
            <p>You can contact the applicant directly at: <a href="mailto:${email}">${email}</a></p>
          </div>
          <div class="footer">
            <p>R.K Industries Admin Portal</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"R.K Industries" <${process.env.SMTP_USER || 'sales@rkindustriesexports.com'}>`,
      to: adminEmail,
      subject: `New Dealership Application - ${companyName || 'New Application'}`,
      html: htmlContent,
      replyTo: email // Allow admin to reply directly to the applicant
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Dealership admin notification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending dealership admin notification email:', error);
    return { success: false, error: error.message };
  }
};
