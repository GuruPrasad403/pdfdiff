import OpenAI from 'openai';
import { IAnnotation } from '../models/Project.ts';

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const analyzeDifference = async (
  oldImageBase64: string,
  newImageBase64: string,
  annotation: IAnnotation
) => {
  // We use the OpenAI SDK but point it to OpenRouter so we can access free open-source models
  const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    // Ensure you have OPENROUTER_API_KEY in your .env
    apiKey: process.env.OPENROUTER_API_KEY || process.env.API_KEY, 
  });

  // OpenRouter rotates their free models. Nvidia's Nemotron VL is currently a free vision option!
  const MODEL_NAME = 'nvidia/nemotron-nano-12b-v2-vl:free';

  try {
    // Robust Base64 extraction
    const cleanBase64 = (str: string) => {
        if (!str) return '';
        // Remove newlines/spaces just in case
        const cleaned = str.replace(/[\r\n\s]+/g, '');
        if (cleaned.includes(',')) {
            return cleaned.split(',').pop() || '';
        }
        return cleaned;
    };

    const cleanOld = cleanBase64(oldImageBase64);
    const cleanNew = cleanBase64(newImageBase64);

    if (!cleanOld || !cleanNew) {
        throw new Error("Invalid image data provided");
    }

    // 2. Construct Prompt - Optimized for Visual Inspection with Region of Interest
    const prompt = `
ROLE:
You are a Senior Medical Regulatory Proofreader.
You are comparing two images of the same page to verify if a specific edit instruction has been correctly implemented.

INPUTS:
1. "Old Version": Contains a RED BOUNDING BOX overlay. This box marks the specific text or area where the change was requested. The box is NOT part of the document; it is a locator tool for you.
2. "New Version": The final clean page (no red box).
3. Instruction: "${annotation.text}"

YOUR TASK:
1. Locate the RED BOX in the "Old Version". Identify the content (text, image, or element) enclosed within it.
2. Examine the CORRESPONDING LOCATION in the "New Version".
3. Determine if the Instruction has been executed.

LOGIC FOR "DELETE" / "REMOVE" / "OMIT":
- Look at the text inside the Red Box in the Old Version.
- Look at the *same* location in the New Version.
- If the *same* text exists there -> NOT_IMPLEMENTED.
- If the space is empty -> IMPLEMENTED.
- If *different* text is there (because text below moved up/reflowed) -> IMPLEMENTED.

LOGIC FOR "CHANGE" / "REPLACE":
- Identify the target text in the Old Version.
- Verify that in the New Version, that specific text is replaced by the requested new text.
- Check for exact spelling and punctuation.

LOGIC FOR "INSERT":
- If the instruction is to add text, check if it appears in the appropriate logical position near the marked area.

OUTPUT FORMAT:
Return ONLY a valid JSON object. Do not wrap it in markdown block quotes. Use the exact schema:
{
  "status": "IMPLEMENTED" | "NOT_IMPLEMENTED" | "PARTIAL",
  "confidence": 0.0 to 1.0,
  "reason": "Explain your visual findings clearly."
}
    `;

    // 3. Call OpenRouter with Retry Logic
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const response = await openai.chat.completions.create({
          model: MODEL_NAME,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${cleanOld}`,
                  },
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${cleanNew}`,
                  },
                }
              ]
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        });

        const text = response.choices[0]?.message?.content;
        
        if (!text) {
          throw new Error("No text response from AI");
        }

        return JSON.parse(text);

      } catch (error: any) {
        console.error(`Attempt ${attempts + 1} failed:`, error.message || error);
        
        // Handle 429 specifically (Rate limit)
        if (error.status === 429) {
          attempts++;
          if (attempts >= maxAttempts) throw error; 
          const waitTime = 2000 * attempts; 
          console.log(`⚠️ Quota hit. Retrying in ${waitTime}ms...`);
          await delay(waitTime);
          continue;
        }
        
        // Handle 400 - Invalid Argument
        if (error.status === 400) {
             console.error("Image Payload Error (400):", error);
             return {
                status: "PARTIAL",
                confidence: 0.0,
                reason: "Image data was rejected by AI service (too large or invalid format)."
             };
        }
        
        throw error; 
      }
    }

  } catch (error) {
    console.error("AI Service Error:", error);
    return {
      status: "PARTIAL",
      confidence: 0.0,
      reason: "Analysis failed due to API limits or connection errors."
    };
  }
  
  return { status: "PARTIAL", confidence: 0, reason: "Unknown error" };
};