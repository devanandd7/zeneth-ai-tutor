
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { TutorialStep, ActionType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

/**
 * High-speed lesson generator. 
 * Optimized for Gemini 3 Flash to deliver results in < 3 seconds.
 */
export const generateTutorialForTopic = async (topic: string): Promise<TutorialStep[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Expert Teacher System: Create a 3-part micro-lecture on "${topic}".
      
      Structure:
      1. THE HOOK: Real-world scenario or problem.
      2. THE MECHANICS: How it works (The Core Concept).
      3. THE IMPACT: Real-life application.

      Visuals: Use emojis and arrows. Coordinates 0-100.
      Timeline: Start narration (voice) at time 0. Draw visuals sequentially.
      
      Return JSON only.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              narrative: { type: Type.STRING, description: "Professional teacher narrative with clear examples." },
              duration: { type: Type.NUMBER, description: "Seconds (10-15)" },
              timeline: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.NUMBER },
                    action: { type: Type.STRING, enum: ["draw", "highlight", "voice"] },
                    element: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ["emoji", "arrow"] },
                        content: { type: Type.STRING },
                        label: { type: Type.STRING },
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                        rotation: { type: Type.NUMBER }
                      }
                    },
                    target: { type: Type.STRING }
                  },
                  required: ["time", "action"]
                }
              }
            },
            required: ["title", "narrative", "duration", "timeline"]
          }
        }
      }
    });
    
    const rawText = response.text || "[]";
    const cleanedText = rawText.replace(/^```json/mi, '').replace(/```$/mi, '').trim();
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("Fast Gen Error:", error);
    throw error;
  }
};

export const askTutorWithVisuals = async (question: string, context: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Explain "${question}" in context of "${context}".
      Provide a concise answer and 2-3 visual emojis with labels for the whiteboard.
      Return JSON { "text": string, "visuals": array }.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            visuals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["emoji"] },
                  content: { type: Type.STRING },
                  label: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER }
                }
              }
            }
          },
          required: ["text", "visuals"]
        }
      },
    });
    const rawText = response.text || "{}";
    const cleanedText = rawText.replace(/^```json/mi, '').replace(/```$/mi, '').trim();
    return JSON.parse(cleanedText);
  } catch (error) {
    return { text: "I hit a small snag. Let me try explaining that again.", visuals: [] };
  }
};

export const generateSpeech = async (text: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    return null;
  }
};
