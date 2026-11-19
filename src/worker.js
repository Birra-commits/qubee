export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/check" && request.method === "POST") {
      try {
        const apiKey = env.GEMINI_API_KEY ? env.GEMINI_API_KEY.trim() : "";
        if (!apiKey) {
          return Response.json(
            { error: "GEMINI_API_KEY secret is not set in Cloudflare." },
            { status: 500 }
          );
        }

        const { text, language, tone, explainLang } = await request.json();

        if (!text || !text.trim()) {
          return Response.json({ corrections: [] });
        }

        const prompt = `Copy-edit this ${language || "Afaan Oromo"} text (tone: ${tone || "Standard / Clear"}, explanations in ${explainLang || "English"}).
Fix spelling (including Qubee gemination/vowel length in Afaan Oromo, or Fidel orthography in Amharic), grammar, punctuation, and clarity.
Return ONLY valid JSON: {"corrections":[{"original":"exact substring","suggestion":"fix","category":"Spelling|Grammar|Punctuation|Style","explanation":"short 1-sentence reason"}]}

Text:
${text}`;

        const requestBody = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 }
          }
        });

        const MODELS = [
          "gemini-3.5-flash-lite",
          "gemini-3.1-flash-lite",
          "gemini-3.6-flash"
        ];

        let lastError = "Model temporarily busy. Please try again.";

        for (const model of MODELS) {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: requestBody
            }
          );

          const data = await geminiRes.json();

          if (geminiRes.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return new Response(data.candidates[0].content.parts[0].text, {
              headers: { "Content-Type": "application/json" }
            });
          }

          if (data.error) {
            lastError = data.error.message;
            if (geminiRes.status === 503 || geminiRes.status === 429) {
              continue;
            }
            return Response.json({ error: lastError }, { status: 500 });
          }
        }

        return Response.json({ error: lastError }, { status: 503 });

      } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // Serve public/index.html and any other static files
    return env.ASSETS.fetch(request);
  }
};
