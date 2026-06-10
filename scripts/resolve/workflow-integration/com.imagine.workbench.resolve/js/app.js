(function () {
  var hasNode = typeof require === "function";
  var fs = hasNode ? require("fs") : null;
  var os = hasNode ? require("os") : null;
  var path = hasNode ? require("path") : null;
  var childProcess = hasNode ? require("child_process") : null;
  var shell = hasNode ? require("electron").shell : null;

  var operationConfigs = {
    "generate-image": {
      tab: "image",
      title: "Image generation",
      subtitle: "生成高质量图片",
      icon: "I",
      promptLabel: "提示词",
      placeholder: "描述要生成的画面",
      sources: [],
      canImport: true,
      canAppend: false
    },
    "edit-image": {
      tab: "image",
      title: "Image edit",
      subtitle: "基于当前帧或图片重绘",
      icon: "E",
      promptLabel: "提示词",
      placeholder: "描述要如何修改当前帧或图片",
      sources: ["current-frame", "current-clip-source"],
      imageOperation: true,
      canImport: true,
      canAppend: false
    },
    "generate-video": {
      tab: "video",
      title: "Video generation",
      subtitle: "生成或延展视频片段",
      icon: "V",
      promptLabel: "提示词",
      placeholder: "描述要生成的视频，或如何延展当前素材",
      sources: ["timeline-inout-render", "current-clip-render", "current-frame", "current-clip-source"],
      pollSeconds: true,
      canImport: true,
      canAppend: true
    },
    "transcribe": {
      tab: "audio",
      title: "Subtitle / ASR",
      subtitle: "从音频或视频生成字幕",
      icon: "S",
      promptLabel: "无需提示词",
      placeholder: "转写会使用所选参考源",
      sources: ["timeline-inout-render", "current-clip-render", "current-clip-source"],
      language: true,
      canImport: false,
      canAppend: false
    },
    "tts": {
      tab: "audio",
      title: "Text to speech",
      subtitle: "生成临时配音",
      icon: "T",
      promptLabel: "配音文本",
      placeholder: "输入要生成的旁白或配音文本",
      sources: [],
      canImport: true,
      canAppend: false
    },
    "doctor": {
      tab: "apps",
      title: "Connection check",
      subtitle: "检查 Workbench 与桥接状态",
      icon: "D",
      promptLabel: "无需提示词",
      placeholder: "连接检查会验证 Workbench 状态",
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

  var state = {
    tab: "image",
    operation: "generate-image",
    source: "",
    running: false
  };

  var outputDir = hasNode ? path.join(os.homedir(), "Movies", "Imagine Resolve Bridge") : "";
  var jobPath = hasNode ? path.join(outputDir, "job.json") : "";
  var bridgeScript = hasNode ? path.join(__dirname, "..", "bridge", "imagine_resolve_bridge.py") : "";

  var grid = document.getElementById("operationGrid");
  var promptInput = document.getElementById("promptInput");
  var promptLabel = document.getElementById("promptLabel");
  var sourceBlock = document.getElementById("sourceBlock");
  var sourcePills = document.getElementById("sourcePills");
  var baseUrlInput = document.getElementById("baseUrlInput");
  var outputNameInput = document.getElementById("outputNameInput");
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
  }

  function restoreSettings() {
    var baseUrl = localStorage.getItem("imagine.resolve.baseUrl");
    if (baseUrl) {
      baseUrlInput.value = baseUrl;
    }
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

  function saveJob(operationOverride) {
    if (!hasNode) {
      throw new Error("当前环境不能写入 job 文件");
    }
    persistSettings();
    fs.mkdirSync(outputDir, { recursive: true });
    var job = buildJob(operationOverride);
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2) + "\n", "utf8");
    return job;
  }

  function runJob(operationOverride) {
    if (!hasNode) {
      setStatus("浏览器预览模式不能直接运行。请从 Resolve Workflow Integrations 打开。");
      return;
    }
    var job = saveJob(operationOverride);
    state.running = true;
    runButton.disabled = true;
    setStatus("运行中\n" + describeJob(job));
    var child = childProcess.spawn("/usr/bin/python3", [bridgeScript], {
      env: Object.assign({}, process.env, { IMAGINE_RESOLVE_JOB: jobPath }),
      cwd: __dirname
    });
    var output = "";
    child.stdout.on("data", function (chunk) {
      output += chunk.toString();
      setStatus("运行中\n" + describeJob(job) + "\n\n" + output.trim());
    });
    child.stderr.on("data", function (chunk) {
      output += chunk.toString();
      setStatus("运行中\n" + describeJob(job) + "\n\n" + output.trim());
    });
    child.on("close", function (code) {
      state.running = false;
      runButton.disabled = false;
      if (code === 0) {
        setStatus("已完成\n" + (output.trim() || describeJob(job)));
      } else {
        setStatus("运行失败，退出码 " + code + "\n" + output.trim());
      }
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
      var job = saveJob();
      setStatus("已保存任务\n" + describeJob(job) + "\n\n" + jobPath);
    } catch (error) {
      setStatus("保存失败\n" + error.message);
    }
  });

  document.getElementById("doctorButton").addEventListener("click", function () {
    runJob("doctor");
  });

  document.getElementById("runButton").addEventListener("click", function () {
    if (!state.running) {
      runJob();
    }
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
