import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json({ title: "New Session" });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
            content: "You are an assistant that summarizes a user prompt into a short, concise, elegant chat session title. The title MUST be 2 to 5 words long. Do NOT use quotes, colon, or punctuation, and keep it human-like and direct. Return only the plain title."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 15,
      })
    });

    if (response.ok) {
      const data = await response.json();
      let title = data.choices?.[0]?.message?.content?.trim() || "New Session";
      // Clean quotes if LLM outputs them
      title = title.replace(/^["']|["']$/g, "").trim();
      return NextResponse.json({ title });
    }

    return NextResponse.json({ title: "New Session" });
  } catch (err) {
    console.error("Failed to auto-generate chat title:", err);
    return NextResponse.json({ title: "New Session" });
  }
}
