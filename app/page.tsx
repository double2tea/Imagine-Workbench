'use client';

import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  Settings, 
  Trash2, 
  Download, 
  Paintbrush, 
  Check, 
  X, 
  RefreshCw, 
  Play, 
  Pause, 
  Search, 
  Send, 
  Layers, 
  Sliders, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  ChevronRight, 
  FileArchive, 
  Maximize2,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import JSZip from "jszip";
import { VISUAL_PRESETS, VisualPreset } from "@/components/PresetStyles";
import CanvasMaskEditor from "@/components/CanvasMaskEditor";
import { saveToDB, getAllFromDB, deleteFromDB, clearAllDB, StorageItem } from "@/lib/db";

// Reference image object structure for multiple selection support
export interface ReferenceImageRef {
  id: string;
  url: string;
  role?: "start" | "end" | "general";
}

// Chat definition for Agent Mode
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thought?: string;
  recommendedAction?: {
    type: "none" | "optimize_prompt" | "generate_image" | "edit_image" | "generate_video";
    params?: {
      prompt?: string;
      model?: string;
      aspectRatio?: string;
      referenceImageId?: string;
    };
  };
  suggestedFollowUps?: string[];
  interactiveState?: "idle" | "executing" | "completed" | "declined";
  activeSkills?: string[];
}

