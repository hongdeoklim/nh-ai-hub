const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) { console.error('No supabase credentials'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('ai_models').upsert({
    api_id: 'dify-ax',
    model_id: 'dify-ax',
    model_name: 'Dify AI',
    cost_info: '보통',
    provider: 'google',
    model_type: 'text',
    display_name: 'Dify Chat (RAG)',
    hint: '?щ궡 RAG ?쒖뒪?쒖쓣 ?듯빐 臾몄꽌瑜?湲곕컲?쇰줈 ?뺥솗???듬????쒓났?⑸땲??',
    is_active: true,
    sort_order: 60
  }, { onConflict: 'api_id' });
  console.log('Result:', error || 'Success');
}
run();
