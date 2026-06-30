import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // Helper to dynamically get Gemini client
  const getAiClient = (req: express.Request) => {
    const headerKey = req.headers["x-api-key"] || req.headers["authorization"]?.toString().replace("Bearer ", "");
    const key = headerKey || process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GoogleGenAI({
      apiKey: key as string,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // API Key Connection Test Endpoint
  app.post("/api/ai/test-key", async (req, res) => {
    try {
      const client = getAiClient(req);
      if (!client) {
        return res.status(400).json({ error: "API Key가 제공되지 않았습니다." });
      }

      // Try a lightweight request to test the key
      const response = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Hello. Respond with one word: 'OK'",
      });

      if (response && response.text) {
        return res.json({ success: true, message: "API Key 연결 테스트 성공!" });
      } else {
        throw new Error("응답이 올바르지 않습니다.");
      }
    } catch (err: any) {
      console.error("API Key Test Failure:", err);
      return res.status(400).json({
        success: false,
        error: "API Key 인증 실패 또는 호출 오류",
        details: err?.message || String(err),
      });
    }
  });

  // AI Subjective Text Categorization Endpoint
  app.post("/api/ai/analyze-text", async (req, res) => {
    try {
      const client = getAiClient(req);
      if (!client) {
        return res.status(401).json({
          error: "API Key가 설정되지 않았습니다. 우측 상단의 'API 설정' 버튼을 눌러 개인 API Key를 입력해 주세요.",
        });
      }

      const { questionCode, questionLabel, answers } = req.body;

      if (!answers || !Array.isArray(answers) || answers.length === 0) {
        return res.status(450).json({ error: "분석할 주관식 답변 데이터가 비어 있습니다." });
      }

      // Limit answers to prevent token limit issues, standard survey response text sample is enough
      const sampledAnswers = answers.slice(0, 400);

      const prompt = `
당신은 설문조사 주관식(서술형) 답변을 의미 기반으로 분류하고 전문 통계 분석을 수행하는 수석 연구원입니다.
문항 코드 [${questionCode}]에 대한 주관식 답변 목록을 분석해 주세요.

[문항 내용]: ${questionLabel}
[응답자 답변 목록 (총 ${sampledAnswers.length}개)]:
${sampledAnswers.map((ans, idx) => `${idx + 1}. ${ans}`).join("\n")}

[요구사항]:
1. 전체 답변을 분석하여 문항의 핵심 트렌드와 특징을 아우르는 "전체 요약(overallSummary)"을 한 두 문장으로 작성해 주세요.
2. 분석 대상에서 대표되는 "주요 핵심 키워드(mainKeywords)"를 5~8개 추출해 주세요.
3. 의미가 유사한 답변들을 그룹화하여 4~7개의 명확하고 상호 배타적인 카테고리(categories)로 분류해 주세요.
4. 각 카테고리별로 아래 항목을 정확히 작성해 주세요:
   - 카테고리 이름 (짧고 명확한 한글 명칭, 예: "배송 지연 및 속도 불만", "가격 대비 높은 가성비" 등)
   - 해당 카테고리로 매칭된 답변 수(count) 및 전체 유효 답변 수 대비 비율(percentage, 소수점 첫째 자리까지)
   - 해당 카테고리를 대표하는 구체적이고 실제적인 핵심 단어들(keywords, 3~5개)
   - 해당 카테고리에 의견 요약 설명(description, 한 줄 수준)
   - 해당 카테고리를 직관적으로 보여주는 실제 답변 원문(representativeQuotes, 2~3개)
5. 보고서나 발표 프레젠테이션에 즉시 인용하거나 활용하기에 완벽한 비즈니스 톤앤매너의 "보고서용 인사이트 문장(reportInsights)"을 3~4개 개별 문장으로 도출해 주세요.
`;

      const systemInstruction = "당신은 한국어 설문조사 주관식 응답 데이터 처리에 특화된 뛰어난 데이터 분석가입니다. 주어지는 주관식 답변 텍스트들을 의미 기반으로 완벽히 분류하고 통계 요약을 도출해 내야 합니다. 반드시 정해진 JSON 스키마 규격을 충족하여 답변해 주세요.";
      const schema = {
        type: Type.OBJECT,
        properties: {
          overallSummary: {
            type: Type.STRING,
            description: "전체 주관식 응답 트렌드를 한 두 줄로 아우르는 간결하고 명확한 요약문",
          },
          mainKeywords: {
            type: Type.ARRAY,
            description: "전체 응답을 관통하는 주요 핵심 키워드 5~8개 목록",
            items: {
              type: Type.STRING,
            },
          },
          reportInsights: {
            type: Type.ARRAY,
            description: "보고서에 바로 복사/인용하여 즉시 쓸 수 있는 고품질 비즈니스 인사이트 문장 3~4개 목록",
            items: {
              type: Type.STRING,
            },
          },
          categories: {
            type: Type.ARRAY,
            description: "의미 분류별 카테고리 목록 (4~7개)",
            items: {
              type: Type.OBJECT,
              properties: {
                category: {
                  type: Type.STRING,
                  description: "핵심 요지를 담은 짧은 한국어 카테고리 이름 (예: 품질 만족, 가격 부담 등)",
                },
                count: {
                  type: Type.INTEGER,
                  description: "이 카테고리로 분류된 응답 수",
                },
                percentage: {
                  type: Type.NUMBER,
                  description: "이 카테고리가 차지하는 비율 (%)",
                },
                keywords: {
                  type: Type.ARRAY,
                  description: "이 카테고리의 특징을 대변하는 주요 세부 키워드 3~5개",
                  items: {
                    type: Type.STRING,
                  },
                },
                description: {
                  type: Type.STRING,
                  description: "이 카테고리 응답자들의 주요 의견이나 정서에 대한 한 줄 요약 설명",
                },
                representativeQuotes: {
                  type: Type.ARRAY,
                  description: "이 카테고리를 잘 나타내 주는 실제 응답자의 답변 텍스트 예시 2~3개",
                  items: {
                    type: Type.STRING,
                  },
                },
              },
              required: ["category", "count", "percentage", "keywords", "description", "representativeQuotes"],
            },
          },
        },
        required: ["overallSummary", "mainKeywords", "reportInsights", "categories"],
      };

      // Robust retry with model fallback
      const modelsToTry = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-3.5-flash"];
      const maxRetriesPerModel = 2;
      let response: any = null;
      let lastError: any = null;

      for (const model of modelsToTry) {
        for (let attempt = 1; attempt <= maxRetriesPerModel; attempt++) {
          try {
            console.log(`[AI Analysis] Attempting model: ${model}, attempt ${attempt}/${maxRetriesPerModel}`);
            response = await client.models.generateContent({
              model: model,
              contents: prompt,
              config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: schema,
              },
            });
            if (response) {
              console.log(`[AI Analysis] Success with model: ${model} on attempt ${attempt}`);
              break;
            }
          } catch (err: any) {
            lastError = err;
            const errStr = String(err);
            const isUnavailable = errStr.includes("503") || errStr.toLowerCase().includes("unavailable") || errStr.includes("high demand");
            const isRateLimit = errStr.includes("429") || errStr.toLowerCase().includes("resource exhausted") || errStr.toLowerCase().includes("rate limit");
            const isNotFound = errStr.includes("404");

            console.warn(`[AI Analysis] Failed with model ${model} (attempt ${attempt}):`, err?.message || err);

            // If model not found, skip to next model immediately
            if (isNotFound) {
                console.log(`[AI Analysis] Model ${model} not found, skipping...`);
                break; 
            }

            if (isUnavailable || isRateLimit || attempt < maxRetriesPerModel) {
              const delayMs = attempt * 5000;
              console.log(`[AI Analysis] Temporary error, waiting ${delayMs}ms before next attempt...`);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            } else {
              break;
            }
          }
        }
        if (response) break;
      }

      if (!response) {
        throw lastError || new Error("모든 AI 모델 분석 시도가 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Gemini로부터 빈 응답이 반환되었습니다.");
      }

      const result = JSON.parse(responseText.trim());
      res.json(result);
    } catch (err: any) {
      console.error("AI Analysis Error:", err);
      res.status(500).json({
        error: "AI가 주관식 답변을 분석하는 도중 오류가 발생했습니다.",
        details: err?.message || String(err),
      });
    }
  });

  // Serve static files or Vite in dev
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
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
