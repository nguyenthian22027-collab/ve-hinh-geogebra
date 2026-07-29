import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION, IMAGE_EXTRACTION_PROMPT } from "../constants";

const LS_KEY = 'ggb_gemini_api_key';

/** Lưu API key vào localStorage */
export const saveApiKey = (key: string) => {
  localStorage.setItem(LS_KEY, key.trim());
};

/** Xóa API key khỏi localStorage */
export const clearApiKey = () => {
  localStorage.removeItem(LS_KEY);
};

/** Đọc API key: ưu tiên localStorage, fallback sang biến môi trường */
export const getApiKey = (): string => {
  return localStorage.getItem(LS_KEY) || process.env.GEMINI_API_KEY || '';
};

const getAIClient = () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Chưa có API Key. Vui lòng nhập Gemini API Key vào ô cài đặt bên dưới.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateGeoGebraCommands = async (prompt: string): Promise<string[]> => {
  const ai = getAIClient();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.1,
      }
    });

    const text = response.text;
    if (!text) return [];

    const commands = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('```') && !line.startsWith('//'));

    return commands;
  } catch (error) {
    console.error("Gemini API Error (Generate):", error);
    throw error;
  }
};

export const extractProblemFromImage = async (base64Data: string, mimeType: string): Promise<string> => {
  const ai = getAIClient();

  try {
    const cleanBase64 = base64Data.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64
            }
          },
          {
            text: "Trích xuất đề bài từ ảnh này."
          }
        ]
      },
      config: {
        systemInstruction: IMAGE_EXTRACTION_PROMPT,
        temperature: 0.1,
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Gemini API Error (Vision):", error);
    throw error;
  }
};
