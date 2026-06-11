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
  var RESOLVE_BIN_ROOT = "Imagine Workbench";
  var CACHE_MAX_AGE_MS = 72 * 60 * 60 * 1000;
  var DEFAULT_MODELS = {
    "generate-image": "12ai:gemini-3.1-flash-image-preview",
    "image-to-image": "12ai:gemini-3.1-flash-image-preview",
    "edit-image": "12ai:gemini-3.1-flash-image-preview",
    "generate-video": "12ai:omni_flash-10s",
    "tts": "mimo:mimo-v2.5-tts",
    "transcribe": "mimo:mimo-v2.5-asr"
  };
  var OPERATION_CAPABILITY_IDS = {
    "generate-image": "generate_image",
    "image-to-image": "edit_image",
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
      icon: "image",
      promptLabel: "提示词",
      placeholder: "描述要生成的画面",
      sources: [],
      canImport: true,
      canAppend: false
    },
    "image-to-image": {
      tab: "image",
      title: "图生图",
      subtitle: "参考当前帧整体生成",
      icon: "reference",
      promptLabel: "提示词",
      placeholder: "描述要基于参考图生成的新画面或风格",
      sources: ["current-frame", "current-clip-source"],
      canImport: true,
      canAppend: false
    },
    "edit-image": {
      tab: "image",
      title: "图像编辑",
      subtitle: "基于当前帧或图片重绘",
      icon: "edit",
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
      icon: "video",
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
      icon: "caption",
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
      icon: "voice",
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
      icon: "status",
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
      title: "工具",
      subtitle: "生成图片、图生图，或基于当前帧局部编辑"
    },
    video: {
      title: "工具",
      subtitle: "用提示词和参考片段生成新镜头"
    },
    audio: {
      title: "工具",
      subtitle: "生成配音，转写音频或视频字幕"
    },
    apps: {
      title: "工具",
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
    sharedCredentials: {},
    preparedMask: null,
    lastOutputs: [],
    lastOutputJob: null,
    lastImportDone: false,
    promptDraft: "",
    importToResolve: true,
    appendToTimeline: false
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
  var maskPrepareBlock = document.getElementById("maskPrepareBlock");
  var maskPrepareButton = document.getElementById("maskPrepareButton");
  var maskPrepareHint = document.getElementById("maskPrepareHint");
  var pollSecondsField = document.getElementById("pollSecondsField");
  var pollSecondsInput = document.getElementById("pollSecondsInput");
  var languageField = document.getElementById("languageField");
  var languageInput = document.getElementById("languageInput");
  var importInput = document.getElementById("importInput");
  var appendInput = document.getElementById("appendInput");
  var statusOutput = document.getElementById("statusOutput");
  var runButton = document.getElementById("runButton");
  var previewOutputButton = document.getElementById("previewOutputButton");
  var importResultButton = document.getElementById("importResultButton");
  var maskEditorModal = document.getElementById("maskEditorModal");
  var maskEditorTitle = document.getElementById("maskEditorTitle");
  var maskEditorHint = document.getElementById("maskEditorHint");
  var maskEditorCanvas = document.getElementById("maskEditorCanvas");
  var maskCanvasContext = maskEditorCanvas.getContext("2d");
  var brushSizeInput = document.getElementById("brushSizeInput");
  var brushSizeField = document.getElementById("brushSizeField");
  var outpaintFields = document.getElementById("outpaintFields");
  var outpaintLeftInput = document.getElementById("outpaintLeftInput");
  var outpaintRightInput = document.getElementById("outpaintRightInput");
  var outpaintTopInput = document.getElementById("outpaintTopInput");
  var outpaintBottomInput = document.getElementById("outpaintBottomInput");
  var maskClearButton = document.getElementById("maskClearButton");
  var maskApplyButton = document.getElementById("maskApplyButton");
  var maskCancelButton = document.getElementById("maskCancelButton");
  var maskEditorState = null;

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
      button.innerHTML = '<div class="card-icon">' + operationIcon(config.icon) + '</div><div class="card-title">' + config.title + '</div><div class="card-subtitle">' + config.subtitle + "</div>";
      button.addEventListener("click", function () {
        selectOperation(operation);
      });
      grid.appendChild(button);
    });
  }

  function operationIcon(name) {
    var attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    var icons = {
      image: '<svg ' + attrs + '><rect x="3.5" y="4" width="17" height="16" rx="2.5"></rect><circle cx="8.5" cy="9" r="1.5"></circle><path d="m4 17 5.2-5.2a1.6 1.6 0 0 1 2.25 0L16 16.4"></path><path d="m14 14.5 1.4-1.4a1.6 1.6 0 0 1 2.25 0L20.5 16"></path></svg>',
      edit: '<svg ' + attrs + '><path d="m13.5 5.5 5 5"></path><path d="M4.5 19.5 6 14l9.7-9.7a2.1 2.1 0 0 1 3 3L9 17z"></path><path d="m8.5 16 2.8 2.8"></path><path d="M15 15.5h5"></path><path d="M17.5 13v5"></path></svg>',
      video: '<svg ' + attrs + '><rect x="3.5" y="6" width="13" height="12" rx="2"></rect><path d="m16.5 10 4-2.3v8.6l-4-2.3z"></path><path d="M7.5 3.8 9 6"></path><path d="M13.5 3.8 12 6"></path></svg>',
      reference: '<svg ' + attrs + '><rect x="4" y="5" width="10" height="10" rx="2"></rect><path d="M8 19h8a4 4 0 0 0 4-4V7"></path><path d="m7.5 12 1.5-1.5a1 1 0 0 1 1.4 0L14 14"></path><path d="M17 4v5"></path><path d="M14.5 6.5h5"></path></svg>',
      caption: '<svg ' + attrs + '><rect x="4" y="5" width="16" height="14" rx="2.5"></rect><path d="M8 10h8"></path><path d="M8 14h4.8"></path></svg>',
      voice: '<svg ' + attrs + '><path d="M4 13v-2"></path><path d="M8 17V7"></path><path d="M12 20V4"></path><path d="M16 17V7"></path><path d="M20 13v-2"></path></svg>',
      status: '<svg ' + attrs + '><path d="M8.5 12a3.5 3.5 0 0 1 7 0"></path><path d="M6 15.5a7 7 0 0 1 12 0"></path><path d="M12 12l3-3"></path><path d="M12 19.5a7.5 7.5 0 1 0-7.5-7.5"></path></svg>'
    };
    return icons[name] || "";
  }

  function renderSources(config) {
    sourcePills.innerHTML = "";
    sourceBlock.classList.toggle("hidden", config.sources.length === 0);
    if (config.sources.length === 0) {
      state.source = "";
      clearPreparedMask();
      return;
    }
    if (config.sources.indexOf(state.source) === -1) {
      state.source = config.sources[0];
      clearPreparedMask();
    }
    config.sources.forEach(function (source) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "pill" + (source === state.source ? " active" : "");
      button.textContent = sourceLabels[source] || source;
      button.addEventListener("click", function () {
        state.source = source;
        clearPreparedMask();
        renderSources(config);
      });
      sourcePills.appendChild(button);
    });
  }

  function selectOperation(operation) {
    state.operation = operation;
    var config = operationConfigs[operation];
    var needsPrompt = config.promptLabel !== "无需提示词";
    promptLabel.textContent = config.promptLabel;
    promptInput.placeholder = config.placeholder;
    promptInput.disabled = !needsPrompt;
    promptInput.value = needsPrompt ? state.promptDraft : "";
    imageOperationField.classList.toggle("hidden", config.imageOperation !== true);
    pollSecondsField.classList.toggle("hidden", config.pollSeconds !== true);
    languageField.classList.toggle("hidden", config.language !== true);
    importInput.disabled = config.canImport !== true;
    appendInput.disabled = config.canAppend !== true;
    importInput.checked = config.canImport === true && state.importToResolve;
    appendInput.checked = config.canAppend === true && state.appendToTimeline;
    clearPreparedMask();
    renderSources(config);
    renderOperations();
    updateMaskPrepareUi();
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
    if (operation === "edit-image" || operation === "image-to-image") {
      job.image = state.source;
    }
    if (operation === "edit-image") {
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
    var keepLastOutputs = job.operation === "doctor";
    if (!keepLastOutputs) {
      setLastOutputs([]);
    }
    runButton.disabled = true;
    importResultButton.disabled = true;
    setStatus("运行中\n" + describeJob(job));
    try {
      await loadSharedCredentialsForJob(job);
      var result = await executeJob(job);
      saveJob(job);
      if (!keepLastOutputs) {
        setLastOutputs(result, job, job.importToResolve === true);
      }
      setStatus("已完成\n" + describeJob(job) + "\n\n" + result.join("\n"));
    } catch (error) {
      setStatus("运行失败\n" + explainError(error, job));
    } finally {
      state.running = false;
      state.activeOperation = "";
      runButton.disabled = false;
      updateImportResultButton();
      updateMaskPrepareUi();
    }
  }

  function setLastOutputs(paths, job, imported) {
    state.lastOutputs = paths || [];
    state.lastOutputJob = job || null;
    state.lastImportDone = imported === true;
    previewOutputButton.disabled = state.lastOutputs.length === 0;
    updateImportResultButton();
  }

  function updateImportResultButton() {
    var config = state.lastOutputJob ? operationConfigs[state.lastOutputJob.operation] : null;
    importResultButton.disabled = state.lastOutputs.length === 0 || !config || config.canImport !== true || state.lastImportDone === true;
  }

  async function executeJob(job) {
    if (job.operation === "doctor") {
      return doctor(job);
    }
    if (job.operation === "edit-image" || job.operation === "image-to-image") {
      requireImageEditPrompt(job);
      var maskResult = await prepareImageEditMask(job);
      var editModel = await modelForOperation(job.baseUrl, job.operation);
      var editedPath = await editImage(job, editModel, maskResult.imagePath, maskResult.maskPath);
      await importOutputs(job, [editedPath]);
      return [editedPath];
    }
    var model = await modelForOperation(job.baseUrl, job.operation);
    if (job.operation === "generate-image") {
      requireText(job.prompt, "提示词");
      var imagePath = await generateImage(job, model);
      await importOutputs(job, [imagePath]);
      return [imagePath];
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

  async function prepareImageEditMask(job) {
    if (job.operation === "image-to-image") {
      var referencePath = await resolveMediaInput(job.image, outputStem(job) + "_image", "image");
      return { imagePath: referencePath, maskPath: "" };
    }
    var operation = job.imageOperation || "redraw";
    if (operation === "cutout") {
      var imagePath = await resolveMediaInput(job.image, outputStem(job) + "_image", "image");
      return { imagePath: imagePath, maskPath: "" };
    }
    if (preparedMaskMatches(job)) {
      setStatus("使用已准备遮罩\n" + describeJob(job) + "\n" + preparedMaskSourceLine(state.preparedMask));
      return state.preparedMask.result;
    }
    throw new Error(maskRequiredMessage(operation));
  }

  async function prepareMaskFromButton() {
    if (!hasNode) {
      setStatus("浏览器预览模式不能准备遮罩。请从 Resolve Workflow Integrations 打开。");
      return;
    }
    if (state.running) {
      return;
    }
    var job = buildJob();
    if (job.operation !== "edit-image") {
      return;
    }
    var operation = job.imageOperation || "redraw";
    if (operation === "cutout") {
      return;
    }
    state.running = true;
    runButton.disabled = true;
    maskPrepareButton.disabled = true;
    setStatus("正在准备遮罩源\n" + describeJob(job));
    try {
      var editSource = await resolveMediaInput(job.image, outputStem(job) + "_image", "image");
      var result = await openMaskEditor(editSource, operation, outputStem(job));
      state.preparedMask = {
        source: job.image,
        operation: operation,
        sourcePath: editSource,
        result: result
      };
      setStatus("遮罩已准备，可点击运行\n" + describeJob(job) + "\n" + preparedMaskSourceLine(state.preparedMask));
    } catch (error) {
      setStatus("遮罩准备失败\n" + explainError(error, job));
    } finally {
      state.running = false;
      runButton.disabled = false;
      updateMaskPrepareUi();
    }
  }

  function preparedMaskMatches(job) {
    var prepared = state.preparedMask;
    if (!prepared) {
      return false;
    }
    if (prepared.source !== job.image || prepared.operation !== (job.imageOperation || "redraw")) {
      return false;
    }
    if (!prepared.sourcePath || !prepared.result || !prepared.result.maskPath) {
      return false;
    }
    return fs.existsSync(prepared.sourcePath) && fs.existsSync(prepared.result.imagePath) && fs.existsSync(prepared.result.maskPath);
  }

  function maskRequiredMessage(operation) {
    return imageEditOperationLabel(operation) + "需要先点击“打开遮罩编辑器”，应用遮罩后再运行。";
  }

  function preparedMaskSourceLine(prepared) {
    return "缓存源：" + path.basename(prepared.sourcePath);
  }

  function clearPreparedMask() {
    state.preparedMask = null;
    updateMaskPrepareUi();
  }

  function updateMaskPrepareUi() {
    if (!maskPrepareBlock) {
      return;
    }
    var visible = state.operation === "edit-image" && (imageOperationInput.value || "redraw") !== "cutout";
    maskPrepareBlock.classList.toggle("hidden", !visible);
    if (!visible) {
      return;
    }
    var operation = imageOperationInput.value || "redraw";
    maskPrepareButton.disabled = state.running;
    if (state.preparedMask && state.preparedMask.source === state.source && state.preparedMask.operation === operation) {
      maskPrepareButton.textContent = "重新准备遮罩";
      maskPrepareHint.textContent = "遮罩已准备，将使用缓存源：" + path.basename(state.preparedMask.sourcePath);
      return;
    }
    maskPrepareButton.textContent = "打开遮罩编辑器";
    maskPrepareHint.textContent = imageEditHint(operation);
  }

  function requireImageEditPrompt(job) {
    var operation = job.imageOperation || "redraw";
    if (operation === "redraw" || operation === "outpaint") {
      requireText(job.prompt, "提示词");
    }
  }

  function openMaskEditor(imagePath, operation, outputName) {
    return new Promise(function (resolve, reject) {
      loadLocalImage(imagePath).then(function (image) {
        var maskCanvas = document.createElement("canvas");
        maskCanvas.width = image.naturalWidth || image.width;
        maskCanvas.height = image.naturalHeight || image.height;
        var maskContext = maskCanvas.getContext("2d");
        maskContext.fillStyle = "black";
        maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        maskEditorState = {
          image: image,
          imagePath: imagePath,
          maskCanvas: maskCanvas,
          maskContext: maskContext,
          operation: operation,
          outputName: outputName,
          drawing: false,
          hasMask: false,
          lastPoint: null,
          resolve: resolve,
          reject: reject
        };
        maskEditorTitle.textContent = imageEditOperationLabel(operation);
        maskEditorHint.textContent = imageEditHint(operation);
        brushSizeField.classList.toggle("hidden", operation === "outpaint");
        outpaintFields.classList.toggle("hidden", operation !== "outpaint");
        maskEditorModal.classList.remove("hidden");
        drawMaskEditor();
        updateMaskApplyState();
      }).catch(reject);
    });
  }

  function loadLocalImage(filePath) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("遮罩编辑器无法读取图片：" + filePath)); };
      image.src = fileUrl(filePath);
    });
  }

  function drawMaskEditor() {
    if (!maskEditorState) {
      return;
    }
    if (maskEditorState.operation === "outpaint") {
      drawOutpaintEditor();
      return;
    }
    var image = maskEditorState.image;
    var size = fitSize(image.naturalWidth || image.width, image.naturalHeight || image.height, 960, 560);
    maskEditorCanvas.width = size.width;
    maskEditorCanvas.height = size.height;
    maskCanvasContext.clearRect(0, 0, size.width, size.height);
    maskCanvasContext.drawImage(image, 0, 0, size.width, size.height);
    drawMaskOverlay(size.width, size.height);
    maskCanvasContext.strokeStyle = "rgba(255,255,255,0.16)";
    maskCanvasContext.strokeRect(0.5, 0.5, size.width - 1, size.height - 1);
  }

  function drawMaskOverlay(width, height) {
    var overlay = document.createElement("canvas");
    overlay.width = width;
    overlay.height = height;
    var overlayContext = overlay.getContext("2d");
    overlayContext.drawImage(maskEditorState.maskCanvas, 0, 0, width, height);
    var pixels = overlayContext.getImageData(0, 0, width, height);
    for (var index = 0; index < pixels.data.length; index += 4) {
      var visible = pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2] > 24;
      pixels.data[index] = 255;
      pixels.data[index + 1] = 80;
      pixels.data[index + 2] = 70;
      pixels.data[index + 3] = visible ? 128 : 0;
    }
    overlayContext.putImageData(pixels, 0, 0);
    maskCanvasContext.drawImage(overlay, 0, 0);
  }

  function drawOutpaintEditor() {
    var image = maskEditorState.image;
    var margins = readOutpaintMargins();
    var sourceWidth = image.naturalWidth || image.width;
    var sourceHeight = image.naturalHeight || image.height;
    var outputWidth = sourceWidth + margins.left + margins.right;
    var outputHeight = sourceHeight + margins.top + margins.bottom;
    var size = fitSize(outputWidth, outputHeight, 960, 560);
    var scale = Math.min(size.width / outputWidth, size.height / outputHeight);
    maskEditorCanvas.width = Math.max(1, Math.round(outputWidth * scale));
    maskEditorCanvas.height = Math.max(1, Math.round(outputHeight * scale));
    maskCanvasContext.fillStyle = "#07080a";
    maskCanvasContext.fillRect(0, 0, maskEditorCanvas.width, maskEditorCanvas.height);
    maskCanvasContext.fillStyle = "rgba(183,255,23,0.14)";
    maskCanvasContext.fillRect(0, 0, maskEditorCanvas.width, maskEditorCanvas.height);
    maskCanvasContext.drawImage(
      image,
      margins.left * scale,
      margins.top * scale,
      sourceWidth * scale,
      sourceHeight * scale
    );
    maskCanvasContext.strokeStyle = "rgba(183,255,23,0.78)";
    maskCanvasContext.lineWidth = 2;
    maskCanvasContext.strokeRect(1, 1, maskEditorCanvas.width - 2, maskEditorCanvas.height - 2);
    maskCanvasContext.strokeStyle = "rgba(255,255,255,0.42)";
    maskCanvasContext.strokeRect(
      margins.left * scale,
      margins.top * scale,
      sourceWidth * scale,
      sourceHeight * scale
    );
  }

  function drawMaskStroke(point) {
    if (!maskEditorState || maskEditorState.operation === "outpaint") {
      return;
    }
    var scaleX = maskEditorState.maskCanvas.width / maskEditorCanvas.width;
    var scaleY = maskEditorState.maskCanvas.height / maskEditorCanvas.height;
    var current = { x: point.x * scaleX, y: point.y * scaleY };
    var previous = maskEditorState.lastPoint || current;
    maskEditorState.maskContext.strokeStyle = "white";
    maskEditorState.maskContext.lineCap = "round";
    maskEditorState.maskContext.lineJoin = "round";
    maskEditorState.maskContext.lineWidth = Number(brushSizeInput.value || 32) * ((scaleX + scaleY) / 2);
    maskEditorState.maskContext.beginPath();
    maskEditorState.maskContext.moveTo(previous.x, previous.y);
    maskEditorState.maskContext.lineTo(current.x, current.y);
    maskEditorState.maskContext.stroke();
    maskEditorState.lastPoint = current;
    maskEditorState.hasMask = true;
    drawMaskEditor();
    updateMaskApplyState();
  }

  function applyMaskEditor() {
    if (!maskEditorState) {
      return;
    }
    var result = maskEditorState.operation === "outpaint"
      ? writeOutpaintMaskResult(maskEditorState)
      : writeBrushMaskResult(maskEditorState);
    var resolve = maskEditorState.resolve;
    closeMaskEditor();
    resolve(result);
  }

  function writeBrushMaskResult(editor) {
    var maskPath = path.join(cacheDir, safeStem(editor.outputName) + "_mask.png");
    fs.mkdirSync(path.dirname(maskPath), { recursive: true });
    writeCanvasPng(maskPath, editor.maskCanvas);
    return { imagePath: editor.imagePath, maskPath: maskPath };
  }

  function writeOutpaintMaskResult(editor) {
    var margins = readOutpaintMargins();
    var sourceWidth = editor.image.naturalWidth || editor.image.width;
    var sourceHeight = editor.image.naturalHeight || editor.image.height;
    var outputWidth = sourceWidth + margins.left + margins.right;
    var outputHeight = sourceHeight + margins.top + margins.bottom;
    var baseCanvas = document.createElement("canvas");
    var maskCanvas = document.createElement("canvas");
    baseCanvas.width = outputWidth;
    baseCanvas.height = outputHeight;
    maskCanvas.width = outputWidth;
    maskCanvas.height = outputHeight;
    var baseContext = baseCanvas.getContext("2d");
    var maskContext = maskCanvas.getContext("2d");
    baseContext.clearRect(0, 0, outputWidth, outputHeight);
    baseContext.drawImage(editor.image, margins.left, margins.top, sourceWidth, sourceHeight);
    maskContext.fillStyle = "white";
    maskContext.fillRect(0, 0, outputWidth, outputHeight);
    maskContext.fillStyle = "black";
    maskContext.fillRect(margins.left, margins.top, sourceWidth, sourceHeight);
    var imagePath = path.join(cacheDir, safeStem(editor.outputName) + "_outpaint_base.png");
    var maskPath = path.join(cacheDir, safeStem(editor.outputName) + "_outpaint_mask.png");
    fs.mkdirSync(path.dirname(imagePath), { recursive: true });
    writeCanvasPng(imagePath, baseCanvas);
    writeCanvasPng(maskPath, maskCanvas);
    return { imagePath: imagePath, maskPath: maskPath };
  }

  function closeMaskEditor() {
    maskEditorModal.classList.add("hidden");
    maskEditorState = null;
    maskApplyButton.disabled = true;
  }

  function cancelMaskEditor() {
    if (!maskEditorState) {
      return;
    }
    var reject = maskEditorState.reject;
    closeMaskEditor();
    reject(new Error("已取消遮罩编辑"));
  }

  function clearMaskEditor() {
    if (!maskEditorState) {
      return;
    }
    maskEditorState.maskContext.fillStyle = "black";
    maskEditorState.maskContext.fillRect(0, 0, maskEditorState.maskCanvas.width, maskEditorState.maskCanvas.height);
    maskEditorState.hasMask = false;
    maskEditorState.lastPoint = null;
    drawMaskEditor();
    updateMaskApplyState();
  }

  function updateMaskApplyState() {
    if (!maskEditorState) {
      maskApplyButton.disabled = true;
      return;
    }
    if (maskEditorState.operation === "outpaint") {
      var margins = readOutpaintMargins();
      maskApplyButton.disabled = margins.left + margins.right + margins.top + margins.bottom <= 0;
      return;
    }
    maskApplyButton.disabled = !maskEditorState.hasMask;
  }

  function readOutpaintMargins() {
    return {
      left: clampNumber(outpaintLeftInput.value, 0, 1200),
      right: clampNumber(outpaintRightInput.value, 0, 1200),
      top: clampNumber(outpaintTopInput.value, 0, 1200),
      bottom: clampNumber(outpaintBottomInput.value, 0, 1200)
    };
  }

  function fitSize(width, height, maxWidth, maxHeight) {
    var scale = Math.min(maxWidth / width, maxHeight / height, 1);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  function canvasPoint(event) {
    var rect = maskEditorCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (maskEditorCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (maskEditorCanvas.height / rect.height)
    };
  }

  function writeCanvasPng(filePath, canvas) {
    var base64 = canvas.toDataURL("image/png").split(",")[1] || "";
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
  }

  function fileUrl(filePath) {
    return "file://" + encodeURI(filePath).replace(/#/g, "%23");
  }

  function clampNumber(value, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function imageEditOperationLabel(operation) {
    if (operation === "erase") return "擦除遮罩";
    if (operation === "outpaint") return "扩图遮罩";
    return "重绘遮罩";
  }

  function imageEditHint(operation) {
    if (operation === "erase") return "涂白要移除的区域，然后应用遮罩。";
    if (operation === "outpaint") return "设置要扩展的四边像素，新区域会自动作为白色遮罩。";
    return "涂白要重绘的区域，然后应用遮罩。";
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
    return writeOutput(job, ".png", imageBytes);
  }

  async function editImage(job, model, imagePath, maskPath) {
    var parts = [
      { name: "model", value: model },
      { name: "operation", value: job.imageOperation || "redraw" },
      { name: "response_format", value: "b64_json" },
      { name: "image", filePath: imagePath }
    ];
    if (job.prompt) {
      parts.push({ name: "prompt", value: job.prompt });
    }
    if (maskPath) {
      parts.push({ name: "mask", filePath: maskPath });
    }
    var response = await postMultipartJson(job.baseUrl, "/v1/images/edits", parts);
    var imageBytes = openAiB64Bytes(response, "image");
    return writeOutput(job, ".png", imageBytes);
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
    await waitForOperation(job, result.operationName, model, Number(job.pollSeconds || 600));
    setStatus("生成完成，正在下载视频\n" + describeJob(job));
    var video = await postJsonBytes(job.baseUrl, "/api/media/video-download", {
      operationName: result.operationName,
      model: model
    });
    return writeOutput(job, extensionForContentType(video.contentType, ".mp4"), video.bytes);
  }

  async function textToSpeech(job, model) {
    var audio = await postJsonBytes(job.baseUrl, "/v1/audio/speech", {
      model: model,
      input: job.text,
      response_format: "wav"
    });
    return writeOutput(job, extensionForContentType(audio.contentType, ".wav"), audio.bytes);
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
    var txtPath = writeOutputText(job, ".txt", response.text);
    var srtPath = writeOutputText(job, ".srt", transcriptToSrt(response.text));
    return [txtPath, srtPath];
  }

  async function waitForOperation(job, operationName, model, pollSeconds) {
    var deadline = Date.now() + pollSeconds * 1000;
    while (Date.now() < deadline) {
      var status = await postJson(job.baseUrl, "/api/media/status", {
        operationName: operationName,
        model: model
      });
      setStatus("生成中\n" + describeJob(job) + "\n\n" + formatOperationStatus(status));
      if (status.done === true || isCompleteOperationStatus(status.status)) {
        if (status.errorMessage) {
          throw new Error(String(status.errorMessage));
        }
        return;
      }
      await delay(2000);
    }
    throw new Error("等待生成超时：" + operationName);
  }

  function formatOperationStatus(status) {
    var progress = Number(status.progress);
    var lines = ["状态：" + (status.status || "processing")];
    if (Number.isFinite(progress)) {
      lines.push("进度：" + Math.max(0, Math.min(100, Math.round(progress))) + "%");
    }
    if (status.url) {
      lines.push("后端结果已就绪");
    }
    return lines.join("\n");
  }

  function isCompleteOperationStatus(status) {
    var value = String(status || "").toLowerCase();
    return ["complete", "completed", "succeeded", "success"].indexOf(value) !== -1;
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
      return renderCurrentClip(outputName, purpose);
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

  async function renderCurrentClip(outputName, purpose) {
    var item = await currentVideoItem();
    return renderRange(
      outputName,
      frameNumber(await item.GetStart(false), "当前片段起点"),
      frameNumber(await item.GetEnd(false), "当前片段终点"),
      purpose
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
    return renderRange(outputName, frameNumber(mark.in, "入点"), frameNumber(mark.out, "出点"), purpose);
  }

  async function renderRange(outputName, markIn, markOut, purpose) {
    if (markOut <= markIn) {
      throw new Error("渲染范围终点必须大于起点");
    }
    var resolve = await getResolve();
    var project = await currentProject(resolve);
    var renderTarget = await selectRenderTarget(project, purpose || "reference");
    var outputPath = path.join(cacheDir, safeStem(outputName) + renderTarget.extension);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    var renderSettings = {
      SelectAllFrames: false,
      MarkIn: markIn,
      MarkOut: markOut,
      TargetDir: path.dirname(outputPath),
      CustomName: path.basename(outputPath, path.extname(outputPath)),
      ExportVideo: renderTarget.exportVideo,
      ExportAudio: true
    };
    if (renderTarget.exportVideo) {
      renderSettings.VideoQuality = "Medium";
      renderSettings.NetworkOptimization = true;
    }
    if (!(await project.SetRenderSettings(renderSettings))) {
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

  async function selectRenderTarget(project, purpose) {
    if (purpose === "audio") {
      return setFirstSupportedRenderCodec(project, [
        { format: "wav", codec: "Linear PCM", extension: ".wav", exportVideo: false },
        { format: "Wave", codec: "Linear PCM", extension: ".wav", exportVideo: false },
        { format: "AIFF", codec: "Linear PCM", extension: ".aiff", exportVideo: false },
        { format: "QuickTime", codec: "Linear PCM", extension: ".mov", exportVideo: false }
      ], "音频参考源");
    }
    return setFirstSupportedRenderCodec(project, [
      { format: "mp4", codec: "H.264", extension: ".mp4", exportVideo: true },
      { format: "MP4", codec: "H.264", extension: ".mp4", exportVideo: true },
      { format: "QuickTime", codec: "H.264", extension: ".mov", exportVideo: true },
      { format: "mov", codec: "H.264", extension: ".mov", exportVideo: true },
      { format: "QuickTime", codec: "Apple ProRes 422 LT", extension: ".mov", exportVideo: true },
      { format: "QuickTime", codec: "Apple ProRes 422", extension: ".mov", exportVideo: true }
    ], "视频参考源");
  }

  async function setFirstSupportedRenderCodec(project, preferredTargets, label) {
    var targets = preferredTargets.concat(await discoveredRenderTargets(project, preferredTargets[0].exportVideo));
    var tried = [];
    for (var index = 0; index < targets.length; index += 1) {
      var target = targets[index];
      var key = target.format + "/" + target.codec;
      if (tried.indexOf(key) !== -1) {
        continue;
      }
      tried.push(key);
      try {
        if (await project.SetCurrentRenderFormatAndCodec(target.format, target.codec)) {
          return target;
        }
      } catch {
        // Resolve rejects unsupported combinations by throwing; continue with the next candidate.
      }
    }
    throw new Error("Resolve 没有可用的" + label + "渲染格式。已尝试：" + tried.join(", "));
  }

  async function discoveredRenderTargets(project, exportVideo) {
    if (typeof project.GetRenderFormats !== "function" || typeof project.GetRenderCodecs !== "function") {
      return [];
    }
    var formats = await project.GetRenderFormats();
    var targets = [];
    var formatNames = Object.keys(formats || {});
    for (var index = 0; index < formatNames.length; index += 1) {
      var formatName = formatNames[index];
      var formatValue = formats[formatName];
      var candidates = [formatName, formatValue];
      for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        var format = candidates[candidateIndex];
        if (!format || shouldSkipRenderFormat(format, exportVideo)) {
          continue;
        }
        targets = targets.concat(await renderCodecTargets(project, String(format), exportVideo));
      }
    }
    return targets;
  }

  async function renderCodecTargets(project, format, exportVideo) {
    try {
      var codecs = await project.GetRenderCodecs(format);
      var targets = [];
      Object.keys(codecs || {}).forEach(function (codecName) {
        var codecValue = codecs[codecName];
        [codecName, codecValue].forEach(function (codec) {
          if (codec && codecLooksUsable(codec, exportVideo)) {
            targets.push({
              format: format,
              codec: String(codec),
              extension: renderExtension(format, exportVideo),
              exportVideo: exportVideo
            });
          }
        });
      });
      return targets;
    } catch {
      return [];
    }
  }

  function shouldSkipRenderFormat(format, exportVideo) {
    var lower = String(format).toLowerCase();
    if (exportVideo) {
      return lower.indexOf("audio") !== -1 || lower === "wav" || lower === "aiff";
    }
    return !(lower.indexOf("wav") !== -1 || lower.indexOf("wave") !== -1 || lower.indexOf("aiff") !== -1 || lower.indexOf("quicktime") !== -1 || lower === "mov");
  }

  function codecLooksUsable(codec, exportVideo) {
    var lower = String(codec).toLowerCase();
    if (exportVideo) {
      return lower.indexOf("h.264") !== -1 || lower.indexOf("prores") !== -1 || lower.indexOf("dnxhr") !== -1;
    }
    return lower.indexOf("pcm") !== -1 || lower.indexOf("wav") !== -1 || lower.indexOf("audio") !== -1;
  }

  function renderExtension(format, exportVideo) {
    var lower = String(format).toLowerCase();
    if (!exportVideo) {
      if (lower.indexOf("aiff") !== -1) return ".aiff";
      if (lower.indexOf("quicktime") !== -1 || lower === "mov") return ".mov";
      return ".wav";
    }
    if (lower.indexOf("quicktime") !== -1 || lower === "mov") return ".mov";
    return ".mp4";
  }

  async function importOutputs(job, paths) {
    if (job.importToResolve !== true) {
      return;
    }
    await importSavedOutputs(job, paths, job.appendToTimeline === true);
  }

  async function importSavedOutputs(job, paths, appendToTimeline) {
    setStatus("结果已保存，正在导入达芬奇\n" + describeJob(job) + "\n\n" + paths.join("\n"));
    var resolve = await getResolve();
    var project = await currentProject(resolve);
    var mediaPool = await project.GetMediaPool();
    var previousFolder = typeof mediaPool.GetCurrentFolder === "function" ? await mediaPool.GetCurrentFolder() : null;
    var category = outputCategory(job);
    var targetFolder = await ensureResolveOutputFolder(mediaPool, category.folder);
    if (!(await mediaPool.SetCurrentFolder(targetFolder))) {
      throw new Error("Resolve 切换导入 Bin 失败：" + RESOLVE_BIN_ROOT + "/" + category.folder);
    }
    var imported = null;
    try {
      imported = await mediaPool.ImportMedia(paths);
    } finally {
      if (previousFolder) {
        await mediaPool.SetCurrentFolder(previousFolder);
      }
    }
    if (!imported || imported.length === 0) {
      throw new Error("Resolve 导入生成结果失败");
    }
    if (appendToTimeline === true && !(await mediaPool.AppendToTimeline(imported))) {
      throw new Error("Resolve 追加到时间线失败");
    }
  }

  async function ensureResolveOutputFolder(mediaPool, categoryName) {
    if (typeof mediaPool.GetRootFolder !== "function" || typeof mediaPool.AddSubFolder !== "function" || typeof mediaPool.SetCurrentFolder !== "function") {
      throw new Error("Resolve Media Pool API 不支持分类导入");
    }
    var rootFolder = await mediaPool.GetRootFolder();
    var workbenchFolder = await findOrCreateSubFolder(mediaPool, rootFolder, RESOLVE_BIN_ROOT);
    return findOrCreateSubFolder(mediaPool, workbenchFolder, categoryName);
  }

  async function findOrCreateSubFolder(mediaPool, parentFolder, folderName) {
    if (!parentFolder || typeof parentFolder.GetSubFolderList !== "function") {
      throw new Error("Resolve Media Pool Folder API 不支持读取子 Bin");
    }
    var folders = await parentFolder.GetSubFolderList();
    for (var index = 0; index < folders.length; index += 1) {
      if (typeof folders[index].GetName === "function" && await folders[index].GetName() === folderName) {
        return folders[index];
      }
    }
    var created = await mediaPool.AddSubFolder(parentFolder, folderName);
    if (!created) {
      throw new Error("Resolve 创建 Bin 失败：" + folderName);
    }
    return created;
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
    if (message.indexOf("provider_unavailable") !== -1 || message.indexOf("No available channel") !== -1) {
      return [
        "视频模型渠道当前不可用。",
        "这不是 Resolve 插件安装失败；请稍后重试，或在 Workbench 后端/供应商账号中切换可用的视频模型渠道。",
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
    if (operation === "generate-image" || operation === "image-to-image" || operation === "edit-image" || operation === "generate-video") {
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
    if (operation === "generate-image" || operation === "image-to-image" || operation === "edit-image" || operation === "generate-video") {
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
    if (ext === ".aiff" || ext === ".aif") return "audio/aiff";
    return "application/octet-stream";
  }

  function multipartBody(parts) {
    var boundary = "----ImagineResolve" + Date.now().toString(36);
    var chunks = [];
    parts.forEach(function (part) {
      chunks.push(Buffer.from("--" + boundary + "\r\n", "utf8"));
      if (part.filePath) {
        chunks.push(Buffer.from(
          'Content-Disposition: form-data; name="' + part.name + '"; filename="' + multipartFilename(part) + '"\r\n' +
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

  function multipartFilename(part) {
    var ext = path.extname(part.filePath || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
    return String(part.name || "file").replace(/[^A-Za-z0-9_-]/g, "_") + (ext || ".bin");
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

  function writeOutput(job, extension, bytes) {
    var outputPath = outputFilePath(job, extension);
    fs.writeFileSync(outputPath, bytes);
    return outputPath;
  }

  function writeOutputText(job, extension, text) {
    var outputPath = outputFilePath(job, extension);
    fs.writeFileSync(outputPath, text, "utf8");
    return outputPath;
  }

  function outputFilePath(job, extension) {
    var dir = path.join(outputDir, outputCategory(job).folder);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, safeStem(outputStem(job)) + extension);
  }

  function outputCategory(job) {
    if (job.operation === "generate-video") {
      return { folder: "Videos" };
    }
    if (job.operation === "tts") {
      return { folder: "Audio" };
    }
    if (job.operation === "transcribe") {
      return { folder: "Transcripts" };
    }
    return { folder: "Images" };
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

  function cleanupOldCacheFiles() {
    if (!hasNode || !fs.existsSync(cacheDir)) {
      return 0;
    }
    return cleanupOldFilesInDirectory(cacheDir, Date.now() - CACHE_MAX_AGE_MS);
  }

  function cleanupOldFilesInDirectory(dir, cutoff) {
    var removed = 0;
    fs.readdirSync(dir).forEach(function (name) {
      var filePath = path.join(dir, name);
      var stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        removed += cleanupOldFilesInDirectory(filePath, cutoff);
        if (fs.readdirSync(filePath).length === 0 && stat.mtimeMs < cutoff) {
          fs.rmdirSync(filePath);
        }
        return;
      }
      if (stat.isFile() && stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        removed += 1;
      }
    });
    return removed;
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

  imageOperationInput.addEventListener("change", function () {
    clearPreparedMask();
  });

  promptInput.addEventListener("input", function () {
    if (!promptInput.disabled) {
      state.promptDraft = promptInput.value;
    }
  });

  importInput.addEventListener("change", function () {
    state.importToResolve = importInput.checked;
  });

  appendInput.addEventListener("change", function () {
    state.appendToTimeline = appendInput.checked;
  });

  maskPrepareButton.addEventListener("click", prepareMaskFromButton);

  document.getElementById("openOutputButton").addEventListener("click", function () {
    if (shell) {
      fs.mkdirSync(outputDir, { recursive: true });
      shell.openPath(outputDir);
    }
  });

  previewOutputButton.addEventListener("click", function () {
    if (shell && state.lastOutputs.length > 0) {
      shell.openPath(state.lastOutputs[0]);
    }
  });

  importResultButton.addEventListener("click", async function () {
    if (state.running || state.lastOutputs.length === 0 || !state.lastOutputJob) {
      return;
    }
    var config = operationConfigs[state.lastOutputJob.operation];
    if (!config || config.canImport !== true) {
      return;
    }
    state.running = true;
    runButton.disabled = true;
    importResultButton.disabled = true;
    try {
      await importSavedOutputs(state.lastOutputJob, state.lastOutputs, config.canAppend === true && appendInput.checked);
      state.lastImportDone = true;
      updateImportResultButton();
      setStatus("已导入达芬奇\n" + describeJob(state.lastOutputJob) + "\n\n" + state.lastOutputs.join("\n"));
    } catch (error) {
      setStatus("导入失败\n" + explainError(error, state.lastOutputJob));
    } finally {
      state.running = false;
      runButton.disabled = false;
      updateImportResultButton();
      updateMaskPrepareUi();
    }
  });

  maskEditorCanvas.addEventListener("pointerdown", function (event) {
    if (!maskEditorState || maskEditorState.operation === "outpaint") {
      return;
    }
    event.preventDefault();
    maskEditorState.drawing = true;
    maskEditorState.lastPoint = null;
    maskEditorCanvas.setPointerCapture(event.pointerId);
    drawMaskStroke(canvasPoint(event));
  });

  maskEditorCanvas.addEventListener("pointermove", function (event) {
    if (!maskEditorState || !maskEditorState.drawing) {
      return;
    }
    event.preventDefault();
    drawMaskStroke(canvasPoint(event));
  });

  maskEditorCanvas.addEventListener("pointerup", function (event) {
    if (!maskEditorState) {
      return;
    }
    maskEditorState.drawing = false;
    maskEditorState.lastPoint = null;
    if (maskEditorCanvas.hasPointerCapture(event.pointerId)) {
      maskEditorCanvas.releasePointerCapture(event.pointerId);
    }
  });

  maskEditorCanvas.addEventListener("pointercancel", function () {
    if (!maskEditorState) {
      return;
    }
    maskEditorState.drawing = false;
    maskEditorState.lastPoint = null;
  });

  brushSizeInput.addEventListener("input", function () {
    drawMaskEditor();
  });

  [outpaintLeftInput, outpaintRightInput, outpaintTopInput, outpaintBottomInput].forEach(function (input) {
    input.addEventListener("input", function () {
      drawMaskEditor();
      updateMaskApplyState();
    });
  });

  maskClearButton.addEventListener("click", clearMaskEditor);
  maskApplyButton.addEventListener("click", applyMaskEditor);
  maskCancelButton.addEventListener("click", cancelMaskEditor);

  restoreSettings();
  setupTabs();
  setLastOutputs([]);
  selectOperation(state.operation);
  if (hasNode) {
    try {
      var removedCacheFiles = cleanupOldCacheFiles();
      if (removedCacheFiles > 0) {
        setStatus("已自动清理临时缓存：" + removedCacheFiles + " 个文件\n缓存目录：" + cacheDir);
      }
    } catch (error) {
      setStatus("临时缓存自动清理失败\n" + errorMessage(error));
    }
  } else {
    setStatus("浏览器预览模式：界面可查看，运行需从 Resolve Workflow Integrations 打开。");
  }
})();
