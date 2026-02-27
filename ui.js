import * as pdfjsLib from "./libs/pdf.min.js";
import { setState, subscribe, getState } from "./state.js";
import { processPDF } from "./ocrEngine.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./libs/pdf.worker.min.js";

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", () => {
  subscribe(render);

  // Render inicial
  setState({ status: "idle" });
});

let previousStatus = null;

/* =========================
   RENDER
========================= */

function render(state) {
  const container = document.getElementById("cardContent");
  if (!container) return;

  const statusChanged = previousStatus !== state.status;

  // Si solo cambió progreso y estamos en processing,
  // solo actualizamos la barra, NO re-renderizamos todo.
  if (!statusChanged && state.status === "processing") {
    updateProgressUI(state);
    return;
  }

  previousStatus = state.status;

  let template = "";

  switch (state.status) {
    case "idle":
      template = dropzoneTemplate();
      break;

    case "file-selected":
      template = filePreviewTemplate(state);
      break;

    case "processing":
      template = processingTemplate(state);
      break;

    case "completed":
      template = completedTemplate(state);
      break;

    case "error":
      template = errorTemplate(state);
      break;
  }

  container.innerHTML = template;

  // Solo animar cuando cambia el status
  const content = container.firstElementChild;
  if (content) {
    content.classList.add("fade-enter");
    requestAnimationFrame(() => {
      content.classList.add("fade-enter-active");
    });
  }

  attachEventsForState(state);
}

/* =========================
   TEMPLATES
========================= */

function dropzoneTemplate() {
  return `
    <div class="dropzone">
      <svg  class="icon"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 3v12" />
            <path d="m17 8-5-5-5 5" />
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          </svg>
      <p>
        <strong>Drag and drop your PDF file here</strong><br/>
        or click to select a file.
      </p>
      <input type="file" class="file-input" accept=".pdf"/>
    </div>
  `;
}

function filePreviewTemplate(state) {
  return `
    <div class="file-preview">
      <div class="file-header">
        <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="icon"
            >
              <path
                d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
              />
              <path d="M14 2v5a1 1 0 0 0 1 1h5" />
              <path d="M10 9H8" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
            </svg>
        <div class="file-meta">
          <h3>${state.fileName}</h3>
          <div class="file-info">
            <span>${state.fileSizeMB} MB</span>
            <span>•</span>
            <span>${state.totalPages} pages</span>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" id="processBtn">
          Process Document
        </button>
        <button class="btn btn-secondary" id="changeFileBtn">
          Change File
        </button>
      </div>
    </div>
  `;
}

function processingTemplate(state) {
  return `
    <div class="processing">
      <div class="file-header">
        <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="icon"
              >
                <path
                  d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
                />
                <path d="M14 2v5a1 1 0 0 0 1 1h5" />
                <path d="M10 9H8" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
              </svg>
              <div class="file-meta">
                <h3>${state.fileName}</h3>
                <div class="file-info">
                  <span>${state.fileSizeMB} MB</span>
                  <span>•</span>
                  <span>${state.totalPages} pages</span>
                </div>
              </div>
      </div>
      <p>Processing your document...</p>

      <div class="progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width:${state.progress}%"></div>
        </div>

        <span>${state.progress}%</span>

        <div class="time-info">
        <span>Elapsed: ${formatTime(state.elapsedTime)}</span>
        ${state.eta !== null ? `<span>ETA: ${formatTime(state.eta)}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function completedTemplate(state) {
  return `
    <div class="completed">
    <div class="file-header">
      <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="icon"
            >
              <path
                d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
              />
              <path d="M14 2v5a1 1 0 0 0 1 1h5" />
              <path d="m9 15 2 2 4-4" />
            </svg>
        <div class="file-meta">    
          <h3>${state.fileName}</h3>
          <div class="file-info">
                  <span>${state.fileSizeMB} MB</span>
                  <span>•</span>
                  <span>${state.totalPages} pages</span>
          </div>
        </div>
      </div>
      <p>Your document has been processed successfully.</p>

      <div class="actions">
        <a class="btn btn-primary" href="${state.downloadUrl}" download="ocr-searchable.pdf">
        Download
        </a>
        <button class="btn btn-secondary" id="newFileBtn">
          Process Another File
        </button>
      </div>
    </div>
  `;
}

function errorTemplate(state) {
  return `
    <div class="completed">
      <h3>Error</h3>
      <p>${state.error}</p>
      <div class="actions">
        <button class="btn btn-secondary" id="newFileBtn">
          Try Again
        </button>
      </div>
    </div>
  `;
}

/* =========================
   EVENT ATTACHERS
========================= */

function attachDropzoneEvents() {
  const dropzone = document.querySelector(".dropzone");
  const input = document.querySelector(".file-input");

  dropzone.addEventListener("click", () => input.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-active");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("drag-active");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-active");
    const file = e.dataTransfer.files[0];
    handleFile(file);
  });

  input.addEventListener("change", (e) => {
    handleFile(e.target.files[0]);
  });
}

function attachFilePreviewEvents() {
  const processBtn = document.getElementById("processBtn");
  const changeFileBtn = document.getElementById("changeFileBtn");

  processBtn.addEventListener("click", () => {
    setState({
      status: "processing",
      progress: 0,
      startTime: Date.now(),
    });

    const { file } = getState();
    processPDF(file);
  });

  changeFileBtn.addEventListener("click", resetToIdle);
}

function attachCompletedEvents() {
  const newFileBtn = document.getElementById("newFileBtn");

  if (newFileBtn) {
    newFileBtn.addEventListener("click", resetToIdle);
  }
}

/* =========================
   HELPERS
========================= */

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

function resetToIdle() {
  setState({
    status: "idle",
    file: null,
    fileName: null,
    fileSizeMB: null,
    totalPages: 0,
    progress: 0,
  });
}

function attachEventsForState(state) {
  if (state.status === "idle") {
    attachDropzoneEvents();
  }

  if (state.status === "file-selected") {
    attachFilePreviewEvents();
  }

  if (state.status === "completed") {
    attachCompletedEvents();
  }
}

function updateProgressUI(state) {
  const fill = document.querySelector(".progress-fill");
  const percent = document.querySelector(".progress span");
  const timeInfo = document.querySelector(".time-info");

  if (fill) {
    fill.style.width = state.progress + "%";
  }

  if (percent) {
    percent.textContent = state.progress + "%";
  }

  if (timeInfo) {
    timeInfo.innerHTML = `
      <span>Elapsed: ${formatTime(state.elapsedTime)}</span>
      ${state.eta !== null ? `<span>ETA: ${formatTime(state.eta)}</span>` : ""}
    `;
  }
}

function formatTime(seconds) {
  if (!seconds) return "0s";

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
