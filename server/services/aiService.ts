import { IAnnotation } from '../models/Project.ts';

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const HUGGINGFACE_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';

const extractMessageText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          if ('type' in item && (item as any).type === 'text') {
            return ((item as any).text as string) || '';
          }
          if ('type' in item && ['image_url', 'input_image', 'image'].includes((item as any).type)) {
            return '';
          }
          if ('text' in item) {
            return String((item as any).text || '');
          }
        }
        return '';
      })
      .join('');
  }

  if (content && typeof content === 'object' && 'text' in content) {
    return String((content as any).text || '');
  }

  return '';
};

const parseJsonResponse = (raw: string) => {
  let trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Empty AI response');
  }
  if (trimmed.startsWith('```json')) {
    trimmed = trimmed.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  } else if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
  }
  return JSON.parse(trimmed);
};

export const analyzeDifference = async (
  oldImageBase64: string,
  newImageBase64: string,
  annotation: IAnnotation
) => {
  const HF_API_KEY = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
  if (!HF_API_KEY) {
    throw new Error('Missing Hugging Face API key. Set HF_TOKEN in your .env file.');
  }

  const MODEL_NAME = process.env.HF_MODEL || 'CohereLabs/command-a-vision-07-2025:fastest';
  const MODEL_FALLBACKS = (process.env.HF_MODEL_FALLBACKS || 'zai-org/GLM-4.5V-FP8:fastest').split(',').map(m => m.trim()).filter(Boolean);
  const modelCandidates = [MODEL_NAME, ...MODEL_FALLBACKS.filter(m => m !== MODEL_NAME)];
  console.log(`Hugging Face API Key set; using model candidates ${modelCandidates.join(', ')}`);

  const cleanBase64 = (str: string) => {
    if (!str) return '';
    const cleaned = str.replace(/[\r\n\s]+/g, '');
    if (cleaned.includes(',')) {
      return cleaned.split(',').pop() || '';
    }
    return cleaned;
  };

  const cleanOld = cleanBase64(oldImageBase64);
  const cleanNew = cleanBase64(newImageBase64);

  if (!cleanOld || !cleanNew) {
    throw new Error('Invalid image data provided');
  }

  const prompt = `
ROLE:
You are a Senior Medical Regulatory Proofreader performing a HIGH-PRECISION visual verification of regulated pharmaceutical documents.

Your responsibility is to determine whether a requested correction has been implemented EXACTLY.

This is NOT a proofreading task.
This is NOT a summarization task.
This is a VISUAL DOCUMENT COMPARISON task.

You must be extremely conservative.

Never assume.
Never infer.
Never guess.
Never hallucinate.
Only report what is visually verifiable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INPUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You receive three inputs:

1. OLD VERSION
   - Contains a RED BOUNDING BOX.
   - The red box is ONLY a locator.
   - It is NOT part of the document.
   - The change request always refers to the content inside this box.

2. NEW VERSION
   - Clean document without the red box.
   - Compare ONLY the corresponding location.

3. EDIT INSTRUCTION

"${annotation.text}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY OBJECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Determine whether the requested edit has been implemented EXACTLY.

Do NOT evaluate the rest of the page.

Do NOT review unrelated content.

Focus ONLY on the region identified by the red box.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISUAL COMPARISON PROCESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1:
Locate the RED BOX in the OLD VERSION.

Step 2:
Identify EXACTLY what is inside the red box:
- text
- punctuation
- numbers
- symbols
- superscripts
- subscripts
- capitalization
- formatting if relevant
- image
- icon
- graphical element

Step 3:
Find the EXACT corresponding location in the NEW VERSION.

Step 4:
Compare character-by-character whenever text exists.

Step 5:
Determine whether the requested instruction has been executed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT DECISION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DELETE / REMOVE / OMIT

IMPLEMENTED ONLY IF:

• the original content no longer exists

AND

• either:
    - the area is blank
    OR
    - surrounding content has naturally reflowed into the space

NOT_IMPLEMENTED IF:

• the original text still exists
• even partially
• even with formatting changes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CHANGE / REPLACE / MODIFY

IMPLEMENTED ONLY IF:

• the old content is completely removed

AND

• the new requested content appears exactly

Verify:

- spelling
- capitalization
- punctuation
- numbers
- units
- spacing
- symbols
- dosage
- decimal points

If even ONE requested character is incorrect:

Return NOT_IMPLEMENTED.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT / ADD

IMPLEMENTED ONLY IF:

The requested content appears in the correct logical position.

Merely appearing elsewhere on the page does NOT count.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORMATTING

If the instruction explicitly refers to:

- bold
- italic
- underline
- font
- alignment
- spacing
- indentation
- bullet
- table
- image placement

Then verify those visually.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO NOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO NOT guess hidden text.

DO NOT reconstruct blurred text.

DO NOT assume OCR mistakes.

DO NOT infer intent.

DO NOT use surrounding context.

DO NOT ignore punctuation.

DO NOT ignore capitalization.

DO NOT ignore numbers.

DO NOT ignore dosage values.

DO NOT ignore decimal points.

DO NOT ignore symbols.

DO NOT ignore superscripts or subscripts.

DO NOT compare unrelated regions.

DO NOT mark IMPLEMENTED unless you can visually verify it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONFIDENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Confidence must reflect ONLY visual certainty.

1.00
Perfect visual confirmation.

0.90–0.99
Very clear evidence.

0.70–0.89
Mostly clear but minor uncertainty.

0.40–0.69
Visible ambiguity.

Below 0.40
Unable to verify.

If confidence is below 0.80,
prefer PARTIAL instead of IMPLEMENTED.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATUS RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPLEMENTED

Return ONLY when:

• the requested modification is completely verified
• there is no conflicting evidence
• visual evidence is clear

NOT_IMPLEMENTED

Return when:

• the requested modification is absent
• the original content still exists
• replacement is incorrect
• deletion failed

PARTIAL

Return when:

• image quality prevents verification
• text is blurry
• region is cropped
• evidence is ambiguous
• confidence is below 0.80
• only part of the requested modification is present

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON.

Do not include markdown.

Do not include explanations outside JSON.

Schema:

{
  "status": "IMPLEMENTED" | "NOT_IMPLEMENTED" | "PARTIAL",
  "confidence": number,
  "reason": "Detailed visual justification describing exactly what was observed."
}
`;

  const buildBody = (model: string, useInputImage: boolean) => ({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...(
            useInputImage
              ? [
                  {
                    type: 'input_image',
                    image_url: {
                      url: `data:image/jpeg;base64,${cleanOld}`,
                    },
                  },
                  {
                    type: 'input_image',
                    image_url: {
                      url: `data:image/jpeg;base64,${cleanNew}`,
                    },
                  },
                ]
              : [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/jpeg;base64,${cleanOld}`,
                    },
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/jpeg;base64,${cleanNew}`,
                    },
                  },
                ]
          ),
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 1000,
  });

  let attempts = 0;
  const maxAttempts = 3;
  let useInputImage = false;
  let modelIndex = 0;
  let body = buildBody(modelCandidates[modelIndex], useInputImage);

  while (attempts < maxAttempts) {
    try {
      body = buildBody(modelCandidates[modelIndex], useInputImage);
      console.log(`Hugging Face request body size: ${Buffer.byteLength(JSON.stringify(body), 'utf8')} bytes`);
      console.log(`Using model candidate: ${modelCandidates[modelIndex]}`);
      const response = await fetch(HUGGINGFACE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${HF_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      if (!response.ok) {
        const parsed = responseText ? JSON.parse(responseText) : null;
        const errorMessage = parsed?.error?.message || response.statusText;
        const status = response.status;

        console.error(`Hugging Face response error ${status}:`, responseText);

        if (status === 401) {
          return {
            status: 'PARTIAL',
            confidence: 0.0,
            reason: 'Hugging Face authentication failed. Check HF_TOKEN in .env and ensure the key is valid.',
          };
        }

        if (status === 429) {
          console.warn('Hugging Face rate limit hit for model', modelCandidates[modelIndex]);
          modelIndex = Math.min(modelCandidates.length - 1, modelIndex + 1);
          attempts += 1;
          if (attempts >= maxAttempts) {
            throw new Error(`Rate limited after ${attempts} attempts: ${errorMessage}`);
          }
          await delay(2000 * attempts);
          continue;
        }

        if ((status === 400 || status === 422) && useInputImage) {
          console.warn('Hugging Face returned an unsupported image content type; retrying with image_url shape');
          useInputImage = false;
          attempts += 1;
          if (attempts >= maxAttempts) {
            return {
              status: 'PARTIAL',
              confidence: 0.0,
              reason: 'Image data was rejected by AI service (invalid image format or unsupported multimodal shape).',
            };
          }
          await delay(1000);
          continue;
        }

        if (status === 400 || status === 422) {
          return {
            status: 'PARTIAL',
            confidence: 0.0,
            reason: 'Image data was rejected by AI service (too large or invalid format).',
          };
        }

        if (status === 402) {
          return {
            status: 'PARTIAL',
            confidence: 0.0,
            reason: 'Hugging Face account has insufficient credits or billing limits. Reduce max_tokens or upgrade your plan.',
          };
        }

        throw new Error(`Hugging Face API error ${status}: ${errorMessage}`);
      }

      const parsed = JSON.parse(responseText);
      const choice = parsed?.choices?.[0];
      const content = choice?.message?.content;
      const text = extractMessageText(content);
      if (!text) {
        throw new Error('No text response from AI');
      }

      return parseJsonResponse(text);
    } catch (error: any) {
      console.error(`Attempt ${attempts + 1} failed:`, error.message || error);

      if (error.message?.includes('401')) {
        return {
          status: 'PARTIAL',
          confidence: 0.0,
          reason: 'Hugging Face authentication failed. Check HF_TOKEN in .env and ensure the key is valid.',
        };
      }

      if (error.message?.includes('Rate limited')) {
        throw error;
      }

      attempts += 1;
      if (attempts >= maxAttempts) {
        console.error('AI Service Error:', error);
        return {
          status: 'PARTIAL',
          confidence: 0.0,
          reason: 'Analysis failed due to API limits or connection errors.',
        };
      }

      await delay(2000 * attempts);
    }
  }

  return { status: 'PARTIAL', confidence: 0, reason: 'Unknown error' };
};