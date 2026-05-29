import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt, history, memories, useSearch } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json({
        error: "GROQ_API_KEY is missing. Please add your Groq API Key under the application Settings menu (or in the environment configuration) to connect Zyntros AI Cognitive Core."
      }, { status: 401 });
    }

    let isRealTimeQuery = false;
    let searchQueryUsed = "";
    const sources: { title: string; url: string }[] = [];
    let searchResultsContext = "";

    // 1. Dynamic routing classifier: check if we should trigger search (only when permitted & required)
    if (useSearch) {
      try {
        const classificationResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${groqApiKey}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              {
                role: "system",
                content: `You are an intelligent AI router. Your job is to classify if the user query requires up-to-date, real-time search data to be answered accurately (e.g. current news, stock prices, today's weather/temp, latest events, live statistics, or events occurring in late 2024 through 2026).
If the query is a normal general-knowledge question, historical query, general explanation, creative writing, programming/coding task, math problem, or conversational banter, respond with 'NO'.
If it is a real-time/latest current status lookup, respond with 'YES'.
Answer with exactly ONE word: 'YES' or 'NO'. No other explanation, no punctuation.`
              },
              { role: "user", content: prompt }
            ],
            temperature: 0.0,
            max_tokens: 3,
          })
        });

        if (classificationResponse.ok) {
          const classData = await classificationResponse.json();
          const classificationText = classData.choices?.[0]?.message?.content?.trim() || "";
          isRealTimeQuery = classificationText.toUpperCase().includes("YES");
          console.log(`Intelligent Router classified query "${prompt}" -> Needs Real-time Search?`, isRealTimeQuery);
        }
      } catch (classErr) {
        console.error("Inference routing classifier failed, defaulting to native knowledge:", classErr);
      }
    }

    // 2. Perform live, secure, high-quality Web Search Grounding if classified YES
    if (isRealTimeQuery) {
      try {
        searchQueryUsed = prompt;
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(prompt)}`;
        const searchFetch = await fetch(searchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
          }
        });

        if (searchFetch.ok) {
          const htmlText = await searchFetch.text();
          
          // Parse top web results with a resilient regex
          const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
          
          let match;
          let count = 0;
          const searchData: { title: string; url: string; snippet: string }[] = [];

          while ((match = resultRegex.exec(htmlText)) !== null && count < 4) {
            let rawUrl = match[1];
            let title = match[2].replace(/<[^>]+>/g, "").trim();
            let snippet = match[3].replace(/<[^>]+>/g, "").trim();

            // Clean up DuckDuckGo search redirect format if present
            if (rawUrl.includes("uddg=")) {
              try {
                const urlObj = new URL("https://html.duckduckgo.com" + rawUrl);
                const decoded = urlObj.searchParams.get("uddg");
                if (decoded) rawUrl = decoded;
              } catch {}
            }

            title = title.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");
            snippet = snippet.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

            searchData.push({ title, url: rawUrl, snippet });
            sources.push({ title, url: rawUrl });
            count++;
          }

          if (searchData.length > 0) {
            searchResultsContext = `\n\n[REAL-TIME LIVE SEARCH GROUNDING DATA - Sourced dynamically from Google/DDG Search for "${prompt}"]:\n` +
              searchData.map((res, i) => `Source #${i + 1}:\nTitle: ${res.title}\nURL: ${res.url}\nSnippets: ${res.snippet}`).join("\n\n") + 
              `\n\nUse the above REAL-TIME search data to formulate an accurate response. Integrate these fresh facts as absolute truth. Address current events directly, and naturally cite the relevant links or parameters mentioned above.`;
          }
        }
      } catch (searchErr) {
        console.error("Live scrap lookup failed:", searchErr);
      }
    }

    // Build standard cognitive memory instruction
    const memoriesContext = memories && memories.length > 0
      ? `The user has the following long-term mental preferences / cognitive facts recorded about themselves:\n${memories.map((m: string, idx: number) => `${idx + 1}. ${m}`).join("\n")}\n\nUse these memories to personalize your response and reference them contextually when appropriate.`
      : `The user has no long-term cognitive memories recorded yet. Encourage the user to share facts or preferences that you can automatically memorize across conversations if they mention them.`;

    const systemInstruction = `You are 'Zyntros AI', an advanced, context-aware AI companion holding persistent long-term cognitive memory.
You write in a clean, highly structured, elegant Markdown layout. Avoid conversational filler or meta-rambling.
Speak directly to the user as an intellectual companion.

${memoriesContext}
${searchResultsContext ? searchResultsContext : "\n(Note: No real-time search was requested or classified for this request. Respond using your internal cognitive parameters.)"}

Answer the user with absolute logic, clean presentation, and clear structural layout.`;

    // Map history to standard OpenAI / Groq messages format
    const messages: any[] = [
      { role: "system", content: systemInstruction }
    ];
    
    // Add history if present
    if (history && Array.isArray(history)) {
      history.forEach((msg) => {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content
        });
      });
    }

    // Add current prompt
    messages.push({
      role: "user",
      content: prompt
    });

    // Make completion call to Groq
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.7,
      })
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      throw new Error(`Groq API error (status ${groqResponse.status}): ${errorText}`);
    }

    const data = await groqResponse.json();
    const responseText = data.choices?.[0]?.message?.content || "";

    return NextResponse.json({
      text: responseText,
      searchQuery: searchQueryUsed || undefined,
      sources: sources.length > 0 ? sources : undefined,
    });

  } catch (err: any) {
    console.error("API Error in Route handler:", err);
    return NextResponse.json(
      { error: err.message || "An unexpected server error occurred" },
      { status: 500 }
    );
  }
}
