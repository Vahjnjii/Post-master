import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const processSmallBatch = async (userInput: string, targetLanguageCode: string = 'auto') => {
  // Using gemini-3-flash-preview for better stability and lower latency
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Gemini Request Timeout")), 60000); // 60s timeout
    });

    const isAuto = targetLanguageCode === 'auto';
    const translationInstruction = isAuto 
      ? 'You MUST write the ENTIRE post (Title, Content, Hashtags) in the language of the user\'s input/request.'
      : `You MUST translate/dub the input and write the ENTIRE post (Title, Content, Hashtags) in the language specified by code: "${targetLanguageCode}". Even if the input is in another language, you MUST output in "${targetLanguageCode}".`;

    const generatePromise = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are now receiving a batch instruction. 
      INPUT: ${userInput}
      TARGET_LANGUAGE: ${isAuto ? 'Detect from Input' : targetLanguageCode}
      
      TASK: 
      1. Examine the input carefully. 
      2. Identify each individual item or requested post.
      3. For EACH and EVERY item found, generate a high-quality post.
      4. DO NOT SKIP ANY DATA. If the user provides 15 tips, you MUST return exactly 15 posts.
      5. ${translationInstruction}
      6. Return NOTHING but the valid JSON array.`,
      config: {
        maxOutputTokens: 8192,
        systemInstruction: `You are an expert bulk content generator and translator for social media. 
        Your goal is to output a JSON array of posts formatted perfectly for reading on a 4:5 mobile post (1080x1350).

        CRITICAL DIRECTIVE: You MUST process the ENTIRE input. If the user provides a document with 100 posts, you MUST output an array containing EXACTLY 100 posts. DO NOT summarize, DO NOT truncate, DO NOT skip any entries. Output ALL of them.

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
           - Maintain the ORIGINAL meaning and soul of the input, but make the phrasing natural and "viral" in the target language.
        6. HASHTAG RULES:
           - You MUST provide EXACTLY 5 hashtags for each post.
           - Hashtag 1: Basic main short-tail keyword related to the topic.
           - Hashtag 2 & 3: Targeted, highly popular general hashtags related to the topic.
           - Hashtag 4: The name of the language the post is written in. It MUST be written IN that language.
           - Hashtag 5: The main country or region of that language. It MUST be written IN that language.

        Output JSON: { "posts": [ { "title": "string", "content": ["string"], "hashtags": ["string"], "languageName": "string" } ] }
        `,
        responseMimeType: "application/json",
      }
    });

    const response = await Promise.race([generatePromise, timeoutPromise]) as any;

    const text = response.text;
    if (!text) return [];
    
    // Clean up text: remove markdown code blocks and surrounding whitespace
    let cleanText = text.replace(/```json|```/g, '').trim();

    // Find the first valid JSON start character ({ or [)
    const firstBrace = cleanText.indexOf('{');
    const firstBracket = cleanText.indexOf('[');
    let startIndex = -1;

    if (firstBrace !== -1 && firstBracket !== -1) {
      startIndex = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
      startIndex = firstBrace;
    } else if (firstBracket !== -1) {
      startIndex = firstBracket;
    }

    if (startIndex === -1) {
      console.warn("No JSON start found");
      return [];
    }
    
    cleanText = cleanText.substring(startIndex);

    try {
      const data = JSON.parse(cleanText);
      return Array.isArray(data) ? data : data.posts || [];
    } catch (e) {
      // If parsing fails, it might be heavily truncated from extremely large token limits.
      // We will attempt to find the last valid trailing bracket and close the object.
      let lastBrace = cleanText.lastIndexOf('}');
      while (lastBrace !== -1) {
        let trimmed = cleanText.substring(0, lastBrace + 1);
        try {
          // Attempt as JSON object array { "posts": [ ... ] }
          const dataObj = JSON.parse(trimmed + ']}');
          if (dataObj.posts) return dataObj.posts;
        } catch (eObj) {}
        try {
          // Attempt as pure JSON array [ ... ]
          const dataArr = JSON.parse(trimmed + ']');
          if (Array.isArray(dataArr)) return dataArr;
        } catch (eArr) {}
        
        // Decrement and search for previous closing brace
        lastBrace = cleanText.lastIndexOf('}', lastBrace - 1);
      }
    }
    
    return [];
  } catch (e) {
    console.error("Gemini Error:", e);
    // Return empty array instead of crashing so UI can handle it
    return [];
  }
};

export const formatPosts = async (userInput: string, targetLanguageCode: string = 'auto') => {
  const MAX_CHUNK_LENGTH = 8000; // Increased for Gemini 3
  
  // Clean input to remove extreme whitespace or binary-like noise if user pasted something weird
  const safeInput = userInput.substring(0, 50000); // Guardrails for UI stability

  if (safeInput.length <= MAX_CHUNK_LENGTH) {
    return await processSmallBatch(safeInput, targetLanguageCode);
  }

  console.log("Massive input detected. Chunking...");
  const chunks: string[] = [];
  let currentChunk = "";
  
  const lines = safeInput.split('\n');
  for (const line of lines) {
    if (currentChunk.length + line.length > MAX_CHUNK_LENGTH && currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  let finalResults: any[] = [];
  
  // Process up to 5 chunks max to prevent browser tab from hanging on massive text files
  const maxChunksToProcess = Math.min(chunks.length, 5);

  for (let i = 0; i < maxChunksToProcess; i++) {
    console.log(`Processing chunk ${i + 1}/${maxChunksToProcess}`);
    const partialPosts = await processSmallBatch(chunks[i], targetLanguageCode);
    if (Array.isArray(partialPosts)) {
      finalResults = finalResults.concat(partialPosts);
    }
  }
  
  return finalResults;
};
