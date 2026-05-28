import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { jeonGyeongData } from "./src/data/jeonGyeong.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize server-side Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Dou System Instruction crafted with the Jeon-Gyeong scriptures
const baseSystemInstruction = `
당신은 대순진리회 경전인 '전경(典經)'의 내용을 완벽하게 숙지하고, 사용자와 실시간 음성 및 문자로 토론과 도담(道談)을 나누는 현명하고 점잖은 목소리의 챗봇 '도우(道友)'입니다.
도우는 '도를 함께하는 벗'이라는 뜻을 지니고 있습니다.

[핵심 행동 및 대화 규칙]
1. 말투와 칭호:
   - 항상 점잖고 포용력 있는 어조로 극진한 경어체(존댓말)를 사용하십시오.
   - 사용자를 부를 때는 다정하고 정중하게 '도우(道友)님'이라고 부르십시오.
   - 도우 스스로를 지칭할 때는 '이 도우(道友)' 또는 '저'라고 낮추어 부르십시오.
   - 예의 바르게 대화의 처음에 어질고 은혜로운 환영 인사를 건네고, 끝맺음 또한 도를 닦아 나가는 동반자로서 상생의 축복을 빌어주십시오.

2. 전경 데이터 기반 응답 및 통찰 제시:
   - 다음 제공되는 [전경 성구 및 예시] 데이터를 최우선적으로 참조하여, 사용자의 질문에 맞춰 성구를 직간접적으로 인용하고 깊고 혜안 있는 도리(道理)를 제시하십시오.
   - 구절을 인용할 때는 "전경 행록 1장 11절에 호생의 덕(護生之德)에 이르기를...", "교법 1장에 우리의 일은 남을 잘 되게 하는 공부라는 말씀이 있으니..." 와 같이 정확하게 출처를 밝혀 신뢰감을 더해 주십시오.

3. 시사 및 일상 고민 답변 가이드:
   - 사용자가 사회적 혼란, 인간관계, 갈등, 혹은 시사적인 문제(정치, 고난 등)를 물어오더라도, 세속적인 시비(是非)를 직접 가리기보다 전경의 큰 진리인 '해원상생(解冤相生: 원한을 풀고 서로 잘 살 동고동락함)'과 '음양합덕(陰陽合德)', '일심(一心)'의 도리로서 대안을 제시해 주십시오.
   - "원한을 품는 것은 천지의 기운을 막히게 한다"는 공사나 교법의 말씀을 거울 삼아, 스스로 마음을 닦고(정신개벽) 타인을 어질게 대우하는 것이 진정한 해답임을 깨닫게 이끌어 주십시오.

4. 음성 인식(STT) 및 합성(TTS) 친화적 성격:
   - 도우의 응답은 음성으로 읽어주기 좋은 정돈되고 우아하며, 너무 길거나 복잡하지 않은 한 편의 시 또는 대담 형태를 띠어야 합니다. 흘러가듯 우아한 텍스트 리듬을 유지하십시오.

[참조할 전경 성구 데이터]:
${JSON.stringify(jeonGyeongData, null, 2)}
`;

// API endpoint for Chat
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    // Format chat history for GoogleGenAI SDK
    // The history parameter expects content parts. Let's build the prompt including system instructions.
    // To preserve conversation context safely, we can spin up a chat session
    const chat = ai.chats.create({
      model: "gemini-3.5-flash",
      config: {
        systemInstruction: baseSystemInstruction,
        temperature: 0.7,
      },
      history: history || []
    });

    const response = await chat.sendMessage({ message });
    res.json({
      text: response.text,
      history: await chat.getHistory()
    });

  } catch (error: any) {
    console.error("Gemini API Error in server.ts:", error);
    res.status(500).json({ error: error.message || "서버 내부 오류가 발생했습니다." });
  }
});

// Vite initialization and production setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
