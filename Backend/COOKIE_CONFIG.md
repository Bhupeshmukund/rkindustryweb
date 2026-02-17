# Cookie Configuration Guide

## Current Status
The application currently uses `localStorage` for authentication tokens, not cookies. However, if you need to set cookies in the future or are experiencing cookie warnings from third-party services, follow these guidelines.

## Cookie Security Best Practices

### Required Attributes for Secure Cookies

1. **SameSite Attribute**: Prevents CSRF attacks
   - `SameSite=Strict`: Cookie only sent in first-party context
   - `SameSite=Lax`: Cookie sent with top-level navigation (default in modern browsers)
   - `SameSite=None`: Cookie sent in cross-site context (requires Secure flag)

2. **Secure Flag**: Required for HTTPS sites and SameSite=None
   - Ensures cookies are only sent over HTTPS connections

3. **HttpOnly Flag**: Prevents JavaScript access
   - Protects against XSS attacks
   - Recommended for authentication cookies

4. **Domain and Path**: Restrict cookie scope
   - Only set domain if necessary for subdomains
   - Use specific paths to limit cookie scope

## Example Cookie Configuration

If you need to set cookies in Express, use this pattern:

```javascript
res.cookie('cookieName', 'cookieValue', {
  httpOnly: true,        // Prevents JavaScript access
  secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
  sameSite: 'strict',   // or 'lax' or 'none' (none requires secure)
  maxAge: 24 * 60 * 60 * 1000,  // 24 hours
  path: '/'
});
```

## Common Cookie Issues in Chrome DevTools

1. **Missing SameSite Attribute**
   - Warning: "This Set-Cookie was blocked because it had the 'SameSite=None' attribute but did not have the 'Secure' attribute"
   - Solution: Add `Secure` flag when using `SameSite=None`

2. **Insecure Cookies on HTTPS**
   - Warning: "This Set-Cookie was blocked because it was sent from a secure origin over an insecure connection"
   - Solution: Add `Secure` flag for all cookies on HTTPS sites

3. **Cross-Site Cookie Restrictions**
   - Modern browsers restrict third-party cookies
   - Solution: Use `SameSite=None; Secure` for cross-site cookies (if necessary)

## Checking Cookie Issues

1. Open Chrome DevTools (F12)
2. Go to the "Issues" panel
3. Look for cookie-related warnings
4. Check the "Application" tab > "Cookies" to see all cookies
5. Review the "Network" tab to see Set-Cookie headers in responses

## Third-Party Cookie Issues

If cookie warnings are from third-party services (payment gateways, analytics, etc.):
- These are typically informational warnings
- The services should handle cookie configuration
- Contact the service provider if issues persist

## Current Application

Since this application uses `localStorage` for authentication:
- No backend cookie configuration is needed
- Cookie warnings may be from:
  - Browser extensions
  - Third-party services (Razorpay, analytics, etc.)
  - Browser security features

These warnings are typically informational and don't affect functionality.
