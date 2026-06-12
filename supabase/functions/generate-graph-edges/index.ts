/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import OpenAI from "npm:openai@4.86.1";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

// 코사인 유사도 계산 함수
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS Preflight 처리
  if (req.method === "OPTIONS") {
    return handleCorsPreflight(req);
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method Not Allowed. Only POST requests are accepted." },
      400,
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    return jsonResponse({ error: "Missing environment variables." }, 500);
  }

  // 요청 본문에서 doc_id 파싱
  let body: { doc_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const docId = body.doc_id;
  if (!docId) {
    return jsonResponse({ error: "doc_id is required." }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    // 1. 해당 doc_id의 raw_chunk 노드 가져오기
    const { data: targetNodes, error: nodesErr } = await supabase
      .from("nh_knowledge_nodes")
      .select("id, doc_id, chunk_index, content, embedding, source_file_name")
      .eq("node_type", "raw_chunk")
      .eq("doc_id", docId)
      .order("chunk_index", { ascending: true });

    if (nodesErr || !targetNodes || targetNodes.length === 0) {
      return jsonResponse({ message: "No raw_chunk nodes found for doc_id", docId }, 200);
    }

    const parsedTargetNodes = targetNodes.map(n => ({
      ...n,
      embeddingVec: JSON.parse(n.embedding) as number[]
    }));

    const edgesToInsert: any[] = [];

    // 2. Sibling Edges 생성 (같은 문서 내 순차적 연결)
    let siblingCount = 0;
    for (let i = 0; i < parsedTargetNodes.length - 1; i++) {
      const current = parsedTargetNodes[i];
      const next = parsedTargetNodes[i + 1];
      if (next.chunk_index === current.chunk_index + 1) {
        edgesToInsert.push({
          source_node_id: current.id,
          target_node_id: next.id,
          edge_type: "sibling",
          is_auto: true,
          metadata: { relation: "next_chunk" }
        });
        siblingCount++;
      }
    }

    // 3. Semantic Edges 생성 (다른 문서들과 비교)
    let semanticCount = 0;
    const SIMILARITY_THRESHOLD = 0.82;
    
    // 전체 raw_chunk 노드(본인 제외) 가져오기
    // 실제로는 너무 많으면 메모리 문제가 될 수 있으나, 현재 수백-수천 개 수준에서는 문제 없음
    const { data: allNodes } = await supabase
      .from("nh_knowledge_nodes")
      .select("id, embedding, doc_id")
      .eq("node_type", "raw_chunk")
      .neq("doc_id", docId);

    if (allNodes && allNodes.length > 0) {
      const parsedAllNodes = allNodes.map(n => ({
        ...n,
        embeddingVec: JSON.parse(n.embedding) as number[]
      }));

      for (const tNode of parsedTargetNodes) {
        for (const oNode of parsedAllNodes) {
          const similarity = cosineSimilarity(tNode.embeddingVec, oNode.embeddingVec);
          if (similarity >= SIMILARITY_THRESHOLD) {
            edgesToInsert.push({
              source_node_id: tNode.id,
              target_node_id: oNode.id,
              edge_type: "related",
              is_auto: true,
              metadata: { relation: "semantic_similarity", score: similarity }
            });
            semanticCount++;
          }
        }
      }
    }

    // 4. LLM 기반 핵심 개념(Concept) 노드 및 엣지 생성
    let conceptCount = 0;
    let conceptEdgeCount = 0;
    const existingConcepts: Record<string, string> = {};

    const { data: dbConcepts } = await supabase.from("nh_knowledge_nodes").select("id, title").eq("node_type", "concept");
    if (dbConcepts) {
      for (const c of dbConcepts) {
        existingConcepts[c.title] = c.id;
      }
    }

    // OpenAI 비용과 Edge Function 시간 제한을 고려하여, 한 번에 다량 호출을 병렬 처리
    const promises = parsedTargetNodes.map(async (node) => {
      try {
        const res = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "주어진 업무 규정/체크리스트 텍스트에서 가장 중요한 핵심 개념(명사형 키워드) 1~3개만 추출해. 콤마(,)로 구분해서 응답해. 예: \"출장비,법인카드,휴가\""
            },
            {
              role: "user",
              content: node.content.slice(0, 500)
            }
          ],
          temperature: 0.1,
        });
        const keywords = res.choices[0].message.content?.split(",")
          .map(k => k.replace(/[\*\_\`\#]/g, '').replace(/^-+\s*/, '').trim())
          .filter(k => k.length > 1 && k.length < 15) || [];
        return { node, keywords };
      } catch (e) {
        console.error("OpenAI Error:", e);
        return { node, keywords: [] };
      }
    });

    const results = await Promise.all(promises);

    for (const { node, keywords } of results) {
      for (const keyword of keywords) {
        let conceptId = existingConcepts[keyword];
        if (!conceptId) {
          conceptId = crypto.randomUUID();
          existingConcepts[keyword] = conceptId;
          conceptCount++;
          
          const dummyEmbedding = new Array(1536).fill(0);
          
          const { error: conceptErr } = await supabase.from("nh_knowledge_nodes").insert({
            id: conceptId,
            title: keyword,
            slug: `concept-${Date.now()}-${Math.floor(Math.random()*100000)}`,
            node_type: "concept",
            content: `핵심 개념: ${keyword}`,
            embedding: `[${dummyEmbedding.join(",")}]`,
            visibility: "public",
            owner_id: null,
            doc_id: node.doc_id,
            chunk_index: -(Math.floor(Math.random() * 1000000) + 1)
          });
          if (conceptErr) console.error("Concept Insert Error:", conceptErr);
        }
        
        edgesToInsert.push({
          source_node_id: node.id,
          target_node_id: conceptId,
          edge_type: "related",
          is_auto: true,
          metadata: { relation: "extracted_concept", keyword }
        });
        conceptEdgeCount++;
      }
    }

    // 5. 엣지 일괄 Insert
    if (edgesToInsert.length > 0) {
      for (let i = 0; i < edgesToInsert.length; i += 1000) {
        const chunk = edgesToInsert.slice(i, i + 1000);
        const { error: insertErr } = await supabase.from("nh_knowledge_edges").insert(chunk);
        if (insertErr) {
          console.error(`Edge insert error (batch ${i}):`, insertErr);
        }
      }
    }

    return jsonResponse({
      ok: true,
      docId,
      siblingCount,
      semanticCount,
      conceptCount,
      conceptEdgeCount,
      totalEdgesInserted: edgesToInsert.length
    });

  } catch (err) {
    console.error("Generate Edges Error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
