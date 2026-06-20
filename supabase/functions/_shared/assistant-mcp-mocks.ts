import { z } from "npm:zod@4.4.3"

export const ASSISTANT_MCP_MOCK_DEFINITIONS = {
  // Gmail
  SEND_GMAIL_DRAFT: {
    name: "send_gmail_draft",
    description: "Gmail 임시보관함에 메일 초안을 작성합니다.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  // Calendar
  GET_CALENDAR_EVENTS: {
    name: "get_calendar_events",
    description: "구글 캘린더에서 특정 기간의 일정을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["startDate", "endDate"],
    },
  },
  CREATE_CALENDAR_EVENT: {
    name: "create_calendar_event",
    description: "구글 캘린더에 새로운 일정을 등록합니다.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM" },
        attendees: { type: "array", items: { type: "string" } },
      },
      required: ["title", "date", "time"],
    },
  },
  // Notion
  CREATE_NOTION_PAGE: {
    name: "create_notion_page",
    description: "Notion 데이터베이스에 새로운 페이지(문서)를 생성합니다.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
  SEARCH_NOTION_PAGES: {
    name: "search_notion_pages",
    description: "Notion 워크스페이스 내의 문서를 검색합니다.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  // Sheets
  APPEND_GOOGLE_SPREADSHEET: {
    name: "append_google_spreadsheet",
    description: "구글 시트의 마지막 행에 데이터를 추가합니다.",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: { type: "string" },
        sheetName: { type: "string" },
        values: { type: "array", items: { type: "string" } },
      },
      required: ["spreadsheetId", "sheetName", "values"],
    },
  },
  // Design
  GENERATE_GRAPHIC_IMAGE: {
    name: "generate_graphic_image",
    description: "디자인 컨셉을 기반으로 고품질 그래픽 이미지를 생성합니다.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        style: { type: "string", enum: ["realistic", "illustration", "3d", "vector"] },
      },
      required: ["prompt"],
    },
  },
  // Video
  GENERATE_VIDEO_DRAFT: {
    name: "generate_video_draft",
    description: "텍스트 대본을 기반으로 짧은 숏폼 영상을 렌더링합니다.",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string" },
        mood: { type: "string" },
      },
      required: ["script"],
    },
  },
  // Calendly
  CREATE_CALENDLY_EVENT: {
    name: "create_calendly_event",
    description: "캘린들리를 통해 미팅 초대장을 발송합니다.",
    inputSchema: {
      type: "object",
      properties: {
        inviteeEmail: { type: "string" },
        eventDuration: { type: "number", description: "minutes" },
      },
      required: ["inviteeEmail", "eventDuration"],
    },
  },
  // Research
  FETCH_DEEP_RESEARCH_REPORT: {
    name: "fetch_deep_research_report",
    description: "특정 주제에 대한 심층 리서치 에이전트를 가동하고 보고서를 받습니다.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string" },
      },
      required: ["topic"],
    },
  },
  // Zapier
  TRIGGER_ZAPIER_WEBHOOK: {
    name: "trigger_zapier_webhook",
    description: "Zapier의 자동화 워크플로우(Zap)를 실행하는 웹훅을 트리거합니다.",
    inputSchema: {
      type: "object",
      properties: {
        zapName: { type: "string" },
        payload: { type: "object", additionalProperties: true },
      },
      required: ["zapName", "payload"],
    },
  },
  // Ads
  ANALYZE_AD_PERFORMANCE: {
    name: "analyze_ad_performance",
    description: "광고 매체(Meta, Google)의 성과 데이터를 분석합니다.",
    inputSchema: {
      type: "object",
      properties: {
        campaignName: { type: "string" },
      },
      required: ["campaignName"],
    },
  },
  // YouTube
  FETCH_YOUTUBE_TRANSCRIPT: {
    name: "fetch_youtube_transcript",
    description: "유튜브 영상의 자막(대본)을 추출합니다.",
    inputSchema: {
      type: "object",
      properties: {
        videoUrl: { type: "string" },
      },
      required: ["videoUrl"],
    },
  },
  SEARCH_YOUTUBE_VIDEOS: {
    name: "search_youtube_videos",
    description: "유튜브에서 특정 키워드로 영상을 검색합니다.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
      },
      required: ["keyword"],
    },
  },
  // Notion AI
  ASK_NOTION_AI: {
    name: "ask_notion_ai",
    description: "Notion Q&A AI에게 사내 문서 기반 질문을 합니다.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
      },
      required: ["question"],
    },
  },
  // Forms
  CREATE_GOOGLE_FORM: {
    name: "create_google_form",
    description: "Google Forms 설문지를 자동으로 생성합니다.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        questions: { type: "array", items: { type: "string" } },
      },
      required: ["title", "questions"],
    },
  },
  // Content
  WRITE_BLOG_POST: {
    name: "write_blog_post",
    description: "블로그 등 CMS 플랫폼에 직접 초안을 업로드합니다.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        bodyHtml: { type: "string" },
      },
      required: ["title", "bodyHtml"],
    },
  },
  // Heygen
  GENERATE_HEYGEN_AVATAR_VIDEO: {
    name: "generate_heygen_avatar_video",
    description: "Heygen API를 사용해 AI 아바타가 말하는 영상을 렌더링합니다.",
    inputSchema: {
      type: "object",
      properties: {
        avatarId: { type: "string" },
        scriptText: { type: "string" },
      },
      required: ["scriptText"],
    },
  },
  // Discord
  SEND_DISCORD_MESSAGE: {
    name: "send_discord_message",
    description: "디스코드 특정 채널에 메시지나 공지를 전송합니다.",
    inputSchema: {
      type: "object",
      properties: {
        channelName: { type: "string" },
        message: { type: "string" },
      },
      required: ["channelName", "message"],
    },
  },
  // Figma
  READ_FIGMA_FILE: {
    name: "read_figma_file",
    description: "Figma 파일의 구조와 디자인 토큰 정보를 읽어옵니다.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: { type: "string" },
      },
      required: ["fileKey"],
    },
  },
  // ClickUp
  QUERY_CLICKUP_TASKS: {
    name: "query_clickup_tasks",
    description: "ClickUp 워크스페이스에서 현재 진행 중인 태스크 상태를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        listId: { type: "string" },
      },
      required: ["listId"],
    },
  },
  // Slack
  SEND_SLACK_MESSAGE: {
    name: "send_slack_message",
    description: "Slack 채널이나 특정 사용자에게 메시지를 보냅니다.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string" },
        text: { type: "string" },
      },
      required: ["channel", "text"],
    },
  },
  READ_SLACK_THREAD: {
    name: "read_slack_thread",
    description: "Slack 특정 스레드의 대화 기록을 요약하기 위해 읽어옵니다.",
    inputSchema: {
      type: "object",
      properties: {
        threadUrl: { type: "string" },
      },
      required: ["threadUrl"],
    },
  },
} as const;

