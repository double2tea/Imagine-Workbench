(function () {
  var hasNode = typeof require === "function";
  var fs = hasNode ? require("fs") : null;
  var os = hasNode ? require("os") : null;
  var path = hasNode ? require("path") : null;
  var electron = hasNode ? require("electron") : null;
  var shell = electron ? electron.shell : null;
  var net = electron ? electron.net : null;
  var ipcRenderer = electron ? electron.ipcRenderer : null;

  var PLUGIN_ID = "com.imagine.workbench.resolve";
  var DEFAULT_MODELS = {
    "generate-image": "12ai:gemini-3.1-flash-image-preview",
    "edit-image": "12ai:gemini-3.1-flash-image-preview",
    "generate-video": "12ai:veo_3_1-fast",
    "tts": "mimo:mimo-v2.5-tts",
    "transcribe": "mimo:mimo-v2.5-asr"
  };
  var OPERATION_CAPABILITY_IDS = {
    "generate-image": "generate_image",
    "edit-image": "edit_image",
    "generate-video": "generate_video",
    "tts": "tts",
    "transcribe": "transcribe"
  };

  var operationConfigs = {
    "generate-image": {
      tab: "image",
      title: "图像生成",
      subtitle: "生成高质量图片",
      icon: "图",
      promptLabel: "提示词",
      placeholder: "描述要生成的画面",
      sources: [],
      canImport: true,
      canAppend: false
    },
    "edit-image": {
      tab: "image",
      title: "图像编辑",
      subtitle: "基于当前帧或图片重绘",
      icon: "改",
      promptLabel: "提示词",
      placeholder: "描述要如何修改当前帧或图片",
      sources: ["current-frame", "current-clip-source"],
      imageOperation: true,
      canImport: true,
      canAppend: false
    },
    "generate-video": {
      tab: "video",
      title: "视频生成",
      subtitle: "生成或延展视频片段",
      icon: "影",
      promptLabel: "提示词",
      placeholder: "描述要生成的视频，或如何延展当前素材",
      sources: ["timeline-inout-render", "current-clip-render", "current-frame", "current-clip-source"],
      pollSeconds: true,
      canImport: true,
      canAppend: true
    },
    "transcribe": {
      tab: "audio",
      title: "字幕转写",
      subtitle: "从音频或视频生成字幕",
      icon: "字",
      promptLabel: "无需提示词",
      placeholder: "转写会使用所选参考源",
      sources: ["timeline-inout-render", "current-clip-render", "current-clip-source"],
      language: true,
      canImport: false,
      canAppend: false
    },
    "tts": {
      tab: "audio",
      title: "文本配音",
      subtitle: "生成临时配音",
      icon: "声",
      promptLabel: "配音文本",
      placeholder: "输入要生成的旁白或配音文本",
      sources: [],
      canImport: true,
      canAppend: false
    },
    "doctor": {
      tab: "apps",
      title: "连接检查",
      subtitle: "检查 Workbench 与 Resolve 状态",
      icon: "检",
      promptLabel: "无需提示词",
      placeholder: "连接检查会验证 Workbench 与 Resolve 状态",
      sources: [],
      canImport: false,
      canAppend: false
    }
  };

  var sourceLabels = {
    "timeline-inout-render": "时间线入出点片段",
    "current-clip-render": "当前片段渲染",
    "current-frame": "当前帧",
    "current-clip-source": "当前片段源文件"
  };
  var tabLabels = {
    image: {
      title: "图像",
      subtitle: "生成图片，或基于当前帧快速重绘"
    },
    video: {
      title: "视频",
      subtitle: "用提示词和参考片段生成新镜头"
    },
    audio: {
      title: "音频",
      subtitle: "生成配音，转写音频或视频字幕"
    },
    apps: {
      title: "全部工具",
      subtitle: "选择下一步要创建或处理的内容"
    }
  };

  var state = {
    tab: "image",
    operation: "generate-image",
    source: "",
    running: false,
    activeOperation: "",
    resolve: null,
    sharedCredentials: {}
  };

  var outputDir = hasNode ? path.join(os.homedir(), "Movies", "Imagine Resolve Bridge") : "";
  var cacheDir = hasNode ? path.join(os.homedir(), "Library", "Caches", "Imagine Workbench", "Resolve Bridge") : "";
  var jobPath = hasNode ? path.join(outputDir, "job.json") : "";

  var grid = document.getElementById("operationGrid");
  var sectionTitle = document.getElementById("sectionTitle");
  var sectionSubtitle = document.getElementById("sectionSubtitle");
  var promptInput = document.getElementById("promptInput");
  var promptLabel = document.getElementById("promptLabel");
  var sourceBlock = document.getElementById("sourceBlock");
  var sourcePills = document.getElementById("sourcePills");
  var baseUrlInput = document.getElementById("baseUrlInput");
  var outputNameInput = document.getElementById("outputNameInput");
  var twelveApiKeyInput = document.getElementById("twelveApiKeyInput");
  var mimoApiKeyInput = document.getElementById("mimoApiKeyInput");
  var rememberKeysInput = document.getElementById("rememberKeysInput");
  var providerBaseUrlInput = document.getElementById("providerBaseUrlInput");
  var providerLabelInput = document.getElementById("providerLabelInput");
  var imageOperationField = document.getElementById("imageOperationField");
  var imageOperationInput = document.getElementById("imageOperationInput");
  var pollSecondsField = document.getElementById("pollSecondsField");
  var pollSecondsInput = document.getElementById("pollSecondsInput");
  var languageField = document.getElementById("languageField");
  var languageInput = document.getElementById("languageInput");
  var importInput = document.getElementById("importInput");
  var appendInput = document.getElementById("appendInput");
  var statusOutput = document.getElementById("statusOutput");
  var runButton = document.getElementById("runButton");

  function setStatus(message) {
    statusOutput.textContent = message;
  }

  function persistSettings() {
    localStorage.setItem("imagine.resolve.baseUrl", baseUrlInput.value);
    localStorage.setItem("imagine.resolve.providerBaseUrl", providerBaseUrlInput.value);
    localStorage.setItem("imagine.resolve.providerLabel", providerLabelInput.value);
    localStorage.removeItem("imagine.resolve.providerApiKey");
    localStorage.setItem("imagine.resolve.rememberProviderKeys", rememberKeysInput.checked ? "1" : "");
    if (rememberKeysInput.checked) {
      localStorage.setItem("imagine.resolve.twelveApiKey", twelveApiKeyInput.value);
      localStorage.setItem("imagine.resolve.mimoApiKey", mimoApiKeyInput.value);
    } else {
      localStorage.removeItem("imagine.resolve.twelveApiKey");
      localStorage.removeItem("imagine.resolve.mimoApiKey");
    }
  }

  function restoreSettings() {
    var baseUrl = localStorage.getItem("imagine.resolve.baseUrl");
    if (baseUrl) {
      baseUrlInput.value = baseUrl;
    }
    rememberKeysInput.checked = localStorage.getItem("imagine.resolve.rememberProviderKeys") === "1";
    twelveApiKeyInput.value = rememberKeysInput.checked ? (localStorage.getItem("imagine.resolve.twelveApiKey") || "") : "";
    mimoApiKeyInput.value = rememberKeysInput.checked ? (localStorage.getItem("imagine.resolve.mimoApiKey") || "") : "";
    providerBaseUrlInput.value = localStorage.getItem("imagine.resolve.providerBaseUrl") || "";
    providerLabelInput.value = localStorage.getItem("imagine.resolve.providerLabel") || "";
  }

  function visibleOperations() {
    var operations = Object.keys(operationConfigs);
    if (state.tab === "apps") {
      return operations;
    }
    return operations.filter(function (operation) {
      return operationConfigs[operation].tab === state.tab;
    });
  }

  function renderOperations() {
    var tabCopy = tabLabels[state.tab];
    sectionTitle.textContent = tabCopy.title;
    sectionSubtitle.textContent = tabCopy.subtitle;
    grid.innerHTML = "";
    visibleOperations().forEach(function (operation) {
      var config = operationConfigs[operation];
      var button = document.createElement("button");
      button.type = "button";
      button.className = "app-card" + (operation === state.operation ? " active" : "");
      button.innerHTML = '<div class="card-icon">' + config.icon + '</div><div class="card-title">' + config.title + '</div><div class="card-subtitle">' + config.subtitle + "</div>";
      button.addEventListener("click", function () {
        selectOperation(operation);
      });
      grid.appendChild(button);
    });
  }

  function renderSources(config) {
    sourcePills.innerHTML = "";
    sourceBlock.classList.toggle("hidden", config.sources.length === 0);
    if (config.sources.length === 0) {
      state.source = "";
      return;
    }
    if (config.sources.indexOf(state.source) === -1) {
      state.source = config.sources[0];
    }
    config.sources.forEach(function (source) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "pill" + (source === state.source ? " active" : "");
      button.textContent = sourceLabels[source] || source;
      button.addEventListener("click", function () {
        state.source = source;
        renderSources(config);
      });
      sourcePills.appendChild(button);
    });
  }

  function selectOperation(operation) {
    state.operation = operation;
    var config = operationConfigs[operation];
    promptLabel.textContent = config.promptLabel;
    promptInput.placeholder = config.placeholder;
    promptInput.disabled = config.promptLabel === "无需提示词";
    imageOperationField.classList.toggle("hidden", config.imageOperation !== true);
    pollSecondsField.classList.toggle("hidden", config.pollSeconds !== true);
    languageField.classList.toggle("hidden", config.language !== true);
    importInput.disabled = config.canImport !== true;
    appendInput.disabled = config.canAppend !== true;
    importInput.checked = config.canImport === true;
    if (config.canAppend !== true) {
      appendInput.checked = false;
    }
    renderSources(config);
    renderOperations();
  }

  function buildJob(operationOverride) {
    var operation = operationOverride || state.operation;
    var config = operationConfigs[operation];
    var job = {
      operation: operation,
      baseUrl: baseUrlInput.value.trim()
    };
    var prompt = promptInput.value.trim();
    if (operation === "tts") {
      job.text = prompt;
    } else if (config.promptLabel !== "无需提示词") {
      job.prompt = prompt;
    }
    if (operation === "edit-image") {
      job.image = state.source;
      job.imageOperation = imageOperationInput.value;
    }
    if (operation === "generate-video") {
      job.reference = [state.source];
      job.pollSeconds = Number(pollSecondsInput.value || 600);
    }
    if (operation === "transcribe") {
      job.audio = state.source;
      job.language = languageInput.value.trim();
    }
    if (outputNameInput.value.trim()) {
      job.outputName = outputNameInput.value.trim();
    }
    if (importInput.checked && config.canImport === true) {
      job.importToResolve = true;
    }
    if (appendInput.checked && config.canAppend === true) {
      job.appendToTimeline = true;
    }
    return job;
  }

  function saveJob(job) {
    if (!hasNode) {
      throw new Error("当前环境不能写入 job 文件");
    }
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2) + "\n", "utf8");
  }

  async function runJob(operationOverride) {
    if (!hasNode) {
      setStatus("浏览器预览模式不能直接运行。请从 Resolve Workflow Integrations 打开。");
      return;
    }
    if (state.running) {
      return;
    }
    persistSettings();
    var job = buildJob(operationOverride);
    state.running = true;
    state.activeOperation = job.operation;
    runButton.disabled = true;
    setStatus("运行中\n" + describeJob(job));
    try {
      await loadSharedCredentialsForJob(job);
      var result = await executeJob(job);
      saveJob(job);
      setStatus("已完成\n" + describeJob(job) + "\n\n" + result.join("\n"));
    } catch (error) {
      setStatus("运行失败\n" + explainError(error, job));
    } finally {
      state.running = false;
      state.activeOperation = "";
      runButton.disabled = false;
    }
  }

  async function executeJob(job) {
    if (job.operation === "doctor") {
      return doctor(job);
    }
    var model = await modelForOperation(job.baseUrl, job.operation);
    if (job.operation === "generate-image") {
      requireText(job.prompt, "提示词");
      var imagePath = await generateImage(job, model);
      await importOutputs(job, [imagePath]);
      return [imagePath];
    }
    if (job.operation === "edit-image") {
      requireText(job.prompt, "提示词");
      var editSource = await resolveMediaInput(job.image, outputStem(job) + "_image", "image");
      var editedPath = await editImage(job, model, editSource);
      await importOutputs(job, [editedPath]);
      return [editedPath];
    }
    if (job.operation === "generate-video") {
      requireText(job.prompt, "提示词");
      var references = [];
      for (var index = 0; index < job.reference.length; index += 1) {
        references.push(await resolveMediaInput(job.reference[index], outputStem(job) + "_reference_" + (index + 1), "reference"));
      }
      var videoPath = await generateVideo(job, model, references);
      await importOutputs(job, [videoPath]);
      return [videoPath];
    }
    if (job.operation === "tts") {
      requireText(job.text, "配音文本");
      var audioPath = await textToSpeech(job, model);
      await importOutputs(job, [audioPath]);
      return [audioPath];
    }
    if (job.operation === "transcribe") {
      var audioSource = await resolveMediaInput(job.audio, outputStem(job), "audio");
      return transcribe(job, model, audioSource);
    }
    throw new Error("不支持的功能：" + job.operation);
  }

  async function loadSharedCredentialsForJob(job) {
    if (!shouldLoadSharedCredentials(job)) {
      return;
    }
    var response = await fetchUrl(job.baseUrl, "/api/resolve/provider-credentials", {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    var payload = await readJsonResponse(response, "/api/resolve/provider-credentials");
    state.sharedCredentials = payload.credentials || {};
  }

  function shouldLoadSharedCredentials(job) {
    if (!providerForOperation(job.operation)) {
      return false;
    }
    if (!isLocalWorkbenchUrl(job.baseUrl)) {
      return false;
    }
    if (inputProviderApiKeyForOperation(job.operation) || process.env.IMAGINE_PROVIDER_API_KEY) {
      return false;
    }
    return true;
  }

  async function modelForOperation(baseUrl, operation) {
    var fallback = DEFAULT_MODELS[operation];
    var capabilityId = OPERATION_CAPABILITY_IDS[operation];
    if (!capabilityId) {
      return "";
    }
    var capabilities = await getJson(baseUrl, "/api/resolve/capabilities");
    var match = capabilities.operations.find(function (item) {
      return item.id === capabilityId;
    });
    return (match && match.defaultModel) || fallback;
  }

  async function doctor(job) {
    var lines = [];
    var capabilities = await getJson(job.baseUrl, "/api/resolve/capabilities");
    lines.push("Workbench：已连接 - " + capabilities.name);
    try {
      var resolve = await getResolve();
      lines.push("Resolve：已连接");
      var project = await currentProject(resolve);
      lines.push("Project：" + await project.GetName());
      var timeline = await currentTimeline(project);
      lines.push("Timeline：" + await timeline.GetName());
      lines.push("Page：" + await resolve.GetCurrentPage());
    } catch (error) {
      lines.push("Resolve：" + errorMessage(error));
    }
    return lines;
  }

  async function generateImage(job, model) {
    var response = await postJson(job.baseUrl, "/v1/images/generations", {
      model: model,
      prompt: job.prompt,
      response_format: "b64_json"
    });
    var imageBytes = openAiB64Bytes(response, "image");
    return writeOutput(outputStem(job), ".png", imageBytes);
  }

  async function editImage(job, model, imagePath) {
    var response = await postMultipartJson(job.baseUrl, "/v1/images/edits", [
      { name: "model", value: model },
      { name: "prompt", value: job.prompt },
      { name: "operation", value: job.imageOperation || "redraw" },
      { name: "response_format", value: "b64_json" },
      { name: "image", filePath: imagePath }
    ]);
    var imageBytes = openAiB64Bytes(response, "image");
    return writeOutput(outputStem(job), ".png", imageBytes);
  }

  async function generateVideo(job, model, referencePaths) {
    var result = await postJson(job.baseUrl, "/api/media/generate-video", {
      model: model,
      prompt: job.prompt,
      referenceMedia: referencePaths.map(fileToReferenceMedia)
    });
    if (!result.operationName) {
      throw new Error("视频生成响应缺少 operationName");
    }
    await waitForOperation(job.baseUrl, result.operationName, model, Number(job.pollSeconds || 600));
    var video = await postJsonBytes(job.baseUrl, "/api/media/video-download", {
      operationName: result.operationName,
      model: model
    });
    return writeOutput(outputStem(job), extensionForContentType(video.contentType, ".mp4"), video.bytes);
  }

  async function textToSpeech(job, model) {
    var audio = await postJsonBytes(job.baseUrl, "/v1/audio/speech", {
      model: model,
      input: job.text,
      response_format: "wav"
    });
    return writeOutput(outputStem(job), extensionForContentType(audio.contentType, ".wav"), audio.bytes);
  }

  async function transcribe(job, model, audioPath) {
    var parts = [
      { name: "model", value: model },
      { name: "response_format", value: "json" }
    ];
    if (job.language) {
      parts.push({ name: "language", value: job.language });
    }
    parts.push({ name: "file", filePath: audioPath });
    var response = await postMultipartJson(job.baseUrl, "/v1/audio/transcriptions", parts);
    if (!response.text) {
      throw new Error("转写响应缺少 text");
    }
    var stem = outputStem(job);
    var txtPath = writeOutputText(stem, ".txt", response.text);
    var srtPath = writeOutputText(stem, ".srt", transcriptToSrt(response.text));
    return [txtPath, srtPath];
  }

  async function waitForOperation(baseUrl, operationName, model, pollSeconds) {
    var deadline = Date.now() + pollSeconds * 1000;
    while (Date.now() < deadline) {
      var status = await postJson(baseUrl, "/api/media/status", {
        operationName: operationName,
        model: model
      });
      if (status.done === true) {
        if (status.errorMessage) {
          throw new Error(String(status.errorMessage));
        }
        return;
      }
      await delay(2000);
    }
    throw new Error("等待生成超时：" + operationName);
  }

  async function resolveMediaInput(value, outputName, purpose) {
    if (value === "current-frame") {
      return exportCurrentFrame(outputName);
    }
    if (value === "current-clip-source") {
      return currentClipSourcePath();
    }
    if (value === "current-clip-render") {
      if (purpose === "image") {
        throw new Error("当前片段渲染不能作为图片输入");
      }
      return renderCurrentClip(outputName);
    }
    if (value === "timeline-inout-render") {
      if (purpose === "image") {
        throw new Error("时间线入出点片段不能作为图片输入");
      }
      return renderTimelineInOut(outputName, purpose);
    }
    if (!fs.existsSync(value)) {
      throw new Error("文件不存在：" + value);
    }
    return value;
  }

  async function getResolve() {
    if (state.resolve) {
      return state.resolve;
    }
    var workflowIntegration = require(path.join(__dirname, "WorkflowIntegration.node"));
    var initialized = await workflowIntegration.Initialize(PLUGIN_ID);
    if (!initialized) {
      throw new Error("无法初始化 Resolve Workflow Integration");
    }
    state.resolve = await workflowIntegration.GetResolve();
    if (!state.resolve) {
      throw new Error("无法获取 Resolve 对象");
    }
    return state.resolve;
  }

  async function currentProject(resolve) {
    var projectManager = await resolve.GetProjectManager();
    var project = await projectManager.GetCurrentProject();
    if (!project) {
      throw new Error("Resolve 当前没有打开项目");
    }
    return project;
  }

  async function currentTimeline(project) {
    var timeline = await project.GetCurrentTimeline();
    if (!timeline) {
      throw new Error("Resolve 当前没有时间线");
    }
    return timeline;
  }

  async function currentVideoItem() {
    var resolve = await getResolve();
    var project = await currentProject(resolve);
    var timeline = await currentTimeline(project);
    var item = await timeline.GetCurrentVideoItem();
    if (!item) {
      throw new Error("播放头位置没有当前视频片段");
    }
    return item;
  }

  async function exportCurrentFrame(outputName) {
    var resolve = await getResolve();
    var project = await currentProject(resolve);
    var outputPath = path.join(cacheDir, safeStem(outputName) + ".png");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    var ok = await project.ExportCurrentFrameAsStill(outputPath);
    if (!ok) {
      throw new Error("Resolve 导出当前帧失败");
    }
    return outputPath;
  }

  async function currentClipSourcePath() {
    var item = await currentVideoItem();
    var mediaPoolItem = await item.GetMediaPoolItem();
    if (!mediaPoolItem) {
      throw new Error("当前片段没有 Media Pool 条目");
    }
    var filePath = await mediaPoolItem.GetClipProperty("File Path");
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error("当前片段源文件不存在：" + filePath);
    }
    return filePath;
  }

  async function renderCurrentClip(outputName) {
    var item = await currentVideoItem();
    return renderRange(
      outputName,
      frameNumber(await item.GetStart(false), "当前片段起点"),
      frameNumber(await item.GetEnd(false), "当前片段终点")
    );
  }

  async function renderTimelineInOut(outputName, purpose) {
    var resolve = await getResolve();
    var project = await currentProject(resolve);
    var timeline = await currentTimeline(project);
    var marks = await timeline.GetMarkInOut();
    var mark = marks && (marks[purpose === "audio" ? "audio" : "video"] || marks.video || marks.audio);
    if (!mark) {
      throw new Error("Resolve 时间线没有入出点范围");
    }
    return renderRange(outputName, frameNumber(mark.in, "入点"), frameNumber(mark.out, "出点"));
  }

  async function renderRange(outputName, markIn, markOut) {
    if (markOut <= markIn) {
      throw new Error("渲染范围终点必须大于起点");
    }
    var resolve = await getResolve();
    var project = await currentProject(resolve);
    var outputPath = path.join(cacheDir, safeStem(outputName) + ".mp4");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    if (!(await project.SetCurrentRenderFormatAndCodec("mp4", "H.264"))) {
      throw new Error("Resolve 配置 MP4/H.264 渲染失败");
    }
    if (!(await project.SetRenderSettings({
      SelectAllFrames: false,
      MarkIn: markIn,
      MarkOut: markOut,
      TargetDir: path.dirname(outputPath),
      CustomName: path.basename(outputPath, path.extname(outputPath)),
      ExportVideo: true,
      ExportAudio: true,
      VideoQuality: "Medium",
      NetworkOptimization: true
    }))) {
      throw new Error("Resolve 设置渲染范围失败");
    }
    var jobId = await project.AddRenderJob();
    if (!jobId) {
      throw new Error("Resolve 创建渲染任务失败");
    }
    if (!(await project.StartRendering([jobId], false))) {
      throw new Error("Resolve 启动渲染失败");
    }
    var deadline = Date.now() + 1800 * 1000;
    while (await project.IsRenderingInProgress()) {
      if (Date.now() >= deadline) {
        await project.StopRendering();
        throw new Error("等待 Resolve 渲染参考源超时");
      }
      await delay(1000);
    }
    var rendered = findRenderedFile(outputPath);
    if (!rendered) {
      throw new Error("Resolve 渲染结束但未找到输出文件");
    }
    return rendered;
  }

  async function importOutputs(job, paths) {
    if (job.importToResolve !== true) {
      return;
    }
    var resolve = await getResolve();
    var project = await currentProject(resolve);
    var mediaPool = await project.GetMediaPool();
    var imported = await mediaPool.ImportMedia(paths);
    if (!imported || imported.length === 0) {
      throw new Error("Resolve 导入生成结果失败");
    }
    if (job.appendToTimeline === true && !(await mediaPool.AppendToTimeline(imported))) {
      throw new Error("Resolve 追加到时间线失败");
    }
  }

  async function getJson(baseUrl, routePath) {
    var response = await fetchUrl(baseUrl, routePath, { method: "GET", headers: requestHeaders() });
    return readJsonResponse(response, routePath);
  }

  async function postJson(baseUrl, routePath, payload) {
    var headers = requestHeaders({ "Content-Type": "application/json" });
    var response = await fetchUrl(baseUrl, routePath, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    });
    return readJsonResponse(response, routePath);
  }

  async function postMultipartJson(baseUrl, routePath, parts) {
    var multipart = multipartBody(parts);
    var response = await fetchUrl(baseUrl, routePath, {
      method: "POST",
      headers: requestHeaders({ "Content-Type": "multipart/form-data; boundary=" + multipart.boundary }),
      body: multipart.body
    });
    return readJsonResponse(response, routePath);
  }

  async function postJsonBytes(baseUrl, routePath, payload) {
    var headers = requestHeaders({ "Content-Type": "application/json" });
    var response = await fetchUrl(baseUrl, routePath, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(routePath + " HTTP " + response.status + ": " + await response.text());
    }
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("Content-Type") || "application/octet-stream"
    };
  }

  async function readJsonResponse(response, routePath) {
    if (!response.ok) {
      throw new Error(routePath + " HTTP " + response.status + ": " + await response.text());
    }
    var contentType = response.headers.get("Content-Type") || "";
    if (contentType.indexOf("application/json") === -1) {
      throw new Error(routePath + " 返回 " + (contentType || "unknown") + "，不是 JSON");
    }
    return response.json();
  }

  function fetchUrl(baseUrl, routePath, options) {
    var url = baseUrl.replace(/\/+$/, "") + "/" + routePath.replace(/^\/+/, "");
    if (ipcRenderer && typeof ipcRenderer.invoke === "function") {
      return electronFetch(url, options);
    }
    if (net && typeof net.fetch === "function") {
      return net.fetch(url, options);
    }
    return fetch(url, options);
  }

  async function electronFetch(url, options) {
    var payload = await ipcRenderer.invoke("imagine-http", {
      url: url,
      method: options.method || "GET",
      headers: options.headers || {},
      bodyBase64: bodyBase64(options.body)
    });
    var bytes = Buffer.from(payload.bodyBase64 || "", "base64");
    return {
      ok: payload.ok,
      status: payload.status,
      headers: {
        get: function (name) {
          return payload.headers[String(name).toLowerCase()] || "";
        }
      },
      text: function () {
        return Promise.resolve(bytes.toString("utf8"));
      },
      json: function () {
        return Promise.resolve(JSON.parse(bytes.toString("utf8")));
      },
      arrayBuffer: function () {
        return Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      }
    };
  }

  function bodyBase64(body) {
    if (!body) {
      return "";
    }
    if (typeof body === "string") {
      return Buffer.from(body, "utf8").toString("base64");
    }
    if (Buffer.isBuffer(body)) {
      return body.toString("base64");
    }
    throw new Error("插件网络层不支持此请求体");
  }

  function explainError(error, job) {
    var message = errorMessage(error);
    if (message === "Failed to fetch") {
      return [
        "无法连接 Workbench：" + job.baseUrl,
        "请确认 Workbench 正在运行，且地址可以从 Resolve 插件访问。",
        "原始错误：" + message
      ].join("\n");
    }
    if (message.indexOf("API key is required") !== -1) {
      return [
        "供应商 API Key 缺失。",
        "请在 Workbench 设置中保存 Provider Key，或在“供应商连接”里临时填写 12AI Key / MiMo Key。",
        "原始错误：" + message
      ].join("\n");
    }
    return message;
  }

  function errorMessage(error) {
    return error && error.message ? error.message : String(error);
  }

  function requestHeaders(extra) {
    var headers = Object.assign({ Accept: "*/*" }, extra || {});
    var shared = sharedCredentialForOperation(state.activeOperation || state.operation);
    addHeader(headers, "Authorization", process.env.IMAGINE_WORKBENCH_API_KEY ? "Bearer " + process.env.IMAGINE_WORKBENCH_API_KEY : "");
    addHeader(headers, "x-ai-api-key", providerApiKeyForOperation(state.activeOperation || state.operation) || process.env.IMAGINE_PROVIDER_API_KEY);
    addHeader(headers, "x-ai-base-url", inputValue(providerBaseUrlInput) || shared.baseUrl || process.env.IMAGINE_PROVIDER_BASE_URL);
    addHeader(headers, "x-ai-provider-label", inputValue(providerLabelInput) || shared.providerLabel || process.env.IMAGINE_PROVIDER_LABEL);
    return headers;
  }

  function providerApiKeyForOperation(operation) {
    return inputProviderApiKeyForOperation(operation) || sharedCredentialForOperation(operation).apiKey || "";
  }

  function inputProviderApiKeyForOperation(operation) {
    if (operation === "tts" || operation === "transcribe") {
      return inputValue(mimoApiKeyInput);
    }
    if (operation === "generate-image" || operation === "edit-image" || operation === "generate-video") {
      return inputValue(twelveApiKeyInput);
    }
    return "";
  }

  function sharedCredentialForOperation(operation) {
    var provider = providerForOperation(operation);
    if (!provider || !state.sharedCredentials || !state.sharedCredentials[provider]) {
      return {};
    }
    return state.sharedCredentials[provider];
  }

  function providerForOperation(operation) {
    if (operation === "tts" || operation === "transcribe") {
      return "mimo";
    }
    if (operation === "generate-image" || operation === "edit-image" || operation === "generate-video") {
      return "12ai";
    }
    return "";
  }

  function isLocalWorkbenchUrl(value) {
    try {
      var parsed = new URL(value);
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
    } catch {
      return false;
    }
  }

  function inputValue(input) {
    return input && input.value ? input.value.trim() : "";
  }

  function addHeader(headers, name, value) {
    if (value) {
      headers[name] = value;
    }
  }

  function openAiB64Bytes(response, kind) {
    if (!response.data || !response.data[0] || !response.data[0].b64_json) {
      throw new Error(kind + " 响应缺少 data[0].b64_json");
    }
    return Buffer.from(response.data[0].b64_json, "base64");
  }

  function fileToReferenceMedia(filePath) {
    var contentType = contentTypeForPath(filePath);
    var type = contentType.split("/")[0];
    if (["image", "video", "audio"].indexOf(type) === -1) {
      throw new Error("不支持的参考源类型：" + filePath);
    }
    return {
      dataUri: "data:" + contentType + ";base64," + fs.readFileSync(filePath).toString("base64"),
      type: type
    };
  }

  function contentTypeForPath(filePath) {
    var ext = path.extname(filePath).toLowerCase();
    if (ext === ".png") return "image/png";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".webp") return "image/webp";
    if (ext === ".mp4") return "video/mp4";
    if (ext === ".mov") return "video/quicktime";
    if (ext === ".mp3") return "audio/mpeg";
    if (ext === ".wav") return "audio/wav";
    return "application/octet-stream";
  }

  function multipartBody(parts) {
    var boundary = "----ImagineResolve" + Date.now().toString(36);
    var chunks = [];
    parts.forEach(function (part) {
      chunks.push(Buffer.from("--" + boundary + "\r\n", "utf8"));
      if (part.filePath) {
        chunks.push(Buffer.from(
          'Content-Disposition: form-data; name="' + part.name + '"; filename="' + path.basename(part.filePath) + '"\r\n' +
          "Content-Type: " + contentTypeForPath(part.filePath) + "\r\n\r\n",
          "utf8"
        ));
        chunks.push(fs.readFileSync(part.filePath));
        chunks.push(Buffer.from("\r\n", "utf8"));
      } else {
        chunks.push(Buffer.from(
          'Content-Disposition: form-data; name="' + part.name + '"\r\n\r\n' +
          String(part.value) + "\r\n",
          "utf8"
        ));
      }
    });
    chunks.push(Buffer.from("--" + boundary + "--\r\n", "utf8"));
    return {
      boundary: boundary,
      body: Buffer.concat(chunks)
    };
  }

  function extensionForContentType(contentType, fallback) {
    var lower = contentType.toLowerCase();
    if (lower.indexOf("audio/wav") !== -1 || lower.indexOf("audio/x-wav") !== -1) return ".wav";
    if (lower.indexOf("audio/mpeg") !== -1) return ".mp3";
    if (lower.indexOf("video/quicktime") !== -1) return ".mov";
    if (lower.indexOf("video/") !== -1) return ".mp4";
    if (lower.indexOf("image/jpeg") !== -1) return ".jpg";
    if (lower.indexOf("image/webp") !== -1) return ".webp";
    if (lower.indexOf("image/") !== -1) return ".png";
    return fallback;
  }

  function outputStem(job) {
    return job.outputName || "imagine_" + job.operation + "_" + Math.floor(Date.now() / 1000);
  }

  function writeOutput(stem, extension, bytes) {
    fs.mkdirSync(outputDir, { recursive: true });
    var outputPath = path.join(outputDir, safeStem(stem) + extension);
    fs.writeFileSync(outputPath, bytes);
    return outputPath;
  }

  function writeOutputText(stem, extension, text) {
    fs.mkdirSync(outputDir, { recursive: true });
    var outputPath = path.join(outputDir, safeStem(stem) + extension);
    fs.writeFileSync(outputPath, text, "utf8");
    return outputPath;
  }

  function safeStem(value) {
    var safe = String(value || "").trim().replace(/[^0-9A-Za-z_\-\u4e00-\u9fa5]/g, "_").slice(0, 96);
    if (!safe) {
      throw new Error("输出名称无效");
    }
    return safe;
  }

  function frameNumber(value, name) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error("Resolve 未提供有效帧号：" + name);
    }
    return Math.floor(number);
  }

  function findRenderedFile(expectedPath) {
    if (fs.existsSync(expectedPath)) {
      return expectedPath;
    }
    var dir = path.dirname(expectedPath);
    var stem = path.basename(expectedPath, path.extname(expectedPath));
    var matches = fs.readdirSync(dir)
      .filter(function (file) { return file.indexOf(stem + ".") === 0; })
      .map(function (file) { return path.join(dir, file); })
      .filter(function (file) { return fs.statSync(file).isFile(); })
      .sort(function (a, b) { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; });
    return matches[0] || "";
  }

  function transcriptToSrt(text) {
    return "1\n00:00:00,000 --> 00:00:05,000\n" + String(text).trim().replace(/\s+/g, " ") + "\n";
  }

  function requireText(value, name) {
    if (!value || !String(value).trim()) {
      throw new Error(name + "不能为空");
    }
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function describeJob(job) {
    var lines = [operationConfigs[job.operation].title];
    if (job.reference && job.reference.length) {
      lines.push("参考源：" + (sourceLabels[job.reference[0]] || job.reference[0]));
    }
    if (job.image) {
      lines.push("参考源：" + (sourceLabels[job.image] || job.image));
    }
    if (job.audio) {
      lines.push("参考源：" + (sourceLabels[job.audio] || job.audio));
    }
    if (job.outputName) {
      lines.push("输出名称：" + job.outputName);
    }
    return lines.join("\n");
  }

  function setupTabs() {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (button) {
      button.addEventListener("click", function () {
        state.tab = button.getAttribute("data-tab");
        Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (item) {
          item.classList.toggle("active", item === button);
        });
        var visible = visibleOperations();
        if (visible.indexOf(state.operation) === -1) {
          state.operation = visible[0];
        }
        selectOperation(state.operation);
      });
    });
  }

  document.getElementById("saveButton").addEventListener("click", function () {
    try {
      persistSettings();
      var job = buildJob();
      saveJob(job);
      setStatus("已保存任务\n" + describeJob(job) + "\n\n" + jobPath);
    } catch (error) {
      setStatus("保存失败\n" + error.message);
    }
  });

  document.getElementById("doctorButton").addEventListener("click", function () {
    runJob("doctor");
  });

  runButton.addEventListener("click", function () {
    runJob();
  });

  document.getElementById("openOutputButton").addEventListener("click", function () {
    if (shell) {
      fs.mkdirSync(outputDir, { recursive: true });
      shell.openPath(outputDir);
    }
  });

  restoreSettings();
  setupTabs();
  selectOperation(state.operation);
  if (!hasNode) {
    setStatus("浏览器预览模式：界面可查看，运行需从 Resolve Workflow Integrations 打开。");
  }
})();
