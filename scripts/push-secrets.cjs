const fs = require('fs');
const { execSync } = require('child_process');

require('dotenv').config();

const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
if (key) {
  try {
    execSync(`npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY='${key}'`, { stdio: 'inherit' });
    console.log("Secret pushed successfully");
  } catch (e) {
    console.error("Failed to push", e);
  }
} else {
  console.error("Key not found in .env");
}
