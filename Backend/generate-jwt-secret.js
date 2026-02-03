// Quick script to generate a JWT secret
// Run: node generate-jwt-secret.js

import crypto from 'crypto';

const secret = crypto.randomBytes(64).toString('hex');
console.log('\n=== JWT Secret Generated ===');
console.log(secret);
console.log('\nCopy this to your .env file as JWT_SECRET\n');

