import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/gemini";
import { Type } from "@google/genai";
import { SKILL_REGISTRY } from "./skills";

export async function POST(req: NextRequest) {
  try {
    const { messages, gallerySummary = [], agentReferenceId, agentReferences = [] } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    const customKey = req.headers.get("x-gemini-api-key") || undefined;
    const ai = getGeminiClient(customKey);

    // Get the latest user query to perform smart skill routing
    const latestUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";

    // Step 1: LLM Router Pass to select 2~4 active skills
    let activeSkillsList: string[] = ["PromptEngineer", "ImageGenerator"]; // Fallbacks
    try {
      const routingSystemPrompt =
        "You are the Intelligent Skill Router for the Imagine Workbench.\n" +
        "Analyze the user's creative request and conversation history, then select the 2 to 4 most relevant skills from the provided registry that are needed to fulfill or discuss the user's intent.\n" +
        "Return ONLY a raw JSON array of the selected skill names.\n\n" +
        "Available Skills:\n" +
        SKILL_REGISTRY.map(s => `- ${s.name}: ${s.description} (Category: ${s.category}, Trigger: ${s.whenToUse})`).join("\n");

      const routerResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { role: "user", parts: [{ text: `Conversation History:\n${messages.slice(-4).map((m: any) => `${m.role}: ${m.content}`).join("\n")}\n\nLatest Request: "${latestUserMsg}"` }] }
        ],
        config: {
          systemInstruction: routingSystemPrompt,
          temperature: 0.1, // High precision
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });

      const parsedRouter = JSON.parse(routerResponse.text?.trim() || "[]");
      if (Array.isArray(parsedRouter) && parsedRouter.length > 0) {
        // Intersect with valid skills
        const validNames = SKILL_REGISTRY.map(s => s.name);
        const filtered = parsedRouter.filter(name => validNames.includes(name));
        if (filtered.length > 0) {
          activeSkillsList = filtered;
        }
      }
    } catch (routeErr) {
      console.warn("Skill Router failed, using default fallback skills:", routeErr);
    }

    // Always ensure CreativePlanner is included for complex ideas, or at least 2 skills
    if (latestUserMsg.length > 50 && !activeSkillsList.includes("CreativePlanner")) {
      activeSkillsList.push("CreativePlanner");
    }

    // Retrieve full metadata for only the activated skills
    const activatedSkills = SKILL_REGISTRY.filter(s => activeSkillsList.includes(s.name));

    // Format the gallery profile for the Agent's context
    const galleryContext = gallerySummary.length > 0
      ? gallerySummary.map((item: any) => `- ID: "${item.id}", Type: ${item.type}, AspectRatio: ${item.aspectRatio}, Brief Prompt: "${item.prompt.substring(0, 60)}..."`).join("\n")
      : "No items generated in this session yet.";

    // Normalize the references list to support both array & single fallback
    const normalizedAgentRefs = [...agentReferences];
    if (normalizedAgentRefs.length === 0 && agentReferenceId) {
      const match = gallerySummary.find((x: any) => x.id === agentReferenceId);
      normalizedAgentRefs.push({ id: agentReferenceId, url: match?.url || "" });
    }

    const referenceMsg = normalizedAgentRefs.length > 0
      ? `\n[CRITICAL USER REFERENCES] The user has explicitly SELECTED or TAGGED reference image(s) to perform editing or reference as direct context:\n` +
        normalizedAgentRefs.map((item: any, idx: number) => `- Reference [${idx + 1}]: ID "${item.id}" (use this ID for referenceImageId if requested to edit or mutate).`).join("\n") +
        `\nWhen recommending 'edit_image' or 'generate_video', specify the target reference ID (e.g., "${normalizedAgentRefs[normalizedAgentRefs.length - 1].id}") in the 'referenceImageId' parameter of recommendedAction.`
      : "";

    // Step 2: Build highly focused System Prompt based ONLY on activated skills
    const skillsDetailText = activatedSkills.map((s, idx) => {
      return `### Skill [${idx + 1}]: ${s.name} (${s.category.toUpperCase()})
- Description: ${s.description}
- Examples / Patterns:
${s.examples.map(ex => `  * ${ex}`).join("\n")}`;
    }).join("\n\n");

    const systemInstruction =
      "You are the senior Creative Agent of the Imagine Workbench (灵感创作工作台).\n" +
      "Your goal is to collaborate with the user on complex, multi-step creative projects (like films, manga visual bards, game assets, or campaigns).\n" +
      "You are fully context-aware and can build, edit, or reference workspace items in chain actions.\n\n" +
      "Currently Generated Workspace Assets:\n" +
      `${galleryContext}\n\n` +
      `${referenceMsg}\n\n` +
      "⚡ [DYNAMICAL SKILLS LOADED FOR THIS TURN]\n" +
      "The intelligent router has loaded only the most relevant expert skills for this conversation to prevent context dilution. Use these specific specialized capabilities to formulate your plan:\n" +
      `${skillsDetailText}\n\n` +
      "Core Actions you can recommend in 'recommendedAction':\n" +
      "1. 'none' - For chatting, explaining design guidelines, or brainstorming.\n" +
      "2. 'optimize_prompt' - For expanding and refining crude prompts.\n" +
      "3. 'generate_image' - Create image. Requires: prompt, model, aspectRatio.\n" +
      "4. 'edit_image' - Modify cropped parts or entire image (img2img). Requires: prompt, model, referenceImageId.\n" +
      "5. 'generate_video' - Generate video. If using an image as starting/motion frame, specify referenceImageId.\n\n" +
      "Rule of Operation:\n" +
      "- Think through your design strategy, explain your rationale in the 'thought' field, and write a friendly Chinese conversational feedback in 'text' (use professional visual design terms).\n" +
      "- Select the single best tool action in 'recommendedAction'.\n" +
      "- Suggest 2-3 logical follow-ups in 'suggestedFollowUps'.\n" +
      "- Echo the selected active skills names back in 'activeSkills' to acknowledge your current operations.";

    // Format chat contents for content generation
    const contents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Configure JSON structural schema including activeSkills list
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        thought: {
          type: Type.STRING,
          description: "Internal analysis, strategy, reasoning, planning logic, or step splits."
        },
        text: {
          type: Type.STRING,
          description: "Friendly conversational response, design rationale, or briefing in Chinese."
        },
        activeSkills: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "The list of skill names that were used and echoed to demonstrate active expertise."
        },
        recommendedAction: {
          type: Type.OBJECT,
          description: "Structured action recommended to run on the workstation assets.",
          properties: {
            type: {
              type: Type.STRING,
              description: "Action type. Must be 'none', 'optimize_prompt', 'generate_image', 'edit_image', or 'generate_video'."
            },
            params: {
              type: Type.OBJECT,
              description: "Configuration arguments.",
              properties: {
                prompt: { type: Type.STRING, description: "The refined text prompt to use for the creation tool." },
                model: { type: Type.STRING, description: "Target model ID (e.g., 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image', 'veo-3.1-lite-generate-preview')" },
                aspectRatio: { type: Type.STRING, description: "Aspect ratio ('1:1', '16:9', '9:16', '4:3', '3:4')" },
                referenceImageId: { type: Type.STRING, description: "The gallery item ID to reference as seed or starting frame (crucial for img2img and image-to-video)." }
              }
            }
          },
          required: ["type"]
        },
        suggestedFollowUps: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "2-3 scannable next-step suggestions for quick tapping."
        }
      },
      required: ["thought", "text", "recommendedAction"]
    };

    console.log(`Generating agent reply with dynamically active skills: [${activeSkillsList.join(", ")}]`);
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.75,
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    const parsedResponse = JSON.parse(response.text?.trim() || "{}");
    
    // Inject selected skill names to response just in case LLM didn't return them perfectly
    if (!parsedResponse.activeSkills || !Array.isArray(parsedResponse.activeSkills)) {
      parsedResponse.activeSkills = activeSkillsList;
    }

    return NextResponse.json(parsedResponse);

  } catch (err: any) {
    console.error("Agent interaction failure:", err);
    return NextResponse.json({
      thought: "An error occurred inside the agent pipeline. Setting fallback response.",
      text: `抱歉，极智大脑连接遇到一点小状况 (${err.message || "Unknown error"})，让我们重新整理思路重试。`,
      activeSkills: ["PromptEngineer"],
      recommendedAction: { type: "none" },
      suggestedFollowUps: ["重试对话", "直接去生图", "导入创意参考图"]
    });
  }
}