// 실행기 (Mock Executors)
export const ASSISTANT_MCP_MOCK_EXECUTORS = {
  send_gmail_draft: async (args: { to: string; subject: string; body: string }) => {
    return { success: true, message: `[Mock] ${args.to}로 메일 초안을 성공적으로 저장했습니다.` };
  },
  get_calendar_events: async (args: { startDate: string; endDate: string }) => {
    return {
      success: true,
      events: [
        { title: "위클리 싱크 미팅", date: args.startDate, time: "10:00" },
        { title: "고객사 미팅", date: args.endDate, time: "14:00" },
      ],
    };
  },
  create_calendar_event: async (args: { title: string; date: string; time: string; attendees?: string[] }) => {
    return { success: true, message: `[Mock] ${args.date} ${args.time}에 '${args.title}' 일정을 등록했습니다.` };
  },
  create_notion_page: async (args: { title: string; content: string }) => {
    return { success: true, pageUrl: "https://notion.so/mock-page-id", message: `[Mock] 노션 페이지 '${args.title}' 생성 완료` };
  },
  search_notion_pages: async (args: { query: string }) => {
    return { success: true, results: [{ title: `${args.query} 관련 회의록`, url: "https://notion.so/mock-1" }] };
  },
  append_google_spreadsheet: async (args: { spreadsheetId: string; sheetName: string; values: string[] }) => {
    return { success: true, message: `[Mock] 시트에 데이터 [${args.values.join(", ")}] 추가 성공` };
  },
  generate_graphic_image: async (args: { prompt: string; style?: string }) => {
    return { success: true, imageUrl: "https://via.placeholder.com/800x600?text=Mock+Graphic", message: `[Mock] ${args.style || '기본'} 스타일의 이미지를 생성했습니다.` };
  },
  generate_video_draft: async (args: { script: string; mood?: string }) => {
    return { success: true, videoUrl: "https://example.com/mock-video.mp4", message: `[Mock] 대본을 기반으로 영상 렌더링 시작됨.` };
  },
  create_calendly_event: async (args: { inviteeEmail: string; eventDuration: number }) => {
    return { success: true, inviteLink: "https://calendly.com/mock-link", message: `[Mock] ${args.inviteeEmail}에게 미팅 초대장을 보냈습니다.` };
  },
  fetch_deep_research_report: async (args: { topic: string }) => {
    return { success: true, report: `[Mock 심층 리서치 보고서]\n주제: ${args.topic}\n분석: 해당 분야의 시장 규모는 연평균 15% 성장 중이며...` };
  },
  trigger_zapier_webhook: async (args: { zapName: string; payload: any }) => {
    return { success: true, message: `[Mock] Zapier 워크플로우 '${args.zapName}' 트리거 완료.` };
  },
  analyze_ad_performance: async (args: { campaignName: string }) => {
    return { success: true, cpa: "$12.50", roas: "240%", message: `[Mock] '${args.campaignName}' 캠페인은 현재 양호한 성과를 보입니다.` };
  },
  fetch_youtube_transcript: async (args: { videoUrl: string }) => {
    return { success: true, transcript: `[Mock 자막] 안녕하세요, 오늘은 ${args.videoUrl} 에 대해 다뤄보겠습니다. 첫 번째로...` };
  },
  search_youtube_videos: async (args: { keyword: string }) => {
    return { success: true, videos: [{ title: `${args.keyword} 튜토리얼 1편`, url: "https://youtube.com/watch?v=mock" }] };
  },
  ask_notion_ai: async (args: { question: string }) => {
    return { success: true, answer: `[Mock Notion AI 응답] 질문하신 '${args.question}'에 대해 사내 문서에서는 다음과 같이 규정하고 있습니다...` };
  },
  create_google_form: async (args: { title: string; questions: string[] }) => {
    return { success: true, formUrl: "https://forms.google.com/mock", message: `[Mock] 설문지 '${args.title}' 생성 완료` };
  },
  write_blog_post: async (args: { title: string; bodyHtml: string }) => {
    return { success: true, postUrl: "https://blog.example.com/mock-post", message: `[Mock] 블로그 포스트 발행 완료` };
  },
  generate_heygen_avatar_video: async (args: { avatarId?: string; scriptText: string }) => {
    return { success: true, videoUrl: "https://heygen.com/mock-video", message: `[Mock] 아바타 영상 생성이 완료되었습니다.` };
  },
  send_discord_message: async (args: { channelName: string; message: string }) => {
    return { success: true, message: `[Mock] #${args.channelName} 채널에 디스코드 메시지 전송 성공` };
  },
  read_figma_file: async (args: { fileKey: string }) => {
    return { success: true, document: { name: "디자인 시스템", children: [{ type: "FRAME", name: "Header" }, { type: "FRAME", name: "Button" }] } };
  },
  query_clickup_tasks: async (args: { listId: string }) => {
    return { success: true, tasks: [{ id: "task-1", name: "홈페이지 리뉴얼 디자인", status: "In Progress" }, { id: "task-2", name: "API 서버 연동", status: "To Do" }] };
  },
  send_slack_message: async (args: { channel: string; text: string }) => {
    return { success: true, message: `[Mock] 슬랙 ${args.channel}에 메시지 전송 성공` };
  },
  read_slack_thread: async (args: { threadUrl: string }) => {
    return { success: true, messages: [{ user: "Alice", text: "이 이슈 어떻게 해결하나요?" }, { user: "Bob", text: "프론트엔드 캐시 문제입니다." }] };
  },
};