export default function Home() {
  // Database State
  const [items, setItems] = useState<StorageItem[]>([]);
  
  // Traditional Form States
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash-image");
  const [selectedVideoModel, setSelectedVideoModel] = useState("veo-3.1-lite-generate-preview");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("1K");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"traditional" | "agent">("traditional");
  const [traditionalSubTab, setTraditionalSubTab] = useState<"image" | "video">("image");

  const applyAsVideoReference = (imageUrl: string) => {
    setReferenceImage(imageUrl);
    setActiveTab("traditional");
    setTraditionalSubTab("video");
  };

  // Filter & UI Select States
  const [filterType, setFilterType] = useState<"all" | "images" | "videos">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareItemIds, setCompareItemIds] = useState<string[]>([]);
  const [compareViewType, setCompareViewType] = useState<"side-by-side" | "wipe-slider">("side-by-side");
  const [compareSliderPos, setCompareSliderPos] = useState(50);

  // Agent State
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "您好！我是您的智能创意代理（Agent Mode）。您可以随时通过聊天交办高阶创意任务。例如：「帮我做一套3张赛博朋克风战士的相册」或「帮我把上一部图片转成16:9的微短视频」。我会自主为您写提示词、渲染资产、并在确认后一键执行！",
      thought: "初始化创意代理面板，准备读取画廊资产上下文...",
      suggestedFollowUps: [
        "优化并生成一张赛博朋克飞艇",
        "我想做一段太空科幻题材视频",
        "使用传统模式尝试手工控制"
      ]
    }
  ]);
  const [agentInput, setAgentInput] = useState("");
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [countdownId, setCountdownId] = useState<NodeJS.Timeout | null>(null);
  const [activeCountdownId, setActiveCountdownId] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(3);

  // Settings State
  const [customApiKey, setCustomApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Interactive Mask Editor State
  const [isMaskOpen, setIsMaskOpen] = useState(false);
  const [maskTargetUrl, setMaskTargetUrl] = useState("");
  const [maskTargetId, setMaskTargetId] = useState("");

  // Fullscreen Preview Overlay State
  const [fullscreenItem, setFullscreenItem] = useState<StorageItem | null>(null);

  // Agent Reference States (Support Multiple)
  const [referenceImages, setReferenceImages] = useState<ReferenceImageRef[]>([]);
  const [agentReferences, setAgentReferences] = useState<ReferenceImageRef[]>([]);

  // Agent Reference States
  const [agentReferenceId, setAgentReferenceId] = useState<string | null>(null);
  const [agentReferenceUrl, setAgentReferenceUrl] = useState<string | null>(null);

  // At dropdown state
  const [atDropdown, setAtDropdown] = useState<{
    visible: boolean;
    type: "image-prompt" | "video-prompt" | "agent-prompt";
    search: string;
  }>({ visible: false, type: "image-prompt", search: "" });

  // References
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const autoCountdownInterval = useRef<NodeJS.Timeout | null>(null);

  // Load items from database on mount
  useEffect(() => {
    async function loadWorkspace() {
      const allItems = await getAllFromDB();
      setItems(allItems);
    }
    loadWorkspace();

    // Check localStorage for API Key preference
    const storedKey = localStorage.getItem("imagine_custom_api_key");
    if (storedKey) setCustomApiKey(storedKey);

    const storedAutoExec = localStorage.getItem("imagine_auto_execute");
    if (storedAutoExec) setAutoExecute(storedAutoExec === "true");
  }, []);

  // Listen to clipboard paste events globally to import reference images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;
      for (const item of clipboardItems) {
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
              const base64 = event.target?.result as string;
              // Create imported asset
              const newAssetId = `import_${Date.now()}`;
              const newAsset: StorageItem = {
                id: newAssetId,
                type: "image",
                url: base64,
                prompt: "📋 粘贴导入的创意参考图 (Pasted Reference Image)",
                model: "Imported Local File",
                aspectRatio: "1:1",
                createdAt: new Date().toISOString(),
                status: "complete",
                progress: 100,
              };
              await saveToDB(newAsset);
              setItems(prev => [newAsset, ...prev]);
              
              // Set reference image context
              setReferenceImage(base64);
              setAgentReferenceId(newAssetId);
              setAgentReferenceUrl(base64);
              setReferenceImages(prev => {
                if (prev.some(r => r.id === newAssetId)) return prev;
                return [...prev, { id: newAssetId, url: base64, role: "general" }];
              });
              setAgentReferences(prev => {
                if (prev.some(r => r.id === newAssetId)) return prev;
                return [...prev, { id: newAssetId, url: base64 }];
              });
              alert("📋 识别到剪贴板图像！已成功作为参考图导入画廊。");
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Scroll to bottom of agent chat as new messages arrived
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentMessages, isAgentLoading]);

  // Video Polling engine - checks processing operations every 4 seconds
  useEffect(() => {
    const processingItems = items.filter(x => x.status === "processing" && x.operationName);
    if (processingItems.length === 0) return;

    const interval = setInterval(async () => {
      let changed = false;
      const updatedList = [...items];

      for (let i = 0; i < updatedList.length; i++) {
        const item = updatedList[i];
        if (item.status === "processing" && item.operationName) {
          try {
            console.log(`Polling status for operation: ${item.operationName}`);
            const headers: Record<string, string> = {};
            if (customApiKey) headers["x-gemini-api-key"] = customApiKey;

            const res = await fetch("/api/gemini/video-status", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...headers },
              body: JSON.stringify({ operationName: item.operationName }),
            });

            if (res.ok) {
              const statusData = await res.json();
              if (statusData.done) {
                // Completed! Trigger download
                console.log(`Operation done! Fetching final MP4 download: ${item.operationName}`);
                const dlRes = await fetch("/api/gemini/video-download", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...headers },
                  body: JSON.stringify({ operationName: item.operationName }),
                });

                if (dlRes.ok) {
                  const blob = await dlRes.blob();
                  const reader = new FileReader();
                  reader.onloadend = async () => {
                    const base64data = reader.result as string;
                    updatedList[i] = {
                      ...item,
                      url: base64data,
                      status: "complete",
                      progress: 100,
                    };
                    await saveToDB(updatedList[i]);
                    setItems([...updatedList]);
                  };
                  reader.readAsDataURL(blob);
                  changed = true;
                } else {
                  throw new Error("Download stream failed");
                }
              } else {
                // Update progress percentages
                if (item.progress !== statusData.progress) {
                  updatedList[i] = {
                    ...item,
                    progress: statusData.progress || 50,
                  };
                  await saveToDB(updatedList[i]);
                  changed = true;
                }
              }
            }
          } catch (e) {
            console.error(`Polling failed for ${item.id}:`, e);
          }
        }
      }

      if (changed) {
        setItems(updatedList);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [items, customApiKey]);

  // Handle setting API keys securely inside local tab variables
  const handleSaveApiKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("imagine_custom_api_key", key);
  };

  const handleToggleAutoExecute = (val: boolean) => {
    setAutoExecute(val);
    localStorage.setItem("imagine_auto_execute", String(val));
    if (!val) {
      clearActiveCountdown();
    }
  };

  // Preset quick injection
  const applyPreset = (preset: VisualPreset) => {
    let base = prompt.trim();
    const hasPreset = base.includes(preset.promptSuffix);
    
    // Remove any previously appended preset suffixes to allow seamless switching
    VISUAL_PRESETS.forEach(p => {
      if (base.includes(`, ${p.promptSuffix}`)) {
        base = base.replace(`, ${p.promptSuffix}`, "");
      } else if (base.includes(p.promptSuffix)) {
        base = base.replace(p.promptSuffix, "");
      }
    });
    
    // Clean up trailing/leading commas or whitespace
    base = base.trim().replace(/^,|,$/g, "").trim();

    if (hasPreset) {
      // Toggle off
      setPrompt(base);
      if (preset.negativePrompt && negativePrompt === preset.negativePrompt) {
        setNegativePrompt("");
      }
    } else {
      // Toggle on and apply new suffix
      if (base) {
        setPrompt(`${base}, ${preset.promptSuffix}`);
      } else {
        setPrompt(preset.promptSuffix);
      }
      if (preset.negativePrompt) {
        setNegativePrompt(preset.negativePrompt);
      }
    }
  };

  // Optimize prompt inside text area utilizing Gemini client model
  const optimizeActivePrompt = async () => {
    if (!prompt.trim()) return;
    setIsOptimizing(true);
    try {
      const headers: Record<string, string> = {};
      if (customApiKey) headers["x-gemini-api-key"] = customApiKey;

      const res = await fetch("/api/gemini/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ prompt }),
      });

      if (res.ok) {
        const data = await res.json();
        setPrompt(data.optimized || prompt);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Launch Traditional Image generator call
  const generateManualImage = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    
    // Create pre-queued item in memory immediately
    const tempId = `temp_img_${Date.now()}`;
    const newItem: StorageItem = {
      id: tempId,
      type: "image",
      url: "https://picsum.photos/800/800", // temp fallback placeholder display
      prompt: prompt,
      model: selectedModel,
      aspectRatio: aspectRatio,
      createdAt: new Date().toISOString(),
      status: "pending",
      progress: 30,
    };

    setItems(prev => [newItem, ...prev]);

    try {
      const headers: Record<string, string> = {};
      if (customApiKey) headers["x-gemini-api-key"] = customApiKey;

      const res = await fetch("/api/gemini/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          prompt,
          model: selectedModel,
          aspectRatio,
          imageSize,
          referenceImage: referenceImages[0]?.url || referenceImage || undefined,
          referenceImages: referenceImages.map(r => r.url),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const completedItem: StorageItem = {
          ...newItem,
          id: `img_${Date.now()}`,
          url: data.imageUrl,
          status: "complete",
          progress: 100,
        };
        
        // Remove temp and insert completed item
        await saveToDB(completedItem);
        setItems(prev => [completedItem, ...prev.filter(x => x.id !== tempId)]);
      } else {
        throw new Error("HTTP error on image render");
      }
    } catch (e: any) {
      console.error(e);
      const failedItem: StorageItem = {
        ...newItem,
        status: "failed",
      };
      await saveToDB(failedItem);
      setItems(prev => [failedItem, ...prev.filter(x => x.id !== tempId)]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Launch Traditional Veo Video generator call
  const generateManualVideo = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);

    const tempId = `temp_vid_${Date.now()}`;
    const newItem: StorageItem = {
      id: tempId,
      type: "video",
      url: "",
      prompt: prompt,
      model: selectedVideoModel,
      aspectRatio: aspectRatio,
      createdAt: new Date().toISOString(),
      status: "processing",
      progress: 12,
    };

    setItems(prev => [newItem, ...prev]);

    try {
      const headers: Record<string, string> = {};
      if (customApiKey) headers["x-gemini-api-key"] = customApiKey;

      const startImg = referenceImages.find(r => r.role === "start")?.url || referenceImages[0]?.url || referenceImage || undefined;
      const endImg = referenceImages.find(r => r.role === "end")?.url || referenceImages[1]?.url || undefined;

      const res = await fetch("/api/gemini/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          prompt,
          image: startImg,
          lastFrame: endImg,
          images: referenceImages.map(r => r.url),
          aspectRatio,
          model: selectedVideoModel,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const activeOperationName = data.operationName;
        
        // Save polling handle
        const compilingItem: StorageItem = {
          ...newItem,
          id: `vid_${Date.now()}`,
          operationName: activeOperationName,
          status: "processing",
        };

        await saveToDB(compilingItem);
        setItems(prev => [compilingItem, ...prev.filter(x => x.id !== tempId)]);
      } else {
        throw new Error("Video generation request failed");
      }
    } catch (e) {
      console.error(e);
      const failedItem: StorageItem = {
        ...newItem,
        status: "failed",
      };
      await saveToDB(failedItem);
      setItems(prev => [failedItem, ...prev.filter(x => x.id !== tempId)]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Launch file reader for reference seed upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const newAssetId = `upload_${Date.now()}`;
      const newAsset: StorageItem = {
        id: newAssetId,
        type: "image",
        url: base64,
        prompt: `📋 上传导入的参考图 (${file.name || "Uploaded Image"})`,
        model: "Uploaded Reference File",
        aspectRatio: "1:1",
        createdAt: new Date().toISOString(),
        status: "complete",
        progress: 100,
      };
      await saveToDB(newAsset);
      setItems(prev => [newAsset, ...prev]);

      setReferenceImage(base64);
      setReferenceImages(prev => {
        if (prev.some(r => r.id === newAssetId)) return prev;
        return [...prev, { id: newAssetId, url: base64, role: "general" }];
      });
    };
    reader.readAsDataURL(file);
  };

  const removeReferenceImage = (id: string) => {
    setReferenceImages(prev => {
      const filtered = prev.filter(r => r.id !== id);
      if (filtered.length === 0) {
        setReferenceImage(null);
      } else {
        setReferenceImage(filtered[0].url);
      }
      return filtered;
    });
  };

  const toggleReferenceRole = (id: string, role: "start" | "end" | "general") => {
    setReferenceImages(prev => prev.map(r => {
      if (r.id === id) {
        return { ...r, role };
      }
      if ((role === "start" || role === "end") && r.role === role) {
        return { ...r, role: "general" };
      }
      return r;
    }));
  };

  // Floating selection tools management
  const toggleSelectItem = (id: string, e?: React.MouseEvent) => {
    if (e && e.shiftKey && selectedItemIds.length > 0) {
      // Handle Shift+Click range selection
      const allDisplayItems = filterAndSearchItems();
      const lastSelectedIdx = allDisplayItems.findIndex(x => x.id === selectedItemIds[selectedItemIds.length - 1]);
      const currentSelectedIdx = allDisplayItems.findIndex(x => x.id === id);
      
      if (lastSelectedIdx !== -1 && currentSelectedIdx !== -1) {
        const start = Math.min(lastSelectedIdx, currentSelectedIdx);
        const end = Math.max(lastSelectedIdx, currentSelectedIdx);
        const slicedIds = allDisplayItems.slice(start, end + 1).map(x => x.id);
        
        setSelectedItemIds(prev => Array.from(new Set([...prev, ...slicedIds])));
        return;
      }
    }

    if (selectedItemIds.includes(id)) {
      setSelectedItemIds(prev => prev.filter(x => x !== id));
    } else {
      setSelectedItemIds(prev => [...prev, id]);
    }
  };

  const handleClearSelection = () => {
    setSelectedItemIds([]);
  };

  // Batch delete items
  const handleBatchDelete = async () => {
    if (selectedItemIds.length === 0) return;
    if (confirm(`确定要彻底删除已选中的 ${selectedItemIds.length} 项创意资产吗？`)) {
      for (const id of selectedItemIds) {
        await deleteFromDB(id);
      }
      setItems(prev => prev.filter(x => !selectedItemIds.includes(x.id)));
      setSelectedItemIds([]);
      setCompareItemIds([]);
    }
  };

  // Compiles and exports selected assets inside a single ZIP with mapping layout JSON
  const handleBatchDownloadZip = async () => {
    if (selectedItemIds.length === 0) return;
    const itemsToExport = items.filter(x => selectedItemIds.includes(x.id));
    
    const zip = new JSZip();
    const metadataList: any[] = [];

    await Promise.all(itemsToExport.map(async (item) => {
      const extension = item.type === "image" ? "png" : "mp4";
      const fileName = `creation_${item.id}.${extension}`;
      
      // Metadata mapping output
      metadataList.push({
        id: item.id,
        fileName: fileName,
        type: item.type,
        prompt: item.prompt,
        model: item.model,
        aspectRatio: item.aspectRatio,
        createdAt: item.createdAt,
      });

      try {
        if (item.url && item.url.startsWith("data:")) {
          const parts = item.url.split(";base64,");
          if (parts.length === 2) {
            zip.file(fileName, parts[1], { base64: true });
          }
        } else if (item.url) {
          // Fetch remote files and package them as blobs directly
          const fileRes = await fetch(item.url);
          if (fileRes.ok) {
            const blob = await fileRes.blob();
            zip.file(fileName, blob);
          } else {
            // Fallback to text link if fetching fails
            zip.file(`link_fallback_${item.id}.txt`, item.url);
          }
        }
      } catch (err) {
        console.error(`Error adding file ${item.id} to zip:`, err);
        zip.file(`error_log_${item.id}.txt`, `Failed to fetch from: ${item.url}\nError: ${err}`);
      }
    }));

    // Save metadata JSON
    zip.file("workspace_metadata.json", JSON.stringify(metadataList, null, 2));

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `Imagine_Workbench_Export_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Compare mode selections
  const toggleCompare = (id: string) => {
    if (compareItemIds.includes(id)) {
      setCompareItemIds(prev => prev.filter(x => x !== id));
    } else {
      let nextBatch: string[] = [];
      if (compareItemIds.length >= 2) {
        nextBatch = [compareItemIds[1], id];
      } else {
        nextBatch = [...compareItemIds, id];
      }
      setCompareItemIds(nextBatch);
      if (nextBatch.length === 2) {
        // Auto show comparison workspace
        setIsCompareMode(true);
        // Reset slider position
        setCompareSliderPos(50);
        
        // Find if they are both images
        const matchA = items.find(x => x.id === nextBatch[0]);
        const matchB = items.find(x => x.id === nextBatch[1]);
        if (matchA?.type === "image" && matchB?.type === "image") {
          setCompareViewType("wipe-slider"); // default to interactive awesome slider for images!
        } else {
          setCompareViewType("side-by-side");
        }
      }
    }
  };

  // Filter and searches combined
  const filterAndSearchItems = () => {
    return items.filter(item => {
      // filter type
      if (filterType === "images" && item.type !== "image") return false;
      if (filterType === "videos" && item.type !== "video") return false;

      // search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return item.prompt.toLowerCase().includes(query) || item.model.toLowerCase().includes(query);
      }
      return true;
    });
  };

  // Launch mask editor layout dialog
  const launchMaskEditor = (imageUrl: string, id: string) => {
    setMaskTargetUrl(imageUrl);
    setMaskTargetId(id);
    setIsMaskOpen(true);
  };

  const saveMaskOutput = (mergedImageBase64: string, maskBase64: string) => {
    if (activeTab === "agent") {
      setAgentReferenceUrl(mergedImageBase64);
      if (!agentInput.includes("modify the marked region")) {
        setAgentInput(`In the marked region, change: `);
      }
    } else {
      // Inject drew brush directly into reference seeds
      setReferenceImage(mergedImageBase64);
      // Auto populate helper suggestions into Prompt box
      if (!prompt.includes("modify the marked region")) {
        setPrompt(`In the marked region of the image, change: ${prompt || "[输入你的新修改构想...]"}`);
      }
      // Set active model to nano banana image editing
      setSelectedModel("gemini-2.5-flash-image");
      // Smooth scroll to top/traditional panel to alert user
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setIsMaskOpen(false);
  };

  // Live @ reference typing handler
  const handleTextareaChange = (val: string, type: "image-prompt" | "video-prompt" | "agent-prompt") => {
    if (type === "agent-prompt") {
      setAgentInput(val);
    } else {
      setPrompt(val);
    }

    const lastAtIdx = val.lastIndexOf("@");
    if (lastAtIdx !== -1 && lastAtIdx >= val.length - 15) {
      const searchPart = val.substring(lastAtIdx + 1);
      if (!searchPart.includes(" ") && !searchPart.includes("\n")) {
        setAtDropdown({ visible: true, type, search: searchPart });
        return;
      }
    }
    setAtDropdown({ visible: false, type, search: "" });
  };

  const handleSelectAtItem = (itemUrl: string, itemId: string, type: "image-prompt" | "video-prompt" | "agent-prompt") => {
    if (type === "agent-prompt") {
      const lastAtIdx = agentInput.lastIndexOf("@");
      const base = lastAtIdx !== -1 ? agentInput.substring(0, lastAtIdx) : agentInput;
      setAgentInput(`${base}[Ref: ${itemId}] `);
      setAgentReferenceId(itemId);
      setAgentReferenceUrl(itemUrl);
      setAgentReferences(prev => {
        if (prev.some(r => r.id === itemId)) return prev;
        return [...prev, { id: itemId, url: itemUrl }];
      });
    } else {
      const lastAtIdx = prompt.lastIndexOf("@");
      const base = lastAtIdx !== -1 ? prompt.substring(0, lastAtIdx) : prompt;
      setPrompt(`${base}[Ref: ${itemId}] `);
      setReferenceImage(itemUrl);
      setReferenceImages(prev => {
        if (prev.some(r => r.id === itemId)) return prev;
        const role = type === "video-prompt" && prev.length === 1 ? "end" : (prev.length === 0 ? "start" : "general");
        return [...prev, { id: itemId, url: itemUrl, role }];
      });
    }
    setAtDropdown({ visible: false, type, search: "" });
  };

  const renderAtDropdown = (type: "image-prompt" | "video-prompt" | "agent-prompt") => {
    const searchableImages = items.filter(x => x.type === "image" && x.status === "complete");
    const filtered = searchableImages.filter(x => 
      x.id.toLowerCase().includes(atDropdown.search.toLowerCase()) || 
      x.prompt.toLowerCase().includes(atDropdown.search.toLowerCase())
    );

    if (filtered.length === 0) {
      return (
        <div className="absolute left-0 right-0 bottom-full mb-2 bg-[#0e0e12] border border-white/5 rounded-xl p-3 text-center text-[11px] text-slate-550 select-none shadow-xl z-50">
          🔍 未找到可引用的完成图像
        </div>
      );
    }

    return (
      <div className="absolute left-0 right-0 bottom-full mb-2 bg-[#0e0e15]/95 backdrop-blur-md border border-blue-500/30 rounded-xl shadow-2xl p-2.5 z-50 max-h-52 overflow-y-auto w-full select-none flex flex-col gap-1.5">
        <p className="text-[9px] font-bold text-blue-400 px-2 uppercase tracking-wider mb-1 flex items-center justify-between">
          <span>📎 快捷@引用参考图 (Select reference image)</span>
          <span className="text-[8px] text-slate-400 font-mono">共 {filtered.length} 张可用</span>
        </p>
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelectAtItem(item.url, item.id, type)}
            className="w-full flex items-center gap-2.5 p-1.5 hover:bg-white/5 hover:border-white/10 rounded-lg text-left transition select-none cursor-pointer border border-transparent"
          >
            <div className="h-8 w-8 rounded overflow-hidden bg-slate-950 shrink-0 border border-white/5">
              <img src={item.url} alt="at option" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono font-bold text-blue-400 truncate">
                ID: {item.id.substring(0, 12)}
              </p>
              <p className="text-[9px] text-slate-400 truncate">
                {item.prompt}
              </p>
            </div>
          </button>
        ))}
      </div>
    );
  };

  // Clears active timeouts
  const clearActiveCountdown = () => {
    if (countdownId) clearTimeout(countdownId);
    if (autoCountdownInterval.current) clearInterval(autoCountdownInterval.current);
    setCountdownId(null);
    setActiveCountdownId(null);
    setCountdownSeconds(3);
  };

  // Run the Agent chat-completion query
  const submitAgentPrompt = async (forcedPrompt?: string) => {
    const activeText = (forcedPrompt || agentInput).trim();
    if (!activeText) return;

    clearActiveCountdown();

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: "user",
      content: activeText,
    };

    setAgentMessages(prev => [...prev, userMsg]);
    setAgentInput("");
    setIsAgentLoading(true);

    try {
      const gallerySummary = items.map(x => ({
        id: x.id,
        type: x.type,
        prompt: x.prompt,
        aspectRatio: x.aspectRatio,
      }));

      const headers: Record<string, string> = {};
      if (customApiKey) headers["x-gemini-api-key"] = customApiKey;

      // Construct sliding window history for request
      const requestHistory = agentMessages
        .concat(userMsg)
        .slice(-10) // last 10 dialogs
        .map(x => ({
          role: x.role,
          content: x.content,
        }));

      const res = await fetch("/api/gemini/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          messages: requestHistory,
          gallerySummary,
          agentReferences: agentReferences.map(r => ({ id: r.id, url: r.url })),
          agentReferenceId: agentReferences[0]?.id || agentReferenceId || undefined,
        }),
      });

      if (res.ok) {
        const agentResponse = await res.json();
        const assistantMsgId = `asst_${Date.now()}`;
        
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: "assistant",
          content: agentResponse.text || "我已收到指令，该项目可以怎么推进？",
          thought: agentResponse.thought || "分析场景，规划后续设计合成步骤...",
          recommendedAction: agentResponse.recommendedAction || { type: "none" },
          suggestedFollowUps: agentResponse.suggestedFollowUps || [],
          interactiveState: "idle",
          activeSkills: agentResponse.activeSkills || [],
        };

        setAgentMessages(prev => [...prev, assistantMsg]);

        // Auto execute proposed structural action if enabled and action is valid
        if (autoExecute && agentResponse.recommendedAction && agentResponse.recommendedAction.type !== "none") {
          startAutoCountdown(assistantMsgId, agentResponse.recommendedAction);
        }
      }
    } catch (e: any) {
      console.error(e);
      setAgentMessages(prev => [...prev, {
        id: `asst_err_${Date.now()}`,
        role: "assistant",
        content: `抱歉，Agent 在网络调谐时出现异常 (${e.message || "请求过载"}). 请检查网络、API Key 或重试。`,
        suggestedFollowUps: ["重试我先前的请求", "返回传统创作模式"]
      }]);
    } finally {
      setIsAgentLoading(false);
    }
  };

  // Interactive countdown loader representation for Auto-execute modes
  const startAutoCountdown = (msgId: string, action: any) => {
    clearActiveCountdown();
    setActiveCountdownId(msgId);
    let secLeft = 3;
    setCountdownSeconds(secLeft);

    autoCountdownInterval.current = setInterval(() => {
      secLeft--;
      setCountdownSeconds(secLeft);
      if (secLeft <= 0) {
        if (autoCountdownInterval.current) clearInterval(autoCountdownInterval.current);
        executeAgentToolAction(msgId, action);
      }
    }, 1000);
  };

  // Run the Tool recommendations parsed from the Agent's response payload
  const executeAgentToolAction = async (msgId: string, action: any) => {
    clearActiveCountdown();

    // Mark interactive state as executing
    setAgentMessages(prev => prev.map(m => m.id === msgId ? { ...m, interactiveState: "completed" } : m));

    const { type, params = {} } = action;
    console.log(`Executing Agent proposed tool action: ${type}`, params);

    if (type === "optimize_prompt") {
      setPrompt(params.prompt || "");
      setActiveTab("traditional");
      optimizeActivePrompt();
    } else if (type === "generate_image") {
      // Feed values to manual inputs and trigger
      setPrompt(params.prompt || "");
      if (params.aspectRatio) setAspectRatio(params.aspectRatio);
      if (params.model) setSelectedModel(params.model);
      setActiveTab("traditional");
      setTraditionalSubTab("image");
      
      // We trigger traditional image generation using immediate inline params
      setTimeout(() => {
        generateManualImage();
      }, 500);
    } else if (type === "generate_video") {
      setPrompt(params.prompt || "");
      if (params.aspectRatio) setAspectRatio(params.aspectRatio);
      if (params.model) setSelectedVideoModel(params.model);
      
      // Check if this refers to an existing asset
      if (params.referenceImageId) {
        const matchedAsset = items.find(x => x.id === params.referenceImageId);
        if (matchedAsset) {
          setReferenceImage(matchedAsset.url);
          setReferenceImages([{ id: matchedAsset.id, url: matchedAsset.url, role: "general" }]);
        }
      }

      setActiveTab("traditional");
      setTraditionalSubTab("video");
      setTimeout(() => {
        generateManualVideo();
      }, 500);
    } else if (type === "edit_image") {
      setPrompt(params.prompt || "");
      setTraditionalSubTab("image");
      if (params.referenceImageId) {
        const matchedAsset = items.find(x => x.id === params.referenceImageId);
        if (matchedAsset) {
          setReferenceImage(matchedAsset.url);
          setReferenceImages([{ id: matchedAsset.id, url: matchedAsset.url, role: "general" }]);
          launchMaskEditor(matchedAsset.url, matchedAsset.id);
        }
      }
    }
  };

  const declineAgentToolAction = (msgId: string) => {
    clearActiveCountdown();
    setAgentMessages(prev => prev.map(m => m.id === msgId ? { ...m, interactiveState: "declined" } : m));
  };

  const handleClearProject = async () => {
    if (confirm("🚨 注意：此操作将清空本地 IndexedDB 存储的所有创意图片与视频。已被下载的文件不会受影响。确认清空吗？")) {
      await clearAllDB();
      setItems([]);
      setSelectedItemIds([]);
      setCompareItemIds([]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#050506] text-slate-200 font-sans selection:bg-blue-500/30 selection:text-slate-200 relative overflow-hidden">
      
      {/* Immersive UI Atmospheric Background Glow Spotlights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 blur-[130px] rounded-full" />
        <div className="absolute bottom-[-5%] left-[5%] w-[400px] h-[400px] bg-indigo-600/5 blur-[110px] rounded-full" />
      </div>

      {/* Dynamic Header */}
      <header className="sticky top-0 z-40 bg-[#050506]/70 backdrop-blur-xl border-b border-white/5 px-6 py-3.5 flex items-center justify-between select-none">
        <div className="flex items-center gap-3 z-10">
          <div className="relative h-9.5 w-9.5 bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-650 rounded-xl flex items-center justify-center shadow-[0_0_22px_rgba(99,102,241,0.35)] overflow-hidden group">
            <span className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-blue-500/15 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-pulse" />
            <Sparkles className="h-4.5 w-4.5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.85)] z-10 transition duration-300 group-hover:rotate-12 group-hover:scale-110" />
            <div className="absolute inset-[3px] border border-white/15 rounded-[8px] pointer-events-none" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
              <span className="text-[10px] font-mono text-indigo-455 text-indigo-400 uppercase tracking-widest hidden sm:inline">WORKSPACE //</span>
              <span>Imagine Workbench</span>
              <span className="text-[9px] bg-gradient-to-r from-blue-500/15 to-indigo-505/15 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/15 font-mono tracking-widest font-normal">v1.2 PRO</span>
            </h1>
            <p className="text-[11px] text-slate-450 font-medium font-sans">智能创意与媒体调谐工作台</p>
          </div>
        </div>

        {/* Global actions bar */}
        <div className="flex items-center gap-3 z-10">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5" />
            配置设置
          </button>
          
          <button
            onClick={handleClearProject}
            className="rounded-lg border border-white/5 hover:border-red-500/30 hover:bg-red-950/25 bg-white/5 p-2 text-slate-400 hover:text-red-400 transition cursor-pointer"
            title="清空当前项目"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main Multi-panel Layout grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start z-10">
        
        {/* Creation Controls sidebar container (Col 5) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Creative Mode Navigation System */}
          <div className="flex p-1 rounded-xl bg-white/5 border border-white/5">
            <button
              onClick={() => { setActiveTab("traditional"); clearActiveCountdown(); }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                activeTab === "traditional"
                  ? "bg-white/10 text-slate-100 shadow-[0_0_12px_rgba(255,255,255,0.05)] border border-white/5"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sliders className="h-4 w-4" />
              传统模式
            </button>
            <button
              onClick={() => { setActiveTab("agent"); }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold tracking-wide transition-all duration-200 relative overflow-hidden cursor-pointer ${
                activeTab === "agent"
                  ? "bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.15)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles className="h-4 w-4 text-orange-500 animate-pulse" />
              Agent 智能代理
              <span className="absolute top-1 right-2 block h-1.5 w-1.5 rounded-full bg-orange-400 animate-ping" />
            </button>
          </div>

          {/* Active Creative Panel switch */}
          <div className="rounded-2xl dark-glass p-5 flex flex-col gap-5 min-h-[500px]">
            
            {/* TRADITIONAL WORKFLOW TAB */}
            {activeTab === "traditional" && (
              <div className="flex flex-col gap-4 animate-fade-in">
                
                {/* Traditional Sub-tabs Switcher */}
                <div className="flex p-1 rounded-xl bg-white/5 border border-white/5 mb-1.5">
                  <button
                    type="button"
                    onClick={() => setTraditionalSubTab("image")}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold select-none cursor-pointer transition-all duration-200 ${
                      traditionalSubTab === "image"
                        ? "bg-blue-600/15 border border-blue-500/20 text-blue-400 font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    🌌 智能绘图 (Image Studio)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTraditionalSubTab("video")}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold select-none cursor-pointer transition-all duration-200 ${
                      traditionalSubTab === "video"
                        ? "bg-purple-600/15 border border-purple-500/20 text-purple-400 font-bold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <VideoIcon className="h-3.5 w-3.5" />
                    🎬 视频合成 (Veo Studio)
                  </button>
                </div>

                {traditionalSubTab === "image" ? (
                  /* IMAGE TAB CONFIG */
                  <div className="flex flex-col gap-4 animate-fade-in">
                    {/* Visual Preset Tag Picker */}
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-2 block">
                        🎨 艺术预设风格
                      </label>
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {VISUAL_PRESETS.map((preset) => {
                          const isActive = prompt.includes(preset.promptSuffix);
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => applyPreset(preset)}
                              className={`flex items-center gap-1.5 shrink-0 rounded-full py-1.5 px-3.5 text-xs transition duration-200 cursor-pointer ${
                                isActive
                                  ? "bg-blue-600/20 border border-blue-500/50 text-blue-300 shadow-[0_0_12px_rgba(37,99,235,0.25)] font-bold scale-[1.03]"
                                  : "bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10 text-slate-300"
                              }`}
                            >
                              <span>{preset.emoji}</span>
                              <span>{preset.name}</span>
                              {isActive && (
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Prompt Box */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-slate-400 font-medium flex items-center gap-1">
                          <span>✍️</span> 提示词 (Prompt)
                        </label>
                        <button
                          onClick={optimizeActivePrompt}
                          disabled={isOptimizing || !prompt.trim()}
                          className={`text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1 rounded-md border transition ${
                            isOptimizing || !prompt.trim()
                              ? "bg-white/5 text-slate-650 border-white/5 cursor-not-allowed"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 cursor-pointer"
                          }`}
                        >
                          {isOptimizing ? (
                            <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
                          ) : (
                            <Sparkles className="h-3 w-3 text-blue-400 animate-pulse" />
                          )}
                          一键智能优化
                        </button>
                      </div>

                      <div className="relative rounded-xl border border-white/5 bg-white/5 p-2.5 focus-within:border-white/10 transition">
                        {atDropdown.visible && atDropdown.type === "image-prompt" && renderAtDropdown("image-prompt")}
                        <textarea
                          value={prompt}
                          onChange={(e) => handleTextareaChange(e.target.value, "image-prompt")}
                          placeholder="写下你想创造的图片奇思妙想... 输入 @ 可引用历史生成图像作为参考"
                          className="w-full text-sm bg-transparent border-0 outline-0 ring-0 focus:ring-0 text-slate-100 placeholder-slate-500 resize-none h-24"
                        />
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[10px] text-slate-500 font-mono">
                          <span>输入 @ 呼出参考图 | 支持中英文</span>
                          <span>{prompt.length} 字符</span>
                        </div>
                      </div>
                    </div>

                    {/* Negative prompt entry box */}
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                        🚫 反向提示词 (Negative Prompt)
                      </label>
                      <input
                        type="text"
                        value={negativePrompt}
                        onChange={(e) => setNegativePrompt(e.target.value)}
                        placeholder="不希望出现在作品里的元素，例如：blurred, ugly, deformed, text"
                        className="w-full bg-white/5 border border-white/5 rounded-xl py-2 px-3 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-white/10 transition"
                      />
                    </div>

                    {/* Model & Aspect Ratio */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                          🤖 图片生成模型
                        </label>
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="w-full bg-[#0d0d10] border border-white/5 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-white/10 font-mono cursor-pointer"
                        >
                          <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image ⚡</option>
                          <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image PRO 🌟</option>
                          <option value="imagen-4.0-generate-001">Imagen 4.0 Studio 🎨</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                          📐 画面宽高比 (Size)
                        </label>
                        <select
                          value={aspectRatio}
                          onChange={(e) => setAspectRatio(e.target.value)}
                          className="w-full bg-[#0d0d10] border border-white/5 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-white/10 font-mono cursor-pointer"
                        >
                          <option value="1:1">1:1 Square (正方形)</option>
                          <option value="16:9">16:9 Cinema 🎬 (横版高清)</option>
                          <option value="9:16">9:16 Portrait📱 (竖屏短视频)</option>
                          <option value="4:3">4:3 Retro (古典屏幕)</option>
                          <option value="3:4">3:4 Portrait (人像画报)</option>
                        </select>
                      </div>
                    </div>

                    {/* Resolution size parameter (For Gemini 3.1 PRO) */}
                    {selectedModel.includes("preview") && (
                      <div>
                        <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                          💎 高清合成分辨率
                        </label>
                        <div className="flex gap-2">
                          {["512px", "1K", "2K", "4K"].map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => setImageSize(sz)}
                              className={`flex-1 py-1.5 px-2 text-[10px] font-mono rounded-lg border transition cursor-pointer ${
                                imageSize === sz
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/25"
                                  : "bg-white/5 border-white/5 text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              {sz}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Image-to-image reference (Upload / Masking) */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-slate-400 font-medium flex items-center gap-1">
                          <span>🖼️</span> 创意参考图 / 多图垫图 {referenceImages.length > 0 && `(${referenceImages.length})`}
                        </label>
                        {referenceImages.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setReferenceImages([]);
                              setReferenceImage(null);
                            }}
                            className="text-[10px] text-red-400 hover:text-red-350 transition cursor-pointer"
                          >
                            清空所有垫图
                          </button>
                        )}
                      </div>

                      {referenceImages.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2 p-2 rounded-xl bg-white/2 border border-white/5">
                          {referenceImages.map((refImg) => (
                            <div
                              key={refImg.id}
                              className="relative aspect-square rounded-lg border border-white/10 overflow-hidden bg-cover bg-center group"
                              style={{ backgroundImage: `url(${refImg.url})` }}
                            >
                              {/* Hover close overlay */}
                              <button
                                type="button"
                                onClick={() => removeReferenceImage(refImg.id)}
                                className="absolute top-1 right-1 bg-red-600/95 text-white rounded-md p-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition cursor-pointer hover:scale-105"
                                title="移除该图"
                              >
                                <X className="h-3 w-3" />
                              </button>

                              {/* Tiny ID indicator */}
                              <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] font-mono text-slate-300 truncate px-1 py-0.5 text-center">
                                {refImg.id.includes("upload") ? "Uploaded" : refImg.id.substring(0, 10)}
                              </div>
                            </div>
                          ))}

                          {/* Add button inside grid */}
                          {referenceImages.length < 4 && (
                            <label className="relative aspect-square rounded-lg border border-dashed border-white/10 hover:border-white/20 hover:bg-white/5 transition flex flex-col items-center justify-center cursor-pointer select-none bg-white/2">
                              <span className="text-slate-400 font-bold text-lg leading-none">+</span>
                              <span className="text-[8px] text-slate-500 font-semibold mt-0.5">多图垫</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/10 bg-white/2 p-3.5 flex flex-col items-center justify-center min-h-[90px] text-center hover:bg-white/5 transition relative">
                          <Layers className="h-6 w-6 text-slate-600 mb-1.5 animate-pulse" />
                          <span className="text-xs text-slate-400">
                            拖拽图片，或{" "}
                            <label className="text-blue-400 hover:text-blue-300 cursor-pointer font-medium underline">
                              浏览上传
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                          </span>
                          <span className="text-[9px] text-slate-500 mt-1">支持 JPG / PNG / WEBP | 粘贴剪贴板快捷垫图</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom main trigger button */}
                    <button
                      onClick={generateManualImage}
                      disabled={isGenerating || !prompt.trim()}
                      className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-bold transition duration-200 mt-1.5 ${
                        isGenerating || !prompt.trim()
                          ? "bg-white/5 text-slate-550 border border-white/5 cursor-not-allowed"
                          : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white active:scale-95 shadow-[0_0_20px_rgba(37,99,235,0.25)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)] cursor-pointer"
                      }`}
                    >
                      {isGenerating ? (
                        <RefreshCw className="h-4 w-4 animate-spin text-white" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-white animate-pulse" />
                      )}
                      一键渲染合成全新图片 (Render Image)
                    </button>
                  </div>
                ) : (
                  /* VIDEO TAB CONFIG */
                  <div className="flex flex-col gap-4 animate-fade-in">
                    {/* Prompt Box */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-slate-400 font-medium flex items-center gap-1">
                          <span>🎬</span> 视频场景运动描述 (Video Motion Prompt)
                        </label>
                        <button
                          onClick={optimizeActivePrompt}
                          disabled={isOptimizing || !prompt.trim()}
                          className={`text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1 rounded-md border transition ${
                            isOptimizing || !prompt.trim()
                              ? "bg-white/5 text-slate-650 border-white/5 cursor-not-allowed"
                              : "bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20 cursor-pointer"
                          }`}
                        >
                          {isOptimizing ? (
                            <RefreshCw className="h-3 w-3 animate-spin text-purple-400" />
                          ) : (
                            <Sparkles className="h-3 w-3 text-purple-400 animate-pulse" />
                          )}
                          提示词动态润色
                        </button>
                      </div>

                      <div className="relative rounded-xl border border-white/5 bg-white/5 p-2.5 focus-within:border-white/10 transition">
                        {atDropdown.visible && atDropdown.type === "video-prompt" && renderAtDropdown("video-prompt")}
                        <textarea
                          value={prompt}
                          onChange={(e) => handleTextareaChange(e.target.value, "video-prompt")}
                          placeholder="描述场景的运动与镜头动作... 输入 @ 可快捷引用图像作为动态首帧"
                          className="w-full text-sm bg-transparent border-0 outline-0 ring-0 focus:ring-0 text-slate-100 placeholder-slate-550 resize-none h-24"
                        />
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[10px] text-slate-505 font-mono">
                          <span>输入 @ 呼出参考图 | 支持运动镜头与画面控制</span>
                          <span>{prompt.length} 字符</span>
                        </div>
                      </div>
                    </div>

                    {/* Model & Aspect Ratio */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                          🤖 视频生成模型 (Veo)
                        </label>
                        <select
                          value={selectedVideoModel}
                          onChange={(e) => setSelectedVideoModel(e.target.value)}
                          className="w-full bg-[#0d0d10] border border-white/5 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-white/10 font-mono cursor-pointer"
                        >
                          <option value="veo-3.1-lite-generate-preview">Veo 3.1 Lite ⚡ (Speedy)</option>
                          <option value="veo-3.1-generate-preview">Veo 3.1 HQ 💎 (Pro Cine)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                          📐 画面宽高比 (Size)
                        </label>
                        <select
                          value={aspectRatio}
                          onChange={(e) => setAspectRatio(e.target.value)}
                          className="w-full bg-[#0d0d10] border border-white/5 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-white/10 font-mono cursor-pointer"
                        >
                          <option value="16:9">16:9 Cinema 🎬 (横版超清)</option>
                          <option value="9:16">9:16 Portrait📱 (竖屏短视频)</option>
                          <option value="1:1">1:1 Square (正方形)</option>
                        </select>
                      </div>
                    </div>

                    {/* Reference First Frame / Image-to-Video seed */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-slate-400 font-medium flex items-center gap-1">
                          <span>🎞️</span> 视频起始/结束关键帧 {referenceImages.length > 0 && `(${referenceImages.length})`}
                        </label>
                        {referenceImages.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setReferenceImages([]);
                              setReferenceImage(null);
                            }}
                            className="text-[10px] text-red-400 hover:text-red-350 transition cursor-pointer"
                          >
                            清空所有关键帧
                          </button>
                        )}
                      </div>

                      {referenceImages.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2 p-2 rounded-xl bg-white/2 border border-white/5">
                          {referenceImages.map((refImg) => {
                            const isStart = refImg.role === "start";
                            const isEnd = refImg.role === "end";
                            return (
                              <div
                                key={refImg.id}
                                className={`relative aspect-square rounded-lg border overflow-hidden bg-cover bg-center group transition-all duration-300 ${
                                  isStart
                                    ? "border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                                    : isEnd
                                    ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                                    : "border-white/10"
                                }`}
                                style={{ backgroundImage: `url(${refImg.url})` }}
                              >
                                {/* Hover close overlay */}
                                <button
                                  type="button"
                                  onClick={() => removeReferenceImage(refImg.id)}
                                  className="absolute top-1 right-1 bg-red-600/95 text-white rounded-md p-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition cursor-pointer hover:scale-105 z-10"
                                  title="移除该图"
                                >
                                  <X className="h-3 w-3" />
                                </button>

                                {/* Interactive Role Selection */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextRole = isStart ? "end" : isEnd ? "general" : "start";
                                    toggleReferenceRole(refImg.id, nextRole as "start" | "end" | "general");
                                  }}
                                  className={`absolute inset-x-0 bottom-0 py-1 text-[8px] font-sans font-bold text-center text-white backdrop-blur-subtle cursor-pointer transition-colors ${
                                    isStart
                                      ? "bg-emerald-600/80"
                                      : isEnd
                                      ? "bg-amber-600/80"
                                      : "bg-black/60 hover:bg-black/80"
                                  }`}
                                  title="点击切换：起始帧 / 结束帧 / 普通视频参考"
                                >
                                  {isStart ? "🎬 起始帧" : isEnd ? "🏁 结束帧" : "📎 普通参考"}
                                </button>
                              </div>
                            );
                          })}

                          {/* Add button inside grid */}
                          {referenceImages.length < 4 && (
                            <label className="relative aspect-square rounded-lg border border-dashed border-white/10 hover:border-white/20 hover:bg-white/5 transition flex flex-col items-center justify-center cursor-pointer select-none bg-white/2">
                              <span className="text-slate-400 font-bold text-lg leading-none">+</span>
                              <span className="text-[8px] text-slate-500 font-semibold mt-0.5">多图垫</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/10 bg-white/2 p-3.5 flex flex-col items-center justify-center min-h-[90px] text-center hover:bg-white/5 transition relative">
                          <VideoIcon className="h-6 w-6 text-slate-600 mb-1.5 animate-pulse" />
                          <span className="text-xs text-slate-400">
                            拖拽起始/结束帧，或{" "}
                            <label className="text-purple-400 hover:text-purple-300 cursor-pointer font-medium underline">
                              浏览上传
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                          </span>
                          <span className="text-[9px] text-slate-500 mt-1">支持 JPG / PNG / WEBP | 点击切换起始帧与结束帧</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom main video trigger button */}
                    <button
                      onClick={generateManualVideo}
                      disabled={isGenerating || !prompt.trim()}
                      className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-bold transition duration-200 mt-1.5 ${
                        isGenerating || !prompt.trim()
                          ? "bg-white/5 text-slate-550 border border-white/5 cursor-not-allowed"
                          : "bg-gradient-to-r from-purple-600 to-indigo-650 hover:from-purple-500 hover:to-indigo-555 text-white active:scale-95 shadow-[0_0_20px_rgba(139,92,246,0.25)] hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] cursor-pointer"
                      }`}
                    >
                      {isGenerating ? (
                        <RefreshCw className="h-4 w-4 animate-spin text-white" />
                      ) : (
                        <VideoIcon className="h-4 w-4 text-white hover:scale-110 transition" />
                      )}
                      一键渲染合成 Veo 动态视频 (Render Video)
                    </button>
                  </div>
                )}

              </div>
            )}

            {/* AI AGENT Creative Panel */}
            {activeTab === "agent" && (
              <div className="flex flex-col h-[520px] justify-between animate-fade-in text-slate-200">
                
                {/* Scrollable chat thread feed */}
                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  {agentMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[90%] gap-1.5 ${
                        msg.role === "user" ? "self-end ml-10" : "self-start mr-10"
                      }`}
                    >
                      {/* Sender visual node */}
                      <span className={`text-[10px] font-mono tracking-widest ${
                        msg.role === "user" ? "text-right text-slate-500" : "text-left text-blue-400 font-bold"
                      }`}>
                        {msg.role === "user" ? "YOU" : "CREATIVE AGENT"}
                      </span>

                      {/* Active Dynamic Skills Loading Indicators */}
                      {msg.role === "assistant" && msg.activeSkills && msg.activeSkills.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mb-1 shadow-sm">
                          {msg.activeSkills.map((skillName) => {
                            let info = { label: skillName, color: "bg-blue-500/10 text-blue-400 border-blue-500/15" };
                            if (skillName === "PromptEngineer") info = { label: "🛠️ 提示词工程", color: "bg-teal-500/15 text-teal-300 border-teal-500/20" };
                            else if (skillName === "ImageGenerator") info = { label: "🎨 智能生图", color: "bg-rose-500/15 text-rose-300 border-rose-500/20" };
                            else if (skillName === "VideoGenerator") info = { label: "🎬 智影视频合成", color: "bg-purple-500/15 text-purple-300 border-purple-500/20" };
                            else if (skillName === "ImageEditor") info = { label: "🖌️ 局部重绘", color: "bg-amber-500/15 text-amber-300 border-amber-500/20" };
                            else if (skillName === "CreativePlanner") info = { label: "🎯 创意规划", color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/20" };
                            else if (skillName === "SessionHistoryRetriever") info = { label: "💾 历史回退", color: "bg-sky-500/15 text-sky-300 border-sky-500/20" };
                            else if (skillName === "VariationSuggester") info = { label: "🧬 变体推荐", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" };
                            else if (skillName === "AsyncTaskManager") info = { label: "⏱️ 后台跟踪", color: "bg-cyan-500/15 text-cyan-300 border-cyan-500/20" };
                            else if (skillName === "ProjectSummarizer") info = { label: "📊 资产汇总", color: "bg-violet-500/15 text-violet-300 border-violet-500/20" };
                            else if (skillName === "ExportManager") info = { label: "📦 批量导出", color: "bg-red-500/15 text-red-300 border-red-500/20" };

                            return (
                              <span
                                key={skillName}
                                className={`text-[9px] scale-95 origin-left px-2 py-0.5 rounded-md border font-sans font-semibold flex items-center gap-1 transition-transform duration-200 select-none ${info.color}`}
                                title={`当前激活的特定智力分支 (Activated Domain Skill): ${skillName}`}
                              >
                                {info.label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Msg text element wrapper */}
                      <div className={`rounded-xl px-3.5 py-2.5 text-xs inline-block leading-relaxed ${
                        msg.role === "user"
                          ? "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-medium rounded-tr-none shadow-[0_4px_15px_rgba(37,99,235,0.25)]"
                          : "bg-white/5 border border-white/5 text-slate-200 rounded-tl-none"
                      }`}>
                        {msg.content}
                      </div>

                      {/* Expandable Inner Thought Process (If Assistant) */}
                      {msg.role === "assistant" && msg.thought && (
                        <details className="group self-start outline-none">
                          <summary className="text-[10px] text-slate-500 select-none cursor-pointer outline-none hover:text-slate-350 group-open:text-blue-400 flex items-center gap-1">
                            <span>🧠</span>
                            <span className="font-mono">Agent 思考过程 (Collapsible Thoughts)</span>
                            <ChevronRight className="h-3 w-3 transform transition group-open:rotate-90 text-slate-500" />
                          </summary>
                          <div className="mt-1.5 p-2.5 bg-black/40 rounded-lg border border-white/5 text-[10px] font-mono text-slate-400 whitespace-pre-line leading-normal">
                            {msg.thought}
                          </div>
                        </details>
                      )}

                      {/* Tool Call proposal indicator block (IF active and matching tool) */}
                      {msg.role === "assistant" && msg.recommendedAction && msg.recommendedAction.type !== "none" && (
                        <div className="mt-2.5 w-full rounded-xl border border-dashed border-blue-500/25 bg-gradient-to-b from-blue-500/5 to-transparent p-3 shadow-inner">
                          <span className="text-[10px] text-blue-400 font-mono tracking-widest font-bold block mb-1 animate-pulse">
                            🎯 创意指令方案 (Action Proposed)
                          </span>
                          
                          <div className="text-xs text-slate-200 flex flex-col gap-1.5">
                            <p>
                              <strong className="text-blue-400">操作工具:</strong>{" "}
                              <code className="bg-black/30 px-1 py-0.5 rounded text-[10px] font-mono text-blue-300">
                                {msg.recommendedAction.type}
                              </code>
                            </p>
                            
                            {msg.recommendedAction.params?.prompt && (
                              <p className="leading-normal">
                                <strong className="text-blue-400">规划提示词:</strong>{" "}
                                <span className="italic text-slate-300">
                                  &ldquo;{msg.recommendedAction.params.prompt}&rdquo;
                                </span>
                              </p>
                            )}

                            {msg.recommendedAction.params?.aspectRatio && (
                              <p>
                                <strong className="text-blue-400">画素尺寸:</strong>{" "}
                                <span className="text-[10px] bg-black/30 px-1 py-0.5 rounded font-mono text-blue-300">
                                  {msg.recommendedAction.params.aspectRatio}
                                </span>
                              </p>
                            )}
                          </div>

                          {/* Control action buttons */}
                          <div className="flex gap-2.5 mt-3 pt-2.5 border-t border-white/5">
                            {msg.interactiveState === "idle" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => executeAgentToolAction(msg.id, msg.recommendedAction)}
                                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] flex items-center justify-center gap-1 shadow-md hover:shadow-[0_0_15px_rgba(37,99,235,0.3)] cursor-pointer transition"
                                >
                                  <Check className="h-3 w-3" />
                                  确认并立即执行
                                </button>
                                <button
                                  type="button"
                                  onClick={() => declineAgentToolAction(msg.id)}
                                  className="border border-white/5 hover:border-white/10 bg-white/5 text-slate-400 hover:text-slate-200 py-1.5 px-3 rounded-lg text-[10px] cursor-pointer transition"
                                >
                                  拒绝方案
                                </button>
                              </>
                            )}

                            {msg.interactiveState === "completed" && (
                              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1.5 px-2 py-1 bg-emerald-950/20 border border-emerald-900/40 rounded-lg">
                                <Check className="h-3 w-3" />
                                创意流程已触发并加载完毕
                              </span>
                            )}

                            {msg.interactiveState === "declined" && (
                              <span className="text-[10px] text-slate-600 italic">
                                方案已被拒绝/驳回
                              </span>
                            )}
                          </div>

                          {/* Countdown slider visual indicator if auto-execute and active */}
                          {activeCountdownId === msg.id && msg.interactiveState === "idle" && (
                            <div className="mt-2 text-center">
                              <div className="h-1 bg-white/5 rounded overflow-hidden">
                                <motion.div 
                                  initial={{ width: "100%" }}
                                  animate={{ width: "0%" }}
                                  transition={{ duration: countdownSeconds, ease: "linear" }}
                                  className="h-full bg-blue-500"
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] mt-1.5 font-mono">
                                <span className="text-blue-400">⏱️ 自动模式: 将在 {countdownSeconds} 秒后自主运行</span>
                                <button
                                  onClick={clearActiveCountdown}
                                  className="text-red-400 hover:text-red-300 underline cursor-pointer"
                                >
                                  取消自动
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Suggestions list from companion */}
                      {msg.role === "assistant" && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 self-start">
                          {msg.suggestedFollowUps.map((t, idx) => (
                            <button
                              key={idx}
                              onClick={() => submitAgentPrompt(t)}
                              className="text-[10px] rounded-full border border-white/5 hover:border-blue-500/25 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 px-3 py-1 transition text-left cursor-pointer"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Typing loader spinner */}
                  {isAgentLoading && (
                    <div className="flex flex-col max-w-[90%] gap-1.5 self-start">
                      <span className="text-[10px] font-mono tracking-widest text-blue-400 animate-pulse">
                        AGENT COMPILING THOUGHTS
                      </span>
                      <div className="rounded-xl px-4 py-3 bg-white/5 border border-white/5 text-slate-400 text-xs flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                        <span>智囊团正在研判画廊状态，筹备提示词设计框架...</span>
                      </div>
                    </div>
                  )}

                  {/* Bottom anchor point */}
                  <div ref={chatBottomRef} />
                </div>

                {/* Combined input form */}
                <div className="border-t border-white/5 pt-4 mt-2 flex flex-col gap-3">
                  
                  {/* Current reference banner inside Agent Workspace */}
                  {(agentReferenceId || agentReferenceUrl) && (
                    <div className="flex items-center justify-between gap-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl animate-fade-in mb-1">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative h-10 w-10 shrink-0 rounded-lg overflow-hidden border border-blue-500/30 bg-slate-950">
                          <img 
                            src={agentReferenceUrl || ""} 
                            alt="agent ref" 
                            className="h-full w-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-bold text-blue-400">📎 局部编辑参考图 (Referenced Image)</span>
                          <span className="text-[9px] font-mono text-slate-400 truncate max-w-[150px]">
                            ID: {agentReferenceId ? agentReferenceId.substring(0, 16) : "Pasted Custom File"}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (agentReferenceUrl) {
                              launchMaskEditor(agentReferenceUrl, agentReferenceId || "custom_ref");
                            }
                          }}
                          className="px-2 py-1 bg-blue-600/30 hover:bg-blue-600 border border-blue-500/30 text-blue-200 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                          title="使用画笔抹除或标记局部涂层"
                        >
                          <Paintbrush className="h-3 w-3" />
                          画笔涂抹
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAgentReferenceId(null);
                            setAgentReferenceUrl(null);
                          }}
                          className="p-1 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition border border-white/5 cursor-pointer"
                          title="取消引用"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="relative w-full">
                    {atDropdown.visible && atDropdown.type === "agent-prompt" && renderAtDropdown("agent-prompt")}
                    <form
                      onSubmit={(e) => { e.preventDefault(); submitAgentPrompt(); }}
                      className="relative flex items-center w-full"
                    >
                      <input
                        type="text"
                        value={agentInput}
                        onChange={(e) => handleTextareaChange(e.target.value, "agent-prompt")}
                        placeholder="发送自然语言指令给 Agent 代理... 输入 @ 可快捷引用完成图"
                        className="w-full bg-white/5 border border-white/5 rounded-xl py-3 pl-4 pr-12 text-xs placeholder-slate-600 text-slate-100 focus:outline-none focus:border-white/10 transition"
                      />
                      <button
                        type="submit"
                        disabled={isAgentLoading || !agentInput.trim()}
                        className={`absolute right-2 px-3 py-1.5 rounded-lg text-white font-bold transition flex items-center justify-center ${
                          isAgentLoading || !agentInput.trim()
                            ? "bg-white/5 text-slate-600"
                            : "bg-blue-600 hover:bg-blue-500 active:scale-95 cursor-pointer shadow-md shadow-blue-500/10"
                        }`}
                      >
                        <Send className="h-3 w-3" />
                      </button>
                    </form>
                  </div>

                  {/* Agent workflow toggler bar */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="auto_trigger"
                        checked={autoExecute}
                        onChange={(e) => handleToggleAutoExecute(e.target.checked)}
                        className="rounded border-none accent-blue-500 focus:ring-0 cursor-pointer h-3.5 w-3.5 bg-white/5"
                      />
                      <label htmlFor="auto_trigger" className="text-[11px] text-slate-400 select-none cursor-pointer">
                        自动执行模式 (Auto-Execute Action)
                      </label>
                    </div>

                    <p className="text-[10px] text-slate-500 font-mono">
                      上下文感知已激活 💡
                    </p>
                  </div>
                </div>

              </div>
            )}

          </div>
        </section>

        {/* Right Studio Workspace (Gallery, Masonry & Comparative Canvas) (Col 7) */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Controls Header toolbar */}
          <div className="rounded-2xl dark-glass p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={`py-1.5 px-3.5 text-xs rounded-xl transition cursor-pointer ${
                  filterType === "all"
                    ? "bg-white/10 text-white font-semibold border border-white/10"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                所有资产 ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("images")}
                className={`py-1.5 px-3.5 text-xs rounded-xl transition cursor-pointer ${
                  filterType === "images"
                    ? "bg-white/10 text-white font-semibold border border-white/10"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                图片 ({items.filter(x => x.type === "image").length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("videos")}
                className={`py-1.5 px-3.5 text-xs rounded-xl transition cursor-pointer ${
                  filterType === "videos"
                    ? "bg-white/10 text-white font-semibold border border-white/10"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                视频 ({items.filter(x => x.type === "video").length})
              </button>
            </div>

            {/* Quick search input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索提示词、模型..."
                className="bg-white/5 border border-white/5 rounded-xl pl-9 pr-4 py-1.5 text-xs placeholder-slate-600 focus:outline-none focus:border-white/10 text-slate-300 transition w-full sm:w-44"
              />
            </div>
          </div>

          {/* Active project Compare Slider workspace (Show if CompareMode on with exactly 2 items) */}
          {isCompareMode && (
            <div className="rounded-2xl border border-blue-500/20 bg-[#0e0e12]/90 backdrop-blur-md p-5 flex flex-col gap-4 animate-fade-in shadow-[0_0_25px_rgba(37,99,235,0.07)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                    🔄 极智画论对比器 (Visual Layout Contrast)
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    选中两张创意项，即可进行高精度像素级滑动擦拭或双面分屏对判。
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Selector only if both items are images */}
                  {(() => {
                    const matchedA = items.find(x => x.id === compareItemIds[0]);
                    const matchedB = items.find(x => x.id === compareItemIds[1]);
                    if (matchedA?.type === "image" && matchedB?.type === "image") {
                      return (
                        <div className="flex bg-white/5 border border-white/5 rounded-lg p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setCompareViewType("wipe-slider")}
                            className={`px-2 py-1 text-[10px] rounded-md font-bold transition-all duration-200 cursor-pointer ${
                              compareViewType === "wipe-slider"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            🖱️ 滑过擦拭
                          </button>
                          <button
                            type="button"
                            onClick={() => setCompareViewType("side-by-side")}
                            className={`px-2 py-1 text-[10px] rounded-md font-bold transition-all duration-200 cursor-pointer ${
                              compareViewType === "side-by-side"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            🔲 双幅分屏
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <button
                    onClick={() => { setIsCompareMode(false); setCompareItemIds([]); }}
                    className="text-xs text-slate-400 hover:text-red-400 font-medium px-2 py-1 bg-white/5 border border-white/5 rounded-lg hover:border-red-500/20 transition cursor-pointer"
                  >
                    重置
                  </button>
                </div>
              </div>

              {compareItemIds.length !== 2 ? (
                <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-1.5">
                  <span>ℹ️ 请先到下方画廊中勾选 2 个项目的「对比」按钮来开启对比！</span>
                  <span>（当前已选中: {compareItemIds.length}/2 个）</span>
                </div>
              ) : (
                (() => {
                  const matchedA = items.find(x => x.id === compareItemIds[0]);
                  const matchedB = items.find(x => x.id === compareItemIds[1]);
                  
                  if (!matchedA || !matchedB) {
                    return (
                      <div className="p-4 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
                        匹配素材载入失败。请重新勾选有效果的原片。
                      </div>
                    );
                  }

                  const isBothImages = matchedA.type === "image" && matchedB.type === "image";

                  if (compareViewType === "wipe-slider" && isBothImages) {
                    return (
                      <div className="flex flex-col gap-3">
                        <div className="relative w-full aspect-[4/3] rounded-2xl border border-white/5 overflow-hidden bg-slate-950 select-none shadow-2xl">
                          {/* Left Image (matchedA) as ambient base background */}
                          <img 
                            src={matchedA.url} 
                            alt="Compare item A"
                            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute bottom-3 left-3 z-20 bg-black/70 backdrop-blur-md border border-white/5 px-2.5 py-1 rounded-xl text-[10px] text-slate-300 pointer-events-none flex flex-col gap-0.5">
                            <span className="font-bold text-blue-400 text-[11px]">A: 原始起稿</span>
                            <span className="font-mono text-[9px] text-slate-400 truncate max-w-[120px]" title={matchedA.prompt}>
                              {matchedA.id.substring(0, 8)}
                            </span>
                          </div>

                          {/* Right Image (matchedB) clipped overlay */}
                          <img 
                            src={matchedB.url} 
                            alt="Compare item B"
                            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                            style={{ clipPath: `polygon(0 0, ${compareSliderPos}% 0, ${compareSliderPos}% 100%, 0 100%)` }}
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute bottom-3 right-3 z-20 bg-black/70 backdrop-blur-md border border-white/5 px-2.5 py-1 rounded-xl text-[10px] text-slate-300 pointer-events-none text-right flex flex-col gap-0.5">
                            <span className="font-bold text-amber-500 text-[11px]">B: 演进渲染</span>
                            <span className="font-mono text-[9px] text-slate-400 truncate max-w-[120px]" title={matchedB.prompt}>
                              {matchedB.id.substring(0, 8)}
                            </span>
                          </div>

                          {/* Sliding handle bar line and icon */}
                          <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-blue-500/80 z-20 pointer-events-none"
                            style={{ left: `${compareSliderPos}%` }}
                          >
                            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-blue-600 border border-blue-400 shadow-md flex items-center justify-center pointer-events-none animate-pulse">
                              <Sliders className="h-4 w-4 text-white rotate-90" />
                            </div>
                          </div>

                          {/* Range slider input overlaid */}
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={compareSliderPos} 
                            onChange={(e) => setCompareSliderPos(Number(e.target.value))} 
                            className="absolute inset-0 w-full h-full opacity-0 z-30 cursor-ew-resize"
                          />
                        </div>
                        
                        <div className="flex items-center justify-between text-[11px] px-1 font-mono text-slate-400">
                          <span className="truncate max-w-[45%] italic" title={matchedA.prompt}>👈 A: {matchedA.prompt}</span>
                          <span className="text-blue-400 font-bold">拉拽滑锁进行滑动对比 (Drag Slider)</span>
                          <span className="truncate max-w-[45%] text-right italic" title={matchedB.prompt}>👉 B: {matchedB.prompt}</span>
                        </div>
                      </div>
                    );
                  }

                  // Default / Side-by-Side grid contrast
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Frame A */}
                      <div className="border border-white/5 rounded-2xl overflow-hidden bg-slate-950 p-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 font-mono">
                              FRAME A: {matchedA.id.substring(0, 8)}
                            </span>
                            <span className="text-[9px] font-mono text-slate-500">
                              🤖 {matchedA.model.replace("-preview", "").replace("lite-", "").replace("imagen-", "Imagen")}
                            </span>
                          </div>
                          
                          <div className="aspect-[4/3] relative w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 flex items-center justify-center">
                            {matchedA.type === "image" ? (
                              <img src={matchedA.url} alt="A" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <video src={matchedA.url} controls loop className="w-full h-full object-cover" />
                            )}
                          </div>
                        </div>
                        
                        <p className="text-[10px] text-slate-300 mt-2.5 line-clamp-2 leading-relaxed italic" title={matchedA.prompt}>
                          &ldquo;{matchedA.prompt}&rdquo;
                        </p>
                      </div>

                      {/* Frame B */}
                      <div className="border border-white/5 rounded-2xl overflow-hidden bg-slate-950 p-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25 font-mono">
                              FRAME B: {matchedB.id.substring(0, 8)}
                            </span>
                            <span className="text-[9px] font-mono text-slate-500">
                              🤖 {matchedB.model.replace("-preview", "").replace("lite-", "").replace("imagen-", "Imagen")}
                            </span>
                          </div>
                          
                          <div className="aspect-[4/3] relative w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 flex items-center justify-center">
                            {matchedB.type === "image" ? (
                              <img src={matchedB.url} alt="B" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <video src={matchedB.url} controls loop className="w-full h-full object-cover" />
                            )}
                          </div>
                        </div>
                        
                        <p className="text-[10px] text-slate-300 mt-2.5 line-clamp-2 leading-relaxed italic" title={matchedB.prompt}>
                          &ldquo;{matchedB.prompt}&rdquo;
                        </p>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* Main Gallery List */}
          <div className="min-h-[400px]">
            {filterAndSearchItems().length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 border border-slate-900 border-dashed rounded-2xl p-6 text-slate-550">
                <ImageIcon className="h-10 w-10 text-slate-800 mb-3" />
                <p className="text-sm">暂无生成的创意文件</p>
                <p className="text-xs text-slate-600 mt-1">在左侧写下创意设想并生成，文件将实时存档至本地 IndexedDB！</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {filterAndSearchItems().map((item) => (
                  <div
                    key={item.id}
                    className={`relative overflow-hidden rounded-2xl group border bg-slate-900 shadow-xl transition-all duration-300 flex flex-col justify-between ${
                      selectedItemIds.includes(item.id)
                        ? "border-blue-500 ring-2 ring-blue-500/20"
                        : "border-slate-850 hover:border-slate-750"
                    }`}
                  >
                    
                    {/* Visual creation node */}
                    <div className="relative aspect-[4/3] w-full bg-slate-950 overflow-hidden flex items-center justify-center border-b border-white/5">
                      
                      {item.status === "processing" ? (
                        <div className="absolute inset-0 bg-[#07070a] flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden">
                          {/* Pulsing glow background elements */}
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 bg-blue-500/10 rounded-full blur-2xl animate-pulse" />
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-indigo-500/5 rounded-full blur-xl animate-ping" />
                          
                          <div className="relative z-10 flex flex-col items-center">
                            <div className="h-9 w-9 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.2)] mb-3 animate-spin duration-3000">
                              <RefreshCw className="h-4.5 w-4.5 text-blue-400 animate-spin" />
                            </div>
                            <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                              {item.type === "video" ? "🎬 智影合成中..." : "🎨 极精算色中..."}
                            </p>
                            <span className="text-[9px] font-mono text-slate-500 mt-1">
                              模型: {item.model.replace("-preview", "").replace("lite-", "").replace("-generate", "").replace("imagen-", "Imagen")}
                            </span>

                            <div className="w-36 bg-white/5 h-1 rounded-full overflow-hidden mt-4 border border-white/5 shadow-inner">
                              <div 
                                className="bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 h-full transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-blue-400 mt-2 font-mono font-bold tracking-widest">
                              {item.progress}% RENDERING
                            </span>
                          </div>
                        </div>
                      ) : item.status === "failed" ? (
                        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-red-400 select-none">
                          <X className="h-8 w-8 text-red-500/50 mb-2.5" />
                          <p className="text-xs font-semibold">生成失败 / 链接中断</p>
                          <p className="text-[10px] text-slate-550 mt-1">请核查 API Key 或重构参数。</p>
                        </div>
                      ) : (
                        // Standard complete state display
                        <div className="relative w-full h-full">
                          {item.type === "image" ? (
                            <img
                              src={item.url}
                              alt={item.prompt}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer"
                              onClick={() => setFullscreenItem(item)}
                            />
                          ) : (
                            <div className="relative w-full h-full bg-slate-950">
                              <video
                                src={item.url}
                                controls
                                loop
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}

                          {/* Dynamic Top-Right Badge: Image vs Video */}
                          <div className="absolute top-3 right-3 z-10 flex gap-1.5">
                            {item.type === "image" ? (
                              <span className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded bg-blue-500/80 backdrop-blur-md text-white border border-blue-400/25">
                                <ImageIcon className="h-3 w-3" />
                                IMAGE
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded bg-purple-500/80 backdrop-blur-md text-white border border-purple-400/25">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
                                VEO VIDEO
                              </span>
                            )}
                          </div>

                          {/* Top-Left selection checkbox */}
                          <div className="absolute top-3 left-3 z-10">
                            <input
                              type="checkbox"
                              checked={selectedItemIds.includes(item.id)}
                              onChange={() => toggleSelectItem(item.id)}
                              className="h-4.5 w-4.5 bg-slate-950/85 border-white/10 text-blue-500 focus:ring-0 rounded-md cursor-pointer checked:bg-blue-600 flex items-center justify-center transition"
                            />
                          </div>

                          {/* Immersive Hover Action Overlay (Cleanest, zero interaction overlap) */}
                          <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2 z-10 pointer-events-none group-hover:pointer-events-auto">
                            
                             {item.type === "image" && (
                              <button
                                onClick={() => applyAsVideoReference(item.url)}
                                className="p-2 bg-slate-900/90 hover:bg-purple-600 border border-white/5 rounded-xl text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-1 cursor-pointer hover:scale-105"
                                title="以此图首帧生图动态 Veo 航拍影片"
                              >
                                <VideoIcon className="h-3.5 w-3.5 text-purple-450 group-hover:text-white" />
                                <span className="text-[10px] font-bold px-0.5">生视频</span>
                              </button>
                            )}

                             {item.type === "image" && (
                              <button
                                onClick={() => {
                                  setAgentReferenceId(item.id);
                                  setAgentReferenceUrl(item.url);
                                  setActiveTab("agent");
                                }}
                                className="p-2 bg-slate-900/90 hover:bg-blue-600 border border-white/5 rounded-xl text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-1 cursor-pointer hover:scale-105"
                                title="引用该图片至 Agent 智能代理进行对话与局部修改"
                              >
                                <Sparkles className="h-3.5 w-3.5 text-blue-455 text-blue-400 group-hover:text-white animate-pulse" />
                                <span className="text-[10px] font-bold px-0.5">引用 Agent</span>
                              </button>
                            )}

                            {item.type === "image" && (
                              <button
                                onClick={() => launchMaskEditor(item.url, item.id)}
                                className="p-2 bg-slate-900/90 hover:bg-amber-600 border border-white/5 rounded-xl text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-1 cursor-pointer hover:scale-105"
                                title="对该图片局部进行笔刷遮罩修改 & 创意局部重绘"
                              >
                                <Paintbrush className="h-3.5 w-3.5 text-amber-500 group-hover:text-white" />
                                <span className="text-[10px] font-bold px-0.5">修改图片</span>
                              </button>
                            )}

                            <button
                              onClick={() => toggleCompare(item.id)}
                              className={`p-2 rounded-xl border transition-all duration-200 shadow-lg flex items-center justify-center gap-1 cursor-pointer hover:scale-105 ${
                                compareItemIds.includes(item.id)
                                  ? "bg-blue-600 border-blue-500 text-white"
                                  : "bg-slate-900/90 border-white/5 text-slate-300 hover:text-white hover:bg-slate-800"
                              }`}
                              title="加入左右侧滑块对比面板"
                            >
                              <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
                              <span className="text-[10px] font-bold px-0.5">对比</span>
                            </button>

                            <button
                              onClick={() => setFullscreenItem(item)}
                              className="p-2 bg-slate-900/90 hover:bg-slate-800 border border-white/5 rounded-xl text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center cursor-pointer hover:scale-105"
                              title="全屏大画幅细节放大"
                            >
                              <Maximize2 className="h-3.5 w-3.5 text-slate-300" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Meta parameter details */}
                    <div className="p-3.5 bg-[#0e0e12] flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed font-sans" title={item.prompt}>
                          {item.prompt}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-850 flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-mono text-slate-500">
                          <span className="bg-white/5 px-2 py-0.5 rounded text-[9px]" title={item.model}>
                            🤖 {item.model.replace("-preview", "").replace("lite-", "").replace("-generate", "").replace("imagen-", "Imagen")}
                          </span>
                          <span className="bg-white/5 px-2 py-0.5 rounded">📐 {item.aspectRatio}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-slate-650">
                            {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          
                          <button
                            onClick={async () => {
                              if (confirm("确定要删除此创意项吗？")) {
                                await deleteFromDB(item.id);
                                setItems(prev => prev.filter(x => x.id !== item.id));
                                setSelectedItemIds(prev => prev.filter(x => x !== item.id));
                                setCompareItemIds(prev => prev.filter(x => x !== item.id));
                              }
                            }}
                            className="text-slate-600 hover:text-red-400 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                            title="单独移除此项"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </section>

      </main>

      {/* Floating Batch Operation Panel (Appears when 1+ checklist items selected) */}
      <AnimatePresence>
        {selectedItemIds.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-lg px-4"
          >
            <div className="bg-[#0e0e12]/90 backdrop-blur-xl border border-blue-500/20 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(37,99,235,0.15)] rounded-2xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
                  已选中 {selectedItemIds.length} 项创意作品
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">可一键批量封包并打包下载为 zip 压缩文件包。</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleBatchDownloadZip}
                  className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition duration-200 transform hover:scale-[1.03]"
                >
                  <FileArchive className="h-3.5 w-3.5" />
                  打包 ZIP
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="bg-slate-900 hover:bg-red-950/40 text-red-400 font-bold px-3 py-2 border border-white/5 hover:border-red-500/30 rounded-xl text-xs transition duration-200"
                  title="批量移除"
                >
                  批量删除
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white transition duration-200"
                  title="清空勾选"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Panel Overlay Drawer */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-850 px-6 py-4">
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-amber-500" />
                  灵感工作台高级设置 Panel
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 flex flex-col gap-4 font-sans text-xs">
                
                {/* Custom API Key configured (stored inside client storage) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-semibold text-slate-300">
                      🔑 外部 API 密钥连接 (Optional API Key)
                    </label>
                    {customApiKey && (
                      <span className="text-[10px] text-emerald-400">已启用自定义密钥</span>
                    )}
                  </div>
                  
                  <input
                    type="password"
                    value={customApiKey}
                    onChange={(e) => handleSaveApiKey(e.target.value)}
                    placeholder="留空则使用默认后端共享 Gemini API Key"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-xs text-amber-350 placeholder-slate-650 focus:outline-none focus:border-slate-700 font-mono transition"
                  />
                  <p className="text-[10px] text-slate-500 leading-normal mt-1.5 font-mono">
                    私钥保存在浏览器 localStorage。可用于自主运行、提高限额、或绕过共享密钥并发限制。
                  </p>
                </div>

                {/* Polling description */}
                <div>
                  <label className="font-semibold text-slate-400 block mb-1">
                    📡 Web 异步任务轮询间隔
                  </label>
                  <p className="font-mono text-[10px] text-slate-300">自动侦测间隔: 4秒 (指数退避保护算法)</p>
                </div>

                {/* DB local status */}
                <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-850/50">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-450 font-semibold flex items-center gap-1 text-[11px]">
                      <Info className="h-3.5 w-3.5 text-slate-500" />
                      当前本地项目库概要:
                    </span>
                    <button
                      onClick={async () => {
                        if (confirm("这会清空所有生成的历史卡片，无法恢复！")) {
                          await clearAllDB();
                          setItems([]);
                          setCompareItemIds([]);
                          setSelectedItemIds([]);
                        }
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300 underline"
                    >
                      安全复位数据
                    </button>
                  </div>
                  <ul className="mt-2 text-[10px] text-slate-500 font-mono flex flex-col gap-1 list-disc pl-3">
                    <li>类型: Browser IndexedDB 离线隔离数据库</li>
                    <li>合成图片数量: {items.filter(x => x.type === "image").length} 张</li>
                    <li>合成 Veo 视频: {items.filter(x => x.type === "video").length} 个</li>
                  </ul>
                </div>

                {/* Info block */}
                <div className="text-[10px] text-slate-500 mt-2 flex items-start gap-1.5 leading-normal">
                  <span>ℹ️</span>
                  <span>
                    Imagine Workbench 为全自可部署设计。您可以通过 Settings &gt; Secrets 界面随时添加密钥来扩展创作并发数，当前应用已包含 12ai 的全部异步生成标准适配。
                  </span>
                </div>

              </div>

              {/* Close footer */}
              <div className="border-t border-slate-850 bg-slate-900/50 px-6 py-4 text-right">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-350 font-semibold px-4 py-2 rounded-lg text-xs cursor-pointer transition"
                >
                  保存并关闭
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Preview overlay modal */}
      <AnimatePresence>
        {fullscreenItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4">
            <button
              onClick={() => setFullscreenItem(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white rounded-lg p-2 bg-slate-900 border border-slate-800 transition"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="max-w-4xl max-h-[85vh] flex flex-col items-center justify-center gap-4">
              {fullscreenItem.type === "image" ? (
                <img
                  src={fullscreenItem.url}
                  alt={fullscreenItem.prompt}
                  className="rounded-lg max-h-[75vh] object-contain border border-slate-800"
                />
              ) : (
                <video
                  src={fullscreenItem.url}
                  controls
                  loop
                  autoPlay
                  className="rounded-lg max-h-[75vh] border border-slate-800"
                />
              )}
              <div className="text-center w-full max-w-xl">
                <p className="text-xs text-slate-300 italic">&ldquo;{fullscreenItem.prompt}&rdquo;</p>
                <span className="text-[9px] font-mono text-slate-600 block mt-1.5">
                  ID: {fullscreenItem.id} | 模型: {fullscreenItem.model} | Aspect Ratio: {fullscreenItem.aspectRatio}
                </span>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Inpainting Mask Drawer overlay loader */}
      {isMaskOpen && (
        <CanvasMaskEditor
          imageUrl={maskTargetUrl}
          isOpen={isMaskOpen}
          onClose={() => { setIsMaskOpen(false); setMaskTargetUrl(""); setMaskTargetId(""); }}
          onSaveMask={saveMaskOutput}
        />
      )}

      {/* Global comparison toggles in page backgrounds */}
      {compareItemIds.length > 0 && !isCompareMode && (
        <div className="fixed top-20 right-6 z-30">
          <button
            onClick={() => setIsCompareMode(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 rounded-full text-slate-950 text-xs font-bold border border-amber-600 shadow-xl shadow-amber-500/10 cursor-pointer hover:bg-amber-450 motion-safe:animate-bounce"
          >
            <span>🔄 调谐对比器 ({compareItemIds.length}/2)</span>
          </button>
        </div>
      )}

    </div>
  );
}
