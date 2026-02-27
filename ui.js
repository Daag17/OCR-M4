import * as pdfjsLib from "./libs/pdf.min.js";
import { setState, subscribe, getState } from "./state.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./libs/pdf.worker.min.js";

/* ---------- DOM ---------- */

const viewDropzone = document.getElementById("view-dropzone");
const viewFile = document.getElementById("view-file");
const viewProcessing = document.getElementById("view-processing");
const viewCompleted = document.getElementById("view-completed");

const fileInput = document.getElementById("fileInput");

const fileNamePreview = document.getElementById("fileNamePreview");
const fileSizePreview = document.getElementById("fileSizePreview");
const filePagesPreview = document.getElementById("filePagesPreview");

const processBtn = document.getElementById("processBtn");
const changeFileBtn = document.getElementById("changeFileBtn");

const progressFill = document.getElementById("progressFill");
const progressPercent = document.getElementById("progressPercent");
const processingFileName = document.getElementById("processingFileName");
const completedFileName = document.getElementById("completedFileName");

const newFileBtn = document.getElementById("newFileBtn");

/* ---------- RENDER ---------- */

subscribe(render);

function render(state) {
  // Manejo de vistas
  viewDropzone.hidden = state.status !== "idle";
  viewFile.hidden = state.status !== "file-selected";
  viewProcessing.hidden = state.status !== "processing";
  viewCompleted.hidden = state.status !== "completed";

  // Preview file
  if (state.status === "file-selected") {
    fileNamePreview.textContent = state.fileName;
    fileSizePreview.textContent = state.fileSizeMB + " MB";
    filePagesPreview.textContent = state.totalPages + " pages";
  }

  // Processing
  if (state.status === "processing") {
    processingFileName.textContent = state.fileName;
    progressFill.style.width = state.progress + "%";
    progressPercent.textContent = state.progress + "%";
  }

  // Completed
  if (state.status === "completed") {
    completedFileName.textContent = state.fileName;
  }
}

/* ---------- EVENTOS ---------- */

const dropzone = document.getElementById("view-dropzone");

dropzone.addEventListener("dragover", function (e) {
  e.preventDefault();
  dropzone.classList.add("drag-active");
});

dropzone.addEventListener("dragleave", function (e) {
  e.preventDefault();
  dropzone.classList.remove("drag-active");
});

window.addEventListener("drop", (e) => e.preventDefault());

dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  handleFile(file);
});

fileInput.addEventListener("change", (e) => {
  handleFile(e.target.files[0]);
});

processBtn.addEventListener("click", () => {
  setState({
    status: "processing",
    progress: 0,
    processedPages: 0,
    startTime: Date.now(),
  });

  simulateProgress();
});

changeFileBtn.addEventListener("click", resetToIdle);
newFileBtn.addEventListener("click", resetToIdle);

async function handleFile(file) {
  if (!file || file.type !== "application/pdf") {
    alert("Please select a valid PDF file.");
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    setState({
      status: "file-selected",
      file,
      fileName: file.name,
      fileSizeMB: (file.size / 1024 / 1024).toFixed(2),
      totalPages: pdf.numPages,
    });
  } catch (error) {
    setState({
      status: "error",
      error: "Failed to read PDF.",
    });
  }
}

function simulateProgress() {
  const interval = setInterval(() => {
    const current = getState().progress;

    if (current >= 100) {
      clearInterval(interval);
      setState({ status: "completed" });
      return;
    }

    setState({ progress: Math.min(current + 5, 100) });
  }, 200);
}

function resetToIdle() {
  setState({
    status: "idle",
    file: null,
    fileName: null,
    fileSizeMB: null,
    totalPages: 0,
    progress: 0,
    processedPages: 0,
  });

  fileInput.value = "";
}
