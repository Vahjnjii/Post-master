import { GoogleGenAI } from "@google/genai";

const processSmallBatch = async (userInput: string, apiKey: string, targetLanguageCode: string = 'auto') => {
  const ai = new GoogleGenAI({ apiKey });

  try {
    const isAuto = targetLanguageCode === 'auto';
    const translationInstruction = isAuto 
      ? 'You MUST write the ENTIRE post (Title, Content, Hashtags) in the language of the user\'s input/request.'
      : `You MUST translate/dub the input and write the ENTIRE post (Title, Content, Hashtags) in the language specified by code: "${targetLanguageCode}". Even if the input is in another language, you MUST output in "${targetLanguageCode}".`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are now receiving a batch instruction. 
      INPUT: ${userInput}
      TARGET_LANGUAGE: ${isAuto ? 'Detect from Input' : targetLanguageCode}
      
      TASK: 
      1. Examine the input carefully. 
      2. Identify each individual item or requested post.
      3. For EACH and EVERY item found, generate a high-quality post.
      4. DO NOT SKIP ANY DATA.
      5. ${translationInstruction}
      6. Return NOTHING but the valid JSON array starting with [.`,
      config: {
        systemInstruction: `You are an expert bulk content generator and translator for social media. 
        Your goal is to output a JSON array of posts formatted perfectly for reading on a 4:5 mobile post (1080x1350).

        CRITICAL DIRECTIVE: You MUST process the ENTIRE input. Output ALL of them.

        STRICT FORMATTING RULES:
        1. SEPARATION: Divide input into multiple logical, individual posts.
        2. TONE: Engaging, clear, and highly viral.
        3. TITLE (H1): 
           - Should be the main headline / "Title of the post".
           - Keep it concise, punchy, and uppercase.
           - MUST NOT CONTAIN EMOJIS OR PUNCTUATION at the end.
        4. CONTENT STRUCTURE: 
           - Format text into exactly 3-6 logical "impact points".
           - Each point should be a single, focused sentence.
           - Use "•" for all list items.
           - Bold critical keywords (e.g., **Productivity**, **Success**).
        5. LANGUAGE & TRANSLATION:
           - ${translationInstruction}
           - Maintain the ORIGINAL meaning and soul of the input.
        6. HASHTAG RULES:
           - You MUST provide EXACTLY 5 hashtags for each post.
           - Hashtag 4: The name of the language.
           - Hashtag 5: The main country/region of that language.

        Output ONLY the JSON array.
        JSON Format: [ { "title": "string", "content": ["string"], "hashtags": ["string"], "languageName": "string" } ]`,
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) return [];
    
    let cleanText = text.replace(/```json|```/g, '').trim();
    const startIndex = cleanText.indexOf('[');
    if (startIndex !== -1) cleanText = cleanText.substring(startIndex);

    return JSON.parse(cleanText);
  } catch (e: any) {
    console.error("Gemini Error:", e);
    // If it's a quota error or something similar, throw it so the caller can rotate keys
    throw e;
  }
};

export const formatPosts = async (userInput: string, apiKey: string, targetLanguageCode: string = 'auto') => {
  const MAX_CHUNK_LENGTH = 8000;
  
  if (userInput.length <= MAX_CHUNK_LENGTH) {
    return await processSmallBatch(userInput, apiKey, targetLanguageCode);
  }

  const chunks: string[] = [];
  let currentChunk = "";
  const lines = userInput.split('\n');
  
  for (const line of lines) {
    if (currentChunk.length + line.length > MAX_CHUNK_LENGTH && currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());

  let finalResults: any[] = [];
  const maxChunksToProcess = Math.min(chunks.length, 5);

  for (let i = 0; i < maxChunksToProcess; i++) {
    const partialPosts = await processSmallBatch(chunks[i], apiKey, targetLanguageCode);
    if (Array.isArray(partialPosts)) {
      finalResults = finalResults.concat(partialPosts);
    }
  }
  
  return finalResults;
};
