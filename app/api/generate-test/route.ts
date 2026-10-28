import { NextResponse } from "next/server";
import { aiErrorMessage, clean, complete, extractJson, MODEL, readJson } from "../../../lib/ai";
import { TEST_SYSTEM } from "../../../lib/prompts";
import { guard } from "../../../lib/guard";
import { captureRouteError } from "../../../lib/errors";
import { plainDeep } from "../../../lib/plain";

// Vercel gives a function 10 seconds unless it is told otherwise, and an AI
// answer of any length takes longer than that. Without this line the request is
// killed mid-generation and the user sees a failure with nothing in the logs.
export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await guard(req, "test");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const topic = clean(body.topic, g.rule.maxInputChars);
  if (!topic) return NextResponse.json({ error: "Topic is required." }, { status: 400 });

  const blocked = await g.consume();
  if (blocked) return blocked;

  try {
    const response = await complete({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            TEST_SYSTEM
        },
        {
          role: "user",
          content: `Make an exam for topic: "${topic}". Create:
- 8 multiple-choice questions (each exactly 4 options, one correct)
- 8 true/false statements
- 5 short-answer questions (1–2 sentence answer)
- 2 long-answer questions (3–5 sentence answer)
Keep language concise and student-friendly.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "StudyTest",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["mcqs", "trueFalse", "short", "long"],
            properties: {
              mcqs: {
                type: "array",
                minItems: 8,
                maxItems: 8,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["question", "options", "correctIndex"],
                  properties: {
                    question: { type: "string" },
                    options: {
                      type: "array",
                      minItems: 4,
                      maxItems: 4,
                      items: { type: "string" }
                    },
                    correctIndex: { type: "integer", minimum: 0, maximum: 3 }
                  }
                }
              },
              trueFalse: {
                type: "array",
                minItems: 8,
                maxItems: 8,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["statement", "answer"],
                  properties: {
                    statement: { type: "string" },
                    answer: { type: "boolean" }
                  }
                }
              },
              short: {
                type: "array",
                minItems: 5,
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["question", "answer"],
                  properties: {
                    question: { type: "string" },
                    answer: { type: "string" }
                  }
                }
              },
              long: {
                type: "array",
                minItems: 2,
                maxItems: 2,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["question", "answer"],
                  properties: {
                    question: { type: "string" },
                    answer: { type: "string" }
                  }
                }
              }
            }
          }
        }
      },
      temperature: 0.3,
      max_tokens: g.rule.maxTokens
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const test = extractJson<any>(raw, "object");
    if (!test || !Array.isArray(test.mcqs)) throw new Error("Invalid test format");

    return NextResponse.json({ test: plainDeep(test, 1200) });
  } catch (err: any) {
    console.error("generate-test error:", err?.message || err);
    captureRouteError(err, req, { route: "/api/test", status: 500 });
    await g.refund();
    return NextResponse.json({ error: aiErrorMessage(err, "Server error.") }, { status: 500 });
  }
}
