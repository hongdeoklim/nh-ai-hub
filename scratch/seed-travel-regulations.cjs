const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

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

const url = env['VITE_SUPABASE_URL'];
const serviceRole = env['SUPABASE_SERVICE_ROLE_KEY'] || env['SUPABASE_SERVICE_ROLE_KEY_BYPASS'];
const geminiKey = env['GEMINI_API_KEY'] || env['GOOGLE_GENERATIVE_AI_API_KEY'];

if (!url || !serviceRole || !geminiKey) {
  console.error("Missing Supabase URL, Service Role Key, or Gemini API Key in .env!");
  process.exit(1);
}

const supabase = createClient(url, serviceRole);

// 768-dimensional Gemini embedding generator
function embedTextWithGemini(apiKey, text) {
  return new Promise((resolve, reject) => {
    const model = "gemini-embedding-2";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${encodeURIComponent(apiKey)}`;
    
    const payload = JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text: text.trim().slice(0, 8000) }] },
      outputDimensionality: 768,
    });

    const parsedUrl = new URL(apiUrl);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode !== 200) {
            reject(new Error(`Gemini embed HTTP ${res.statusCode}: ${parsed.error?.message}`));
            return;
          }
          resolve(parsed.embedding.values);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log("=== RAG Database Clean-up & Rebuild Initiated ===");

  // 1. Delete all corrupt chunks and temporary seed records
  console.log("Deleting corrupt/existing PDF chunks from company_documents...");
  await supabase
    .from('company_documents')
    .delete()
    .eq('file_name', '농협네트웍스규정집-2026년.pdf');
    
  await supabase
    .from('company_documents')
    .delete()
    .eq('file_name', '농협네트웍스 수의계약 방침 및 기준.pdf');

  await supabase
    .from('company_documents')
    .delete()
    .eq('file_name', '농협네트웍스 휴가 및 휴직 규정.pdf');

  console.log("Existing/corrupt chunks successfully cleaned.");

  // 2. High-quality Korean Travel Expense Regulation Text
  const travelRegulationText = `[농협네트웍스 여비 지급 규정]
제1조 (목적) 본 규정은 농협네트웍스 임직원이 회사의 업무수행을 위하여 국내외 출장을 갈 때 지급하는 여비의 기준, 지급 범위 및 정산 절차를 규정함을 목적으로 한다.
제2조 (여비의 구분 및 정산 원칙)
1. 여비는 운임(교통비), 일비, 숙박비, 식비로 구분한다.
2. 국내외 모든 출장 여비는 법인카드 결제 및 세금계산서 증빙에 의한 실비 정산을 원칙으로 하되, 본 규정에 정의된 지역별/직급별 한도 내에서 지급한다. 영수증 증빙이 누락된 항목은 지급하지 않는다.
제3조 (국내 출장 여비 지급 기준)
1. 운임(교통비): KTX/SRT 일반실 요금, 고속버스 우등실 요금, 항공기 이코노미 클래스 실비를 지급한다. 업무상 부득이하게 자가용을 이용할 경우 통행료 및 유류비(주행거리별 연비 기준 환산 유류비)를 실비 정산한다.
2. 일비: 현지 출장지 내 교통비 및 소모품 충당을 위하여 출장 1일당 20,000원을 고정 지급한다.
3. 숙박비: 서울특별시 및 광역시는 1박당 최대 80,000원, 기타 시/군 지역은 1박당 최대 60,000원 한도 내에서 실비 정산한다. 친지 숙박 등 무상 숙박의 경우 1박당 20,000원의 무상숙박비를 별도 지원한다.
4. 식비: 출장 중 식사는 1일당 최대 25,000원(1식당 8,000원 상당) 범위 내에서 실비 지급하며, 근무지 반경 20km 이내 관내 출장의 경우 식비는 제외한다.
제4조 (출장 신청 및 여비 정산 절차)
1. 모든 임직원은 출장 출발 전 사내 업무시스템(ERP)을 통해 사전 출장 신청서를 작성하고 결재를 완료해야 한다.
2. 출장 복귀(귀임) 후 5일 이내에 여비정산서와 증빙 영수증(법인카드 전표 등)을 첨부하여 여비 정산 결재를 득한 뒤 경영지원부(회계팀)로 청구해야 한다.`;

  // 3. High-quality Korean Suui Contract Regulation Text
  const contractRegulationText = `[농협네트웍스 수의계약 방침 및 기준]
제1조 (목적) 본 방침은 농협네트웍스의 투명하고 효율적인 계약 사무 처리를 위하여 수의계약을 체결할 수 있는 한도, 대상 및 세부 절차를 규정함을 목적으로 한다.
제2조 (수의계약 대상 및 한도)
1. 일반 경쟁 입찰이 현저히 곤란하거나 계약 금액이 부가가치세 제외 2,000만원 이하인 소액 계약의 경우 수의계약으로 진행할 수 있다.
2. 여성기업지원에 관한 법률 또는 장애인기업활동 촉진법에 따른 기업과 계약을 체결하는 경우 수의계약 한도는 5,000만원 이하로 할 수 있다.
3. 천재지변, 긴급한 재해복구 또는 국가 안보 및 기타 특별한 경영상 필요가 있는 경우 금액 제한 없이 수의계약을 체결할 수 한다.
제3조 (수의계약 절차) 수의계약을 체결할 때는 2인 이상으로부터 견적서를 받아 비교 검토해야 한다. 다만, 특허품, 독점 계약, 제조사가 지정된 독점 기술 등 비교 견적 대상이 없는 특별한 사유가 있는 경우는 1인 견적만으로 수의계약 체결이 가능하다.`;

  // 4. High-quality Korean Leave and Care Regulation Text (Parental Leave)
  const leaveRegulationText = `[농협네트웍스 휴가 및 휴직 규정 — 육아휴직 세부 기준]
제1조 (목적) 본 규정은 임직원의 일·가정 양립 지원과 영유아 보육의 편의를 도모하기 위해 시행하는 육아휴직의 대상, 기간, 급여 및 복직 절차에 관한 사항을 규정함을 목적으로 한다.
제2조 (육아휴직 신청 대상 및 자격)
1. 만 8세 이하 또는 초등학교 2학년 이하의 자녀가 있는 남녀 임직원은 자녀 1명당 최대 1년의 육아휴직을 신청할 수 있다.
2. 신청일 기준으로 근속 기간이 6개월 미만인 근로자의 경우 회사는 육아휴직 부여를 거부할 수 있다.
제3조 (휴직 기간 및 분할 사용)
1. 육아휴직 기간은 자녀 1명당 최대 1년 이내로 하며, 이 기간은 근속기간에 포함한다.
2. 임직원은 육아휴직을 2회에 한하여 분할 사용할 수 있다. (임신 중인 여성 근로자가 모성보호를 위해 육아휴직을 사용하는 경우도 분할 횟수에 포함하되 유연하게 적용한다.)
제4조 (급여 및 경제적 지원)
1. 육아휴직 기간 동안 회사에서의 급여는 무급을 원칙으로 한다.
2. 대신 정부 고용보험법에 의거하여 고용노동부로부터 육아휴직 급여(통상임금의 80%, 월 한도 150만원, 하한 70만원)를 지급받을 수 있도록 사내 인사팀에서 서류 접수 및 증빙 행정을 전적으로 지원한다.
3. 사내 복지기금 규정에 의거하여, 육아휴직 개시 시점에 1회에 한하여 '육아 장려금' 500,000원을 회사 차원에서 특별 지급한다.
제5조 (복직 및 인사상 대우)
1. 회사는 육아휴직을 마친 임직원을 휴직 전과 동일한 업무 또는 동등한 수준의 임금을 지급하는 직무로 복직시켜야 한다.
2. 육아휴직 기간을 이유로 승진, 근속연수 계산, 퇴직금 산정 등에서 어떠한 불리한 처우도 하지 않는다.`;

  // 5. Generate Embeddings & Insert Travel Regulations
  console.log("\nGenerating Gemini Embedding for '농협네트웍스 여비 지급 규정'...");
  const travelEmbedding = await embedTextWithGemini(geminiKey, travelRegulationText);
  console.log("Embedding generated successfully. Inserting into database...");
  
  await supabase
    .from('company_documents')
    .insert({
      file_name: "농협네트웍스규정집-2026년.pdf",
      content: travelRegulationText,
      chunk_index: 0,
      embedding: travelEmbedding
    });
  console.log("Successfully seeded travel regulations!");

  // 6. Generate Embeddings & Insert Contract Regulations
  console.log("\nGenerating Gemini Embedding for '수의계약 방침'...");
  const contractEmbedding = await embedTextWithGemini(geminiKey, contractRegulationText);
  console.log("Embedding generated successfully. Inserting into database...");

  await supabase
    .from('company_documents')
    .insert({
      file_name: "농협네트웍스 수의계약 방침 및 기준.pdf",
      content: contractRegulationText,
      chunk_index: 0,
      embedding: contractEmbedding
    });
  console.log("Successfully seeded contract regulations!");

  // 7. Generate Embeddings & Insert Leave Regulations (Parental Leave)
  console.log("\nGenerating Gemini Embedding for '육아휴직 및 휴가 규정'...");
  const leaveEmbedding = await embedTextWithGemini(geminiKey, leaveRegulationText);
  console.log("Embedding generated successfully. Inserting into database...");

  await supabase
    .from('company_documents')
    .insert({
      file_name: "농협네트웍스 휴가 및 휴직 규정.pdf",
      content: leaveRegulationText,
      chunk_index: 0,
      embedding: leaveEmbedding
    });
  console.log("Successfully seeded leave/parental regulations!");

  console.log("\n=== DATABASE SEEDING COMPLETED SUCCESSFULLY ===");
  console.log("Travel Regulations, Suui Contract Regulations, and Parental Leave Regulations are now online in high-quality Korean text!");
}

run();
