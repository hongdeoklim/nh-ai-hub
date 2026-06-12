const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY_BYPASS || env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Analyzing '농협네트웍스규정집-2026년.pdf' text in RAG DB...");
  const { data, error } = await supabase
    .from('company_documents')
    .select('chunk_index, content')
    .eq('file_name', '농협네트웍스규정집-2026년.pdf')
    .order('chunk_index', { ascending: true });

  if (error) {
    console.error("DB Query Error:", error);
    return;
  }

  console.log(`Loaded ${data.length} chunks successfully.`);

  const matches = [];
  data.forEach(row => {
    const text = row.content;
    const hasTravel = text.includes("여비") || text.includes("출장") || text.includes("지급");
    if (hasTravel) {
      matches.push(row);
    }
  });

  if (matches.length === 0) {
    console.log("\n[WARNING] None of the chunks contain the keywords '여비', '출장', or '지급'!");
    console.log("Let's dump a sample of the first chunk to inspect:");
    if (data[0]) {
      console.log("--- Chunk #0 ---");
      console.log(data[0].content);
      console.log("----------------");
    }
  } else {
    console.log(`\n=== FOUND ${matches.length} CHUNKS WITH KEYWORDS ===`);
    matches.forEach(row => {
      console.log(`- Chunk #${row.chunk_index}: ${row.content.substring(0, 200).replace(/\n/g, ' ')}...`);
    });
  }
}

run();
