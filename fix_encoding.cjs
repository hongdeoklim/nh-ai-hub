const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('ai_models').update({
    hint: '사내 RAG 시스템을 통해 문서를 기반으로 정확한 답변을 제공합니다.',
    description: '사내 RAG 시스템을 통해 문서를 기반으로 정확한 답변을 제공합니다.'
  }).eq('api_id', 'dify-ax');
  console.log('Result:', error || 'Success');
}
run();
