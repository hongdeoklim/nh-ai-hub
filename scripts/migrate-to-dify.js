/**
 * Dify 데이터셋 일괄 이관(마이그레이션) 스크립트 (ESM 버전)
 * 
 * 기존 Supabase 'knowledge_base' 테이블의 문서를 읽고,
 * Supabase Storage에서 파일을 다운로드 받아 Dify API로 업로드합니다.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const DIFY_API_URL = process.env.DIFY_API_URL || process.env.VITE_DIFY_API_URL;
const DIFY_DATASET_API_KEY = process.env.DIFY_DATASET_API_KEY || process.env.VITE_DIFY_DATASET_API_KEY;
const DIFY_DATASET_ID = process.env.DIFY_DATASET_ID || process.env.VITE_DIFY_DATASET_ID || '기본데이터셋ID';

if (!SUPABASE_URL || !SUPABASE_KEY || !DIFY_API_URL || !DIFY_DATASET_API_KEY) {
  console.error("❌ 필수 환경 변수가 누락되었습니다. (.env 확인)");
  console.error(`- SUPABASE_URL: ${!!SUPABASE_URL}`);
  console.error(`- SUPABASE_KEY: ${!!SUPABASE_KEY}`);
  console.error(`- DIFY_API_URL: ${!!DIFY_API_URL}`);
  console.error(`- DIFY_DATASET_API_KEY: ${!!DIFY_DATASET_API_KEY}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function migrateDocuments() {
  console.log("🚀 Supabase에서 문서 목록을 불러옵니다...");

  const { data: rows, error } = await supabase
    .from('knowledge_base')
    .select('*')
    .is('deleted_at', null);

  if (error) {
    console.error("❌ DB 조회 실패:", error);
    return;
  }

  console.log(`✅ 총 ${rows.length}개의 문서를 마이그레이션 합니다.\n`);

  for (const row of rows) {
    console.log(`[진행중] ${row.file_name} 처리 시작...`);
    
    // 1. Storage에서 파일 다운로드
    let objectPath = row.file_url;
    if (row.file_url.includes('kb-storage:knowledge-documents/')) {
        objectPath = row.file_url.split('kb-storage:knowledge-documents/')[1];
    } else {
        console.warn(`⚠️ 알 수 없는 경로 형식. 건너뜁니다: ${row.file_url}`);
        continue;
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('knowledge-documents')
      .download(objectPath);

    if (downloadError || !fileData) {
      console.error(`❌ 파일 다운로드 실패 (${row.file_name}):`, downloadError);
      continue;
    }

    // 파일 로컬 저장 (임시)
    // 현재 작업 디렉토리(process.cwd()) 기준
    const tempFilePath = path.join(process.cwd(), row.file_name);
    const arrayBuffer = await fileData.arrayBuffer();
    fs.writeFileSync(tempFilePath, Buffer.from(arrayBuffer));

    // 2. Dify Dataset API로 파일 전송 (create_by_file)
    const endpoint = `${DIFY_API_URL.replace(/\/$/, '')}/v1/datasets/${DIFY_DATASET_ID}/document/create_by_file`;

    const formData = new FormData();
    formData.append('data', JSON.stringify({
        indexing_technique: 'high_quality',
        process_rule: {
            rules: {
                pre_processing_rules: [
                    { id: 'remove_extra_spaces', enabled: true },
                    { id: 'remove_urls_emails', enabled: false }
                ],
                segmentation: { separator: '\n', max_tokens: 500 }
            },
            mode: 'custom'
        }
    }));
    formData.append('file', fs.createReadStream(tempFilePath));

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIFY_DATASET_API_KEY}`,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error(`❌ Dify 업로드 실패 (${row.file_name}): HTTP ${response.status}`, errBody);
        } else {
            const result = await response.json();
            console.log(`✅ Dify 업로드 성공 (${row.file_name}): DocID = ${result.document?.id || '생성됨'}`);
        }
    } catch (e) {
        console.error(`❌ Dify 업로드 통신 에러 (${row.file_name}):`, e.message);
    } finally {
        // 임시 파일 삭제
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
  }

  console.log("\n🎉 마이그레이션이 완료되었습니다.");
}

migrateDocuments();
