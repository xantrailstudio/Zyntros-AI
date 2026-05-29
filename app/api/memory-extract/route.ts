import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { userText } = await req.json();

    if (!userText || typeof userText !== "string" || userText.trim().length === 0) {
      return NextResponse.json({ memories: [] });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      // Fail gracefully without crashing when key is missing on startup
      return NextResponse.json({ memories: [] });
    }

    const systemInstruction = `You are a high-performance semantic memory extractor. Extract any user-related facts, social connections (family, friends, cousins, colleagues, names), interests, preferences, constraints, likes, dislikes, habits, or biographical information the user mentions or implies in their input text.
Return ONLY critical facts, names, relationships, or preferences that are worth remembering for future personal chat context, written from a third-person narrative standpoint starting with "The user... " (e.g. "The user has a cousin named Ahsan", "The user is colorblind to red and green", "The user plays acoustic guitar").
Never invent facts, never include conversational words, and never record temporary emotions, current state, or one-time greetings.
If the input statement does not contain permanent personal facts or attributes about the user, their family, or their social circle, return an empty array under the 'memories' key.

YOU MUST RESPOND ONLY with a valid JSON object matching this structure:
{
  "memories": ["extracted fact 1", "extracted fact 2"]
}
Do not include any Markdown, backticks, or any conversational wrapper.`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqApiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userText }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.warn("Groq memory extraction request failed:", errText);
      return NextResponse.json({ memories: [] });
    }

    const data = await groqResponse.json();
    let contentText = data.choices?.[0]?.message?.content?.trim() || "{}";
    
    // Parse the JSON strictly with markdown-stripping support
    try {
      if (contentText.startsWith("```")) {
        contentText = contentText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(contentText.trim());
      if (parsed && Array.isArray(parsed.memories)) {
        return NextResponse.json({ memories: parsed.memories });
      }
    } catch (parseErr) {
      console.error("Failed to parse Groq extraction JSON content:", contentText, parseErr);
    }

    return NextResponse.json({ memories: [] });

  } catch (err: any) {
    console.error("Memory Extraction Error:", err);
    return NextResponse.json({ memories: [] }); // Fail gracefully returning no extractions
  }
}

