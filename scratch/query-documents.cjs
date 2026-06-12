const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Read and parse .env without printing secrets to the screen
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error(".env file not found!");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const m = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
  if (m) {
    let val = m[2] || '';
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[m[1]] = val;
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
// Use service role key if available, otherwise fallback to anon key
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY_BYPASS || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key in .env!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Querying company_documents table...");
  const { data, error } = await supabase
    .from('company_documents')
    .select('file_name, chunk_index')
    .order('file_name', { ascending: true });

  if (error) {
    console.error("DB Query Error:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No documents found in the 'company_documents' table!");
    return;
  }

  const counts = {};
  data.forEach(row => {
    counts[row.file_name] = (counts[row.file_name] || 0) + 1;
  });

  console.log("\n=== FOUND DOCUMENTS IN DATABASE ===");
  Object.keys(counts).forEach(name => {
    console.log(`- ${name} (Chunks: ${counts[name]})`);
  });
  console.log(`==================================\nTotal rows: ${data.length}`);
}

run();
