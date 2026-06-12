import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import OpenAI from 'openai'

// 환경 변수 파싱
const envContent = fs.readFileSync('.env', 'utf-8')
const envs: Record<string, string> = {}
for (const line of envContent.split('\n')) {
  if (line.includes('=')) {
    const [key, ...vals] = line.split('=')
    let val = vals.join('=').trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
    envs[key.trim()] = val
  }
}

const supabaseUrl = envs.VITE_SUPABASE_URL
const supabaseServiceKey = envs.SUPABASE_SERVICE_ROLE_KEY
const openaiApiKey = envs.OPENAI_API_KEY

if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
  console.error('환경 변수 누락')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const openai = new OpenAI({ apiKey: openaiApiKey })

// 코사인 유사도 계산 함수
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function main() {
  console.log('1. 모든 raw_chunk 노드 가져오기...')
  const { data: nodes, error: nodesErr } = await supabase
    .from('nh_knowledge_nodes')
    .select('id, doc_id, chunk_index, content, embedding, source_file_name')
    .eq('node_type', 'raw_chunk')
    
  if (nodesErr || !nodes) {
    console.error('노드 조회 실패:', nodesErr)
    return
  }
  console.log(`총 ${nodes.length}개의 노드 조회 완료.`)

  // embedding 문자열을 숫자 배열로 파싱 (pgvector 반환값: "[0.123, -0.456, ...]")
  const parsedNodes = nodes.map(n => ({
    ...n,
    embeddingVec: JSON.parse(n.embedding) as number[]
  }))

  const edgesToInsert: any[] = []

  // -------------------------------------------------------------
  // Step 1: 순차적 흐름 엣지 (Sibling Edges) 생성
  // -------------------------------------------------------------
  console.log('2. 순차적 흐름 엣지(Sibling Edges) 생성 중...')
  let siblingCount = 0
  
  // doc_id 별로 그룹화
  const docGroups: Record<string, typeof parsedNodes> = {}
  for (const node of parsedNodes) {
    if (!docGroups[node.doc_id]) docGroups[node.doc_id] = []
    docGroups[node.doc_id].push(node)
  }

  for (const docId in docGroups) {
    const docNodes = docGroups[docId]
    // chunk_index 순 정렬
    docNodes.sort((a, b) => a.chunk_index - b.chunk_index)
    
    for (let i = 0; i < docNodes.length - 1; i++) {
      const current = docNodes[i]
      const next = docNodes[i + 1]
      if (next.chunk_index === current.chunk_index + 1) {
        edgesToInsert.push({
          source_node_id: current.id,
          target_node_id: next.id,
          edge_type: 'sibling',
          is_auto: true,
          metadata: { relation: 'next_chunk' }
        })
        siblingCount++
      }
    }
  }
  console.log(`-> Sibling 엣지 ${siblingCount}개 발견.`)

  // -------------------------------------------------------------
  // Step 2: 의미론적 유사도 엣지 (Semantic Edges) 생성
  // -------------------------------------------------------------
  console.log('3. 의미론적 유사도 엣지(Semantic Edges) 계산 중...')
  let semanticCount = 0
  const SIMILARITY_THRESHOLD = 0.82 // 82% 이상 유사하면 연결

  for (let i = 0; i < parsedNodes.length; i++) {
    for (let j = i + 1; j < parsedNodes.length; j++) {
      const nodeA = parsedNodes[i]
      const nodeB = parsedNodes[j]
      
      // 같은 문서는 제외 (Sibling으로 이미 충분함)
      if (nodeA.doc_id === nodeB.doc_id) continue
      
      const similarity = cosineSimilarity(nodeA.embeddingVec, nodeB.embeddingVec)
      if (similarity >= SIMILARITY_THRESHOLD) {
        // 양방향 모두 관련이 있으나, 무방향성처럼 취급하기 위해 1개만 생성하거나 2개 생성 가능.
        // 여기선 A -> B 방향 하나만 생성 (그래프 탐색시 보통 무방향으로 렌더링)
        edgesToInsert.push({
          source_node_id: nodeA.id,
          target_node_id: nodeB.id,
          edge_type: 'related',
          is_auto: true,
          metadata: { relation: 'semantic_similarity', score: similarity }
        })
        semanticCount++
      }
    }
  }
  console.log(`-> Semantic 엣지 ${semanticCount}개 발견.`)

  // -------------------------------------------------------------
  // Step 3: LLM 핵심 개념(Concept) 노드 및 엣지 생성
  // -------------------------------------------------------------
  console.log('4. LLM 기반 핵심 개념(Concept) 추출 시작...')
  
  // 비용 및 시간 방지를 위해 10개 단위로 묶어서 처리
  let conceptCount = 0
  let conceptEdgeCount = 0
  const existingConcepts: Record<string, string> = {} // keyword -> node_id

  // 이미 존재하는 concept 노드 로드
  const { data: dbConcepts } = await supabase.from('nh_knowledge_nodes').select('id, title').eq('node_type', 'concept')
  if (dbConcepts) {
    for (const c of dbConcepts) {
      existingConcepts[c.title] = c.id
    }
  }

  const batchSize = 10
  for (let i = 0; i < parsedNodes.length; i += batchSize) {
    const batch = parsedNodes.slice(i, i + batchSize)
    process.stdout.write(`\r진행률: ${i}/${parsedNodes.length} 처리 중...`)
    
    const promises = batch.map(async (node) => {
      try {
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: '주어진 업무 규정/체크리스트 텍스트에서 가장 중요한 핵심 개념(명사형 키워드) 1~3개만 추출해. 콤마(,)로 구분해서 응답해. 예: "출장비,법인카드,휴가"'
            },
            {
              role: 'user',
              content: node.content.slice(0, 500) // 비용 절감을 위해 앞부분 500자만 사용
            }
          ],
          temperature: 0.1,
        })
        const keywords = res.choices[0].message.content?.split(',').map(k => k.trim()).filter(k => k.length > 1 && k.length < 15) || []
        return { node, keywords }
      } catch (e) {
        return { node, keywords: [] }
      }
    })
    
    const results = await Promise.all(promises)
    
    for (const { node, keywords } of results) {
      for (const keyword of keywords) {
        let conceptId = existingConcepts[keyword]
        if (!conceptId) {
          // 새 컨셉 노드 생성
          conceptId = crypto.randomUUID()
          existingConcepts[keyword] = conceptId
          conceptCount++
          
          // 임베딩(0으로 채우거나 나중에 계산, 여기선 생략하고 null이 안되니 임시배열)
          const dummyEmbedding = new Array(1536).fill(0)
          
          const { error: conceptErr } = await supabase.from('nh_knowledge_nodes').insert({
            id: conceptId,
            title: keyword,
            slug: `concept-${Date.now()}-${Math.floor(Math.random()*100000)}`,
            node_type: 'concept',
            content: `핵심 개념: ${keyword}`,
            embedding: `[${dummyEmbedding.join(',')}]`,
            visibility: 'public',
            owner_id: null,
            doc_id: node.doc_id,
            chunk_index: -(Math.floor(Math.random() * 1000000) + 1)
          })
          if (conceptErr) console.error('Concept Insert Error:', conceptErr)
        }
        
        // 원본 노드 -> Concept 노드로 엣지
        edgesToInsert.push({
          source_node_id: node.id,
          target_node_id: conceptId,
          edge_type: 'related',
          is_auto: true,
          metadata: { relation: 'extracted_concept', keyword }
        })
        conceptEdgeCount++
      }
    }
  }
  console.log(`\r진행률: ${parsedNodes.length}/${parsedNodes.length} 완료!          `)
  console.log(`-> 새로 생성된 Concept 노드: ${conceptCount}개`)
  console.log(`-> Concept 연결 엣지: ${conceptEdgeCount}개`)

  // -------------------------------------------------------------
  // Step 4: 엣지 DB에 일괄 Insert
  // -------------------------------------------------------------
  console.log(`5. 총 ${edgesToInsert.length}개의 엣지를 DB에 삽입합니다...`)
  
  // 기존 자동 생성 엣지 모두 삭제 (초기화)
  await supabase.from('nh_knowledge_edges').delete().eq('is_auto', true)

  for (let i = 0; i < edgesToInsert.length; i += 1000) {
    const chunk = edgesToInsert.slice(i, i + 1000)
    const { error: insertErr } = await supabase.from('nh_knowledge_edges').insert(chunk)
    if (insertErr) {
      console.error(`엣지 삽입 에러 (batch ${i}):`, insertErr)
    }
  }
  
  console.log('🎉 모든 엣지 생성이 완료되었습니다!')
}

main().catch(console.error)
