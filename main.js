import * as pdfjsLib from "./libs/pdf.min.js";
import { error, PDFDocument, rgb } from "./libs/pdf-lib.min.js";
pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.js";

const uploadButton = document.querySelector('button[type="submit"]');
const progressBar = document.getElementById("progress-bar");
const systemStatus = document.getElementById("system-status");
const scale = 2.5;

let initialized = true;
let pdfDoc;
let totalPages = 0;
let processedPages = 0;

let workerPool = [];
let workerCount = 0;
let pageQueue = [];
let activeWorkers = 0;
let pdfInstance = null;
let readyWorkers = 0;

uploadButton.addEventListener("click", async (event) => {
  event.preventDefault();
  if (!initialized) {
    alert("OCR system is not ready yet. Please wait.");
  } else {
    const fileInput = document.getElementById("pdf-upload");
    if (fileInput.files.length === 0) {
      alert("Please select a PDF file to upload.");
      return;
    } else {
      const file = fileInput.files[0];
      uploadButton.disabled = true;
      uploadButton.style.backgroundColor = "gray";
      uploadButton.style.cursor = "not-allowed";
      fileInput.disabled = true;
      progressBar.hidden = false;
      systemStatus.hidden = false;
      systemStatus.textContent = "Processing PDF... Please wait.";

      const originalBuffer = await file.arrayBuffer();

      const bufferForPdfJs = originalBuffer.slice(0);
      const bufferForPdfLib = originalBuffer.slice(0);

      const pdf = await pdfjsLib.getDocument({ data: bufferForPdfJs }).promise;

      pdfDoc = await PDFDocument.load(bufferForPdfLib);

      pdfInstance = pdf;
      totalPages = pdf.numPages;
      pageQueue = Array.from({ length: totalPages }, (_, i) => i);

      createWorkerPool();
    }
  }
});

function calculateWorkerCount() {
  const cores = navigator.hardwareConcurrency || 2;
  if (cores <= 2) return 1;
  if (cores <= 4) return 2;
  if (cores <= 8) return 3;
  return 4; // máximo de 4 workers para evitar sobrecarga
}

async function handleWorkerMessage(event) {
  if (event.data.type === "ready") {
    readyWorkers++;

    if (readyWorkers === workerCount) {
      for (let i = 0; i < workerCount; i++) {
        dispatchNextPage();
      }
    }

    return;
  }

  if (event.data.type === "textOutput") {
    const { pageIndex, words, workerId } = event.data;
    const pages = pdfDoc.getPages();
    const page = pages[pageIndex];

    const { height } = page.getSize();

    words.forEach((word) => {
      const { x0, y0, x1, y1 } = word.bbox;

      const pdfX = x0 / scale;
      const pdfY = height - y1 / scale;
      const fontSize = ((y1 - y0) / scale) * 0.85;

      page.drawText(word.text, {
        x: pdfX,
        y: pdfY,
        size: fontSize,
        opacity: 0,
      });
    });
    processedPages++;
    activeWorkers--;
    workerPool[workerId].busy = false;

    updateProgress();

    if (processedPages % 40 === 0) {
      for (let i = 0; i < workerPool.length; i++) {
        workerPool[i].terminate();
      }
      workerPool = [];
      readyWorkers = 0;
      activeWorkers = 0;
      createWorkerPool();
    } else {
      dispatchNextPage();
    }

    if (processedPages === totalPages) {
      await finalizePDF();
    }
  }
}

function createWorkerPool() {
  workerCount = calculateWorkerCount();

  for (let i = 0; i < workerCount; i++) {
    const w = new Worker("./ocr.worker.js", { type: "module" });
    w.busy = false;
    w.id = i;

    w.addEventListener("message", handleWorkerMessage);

    w.onerror = (error) => {
      console.error(`Error in worker ${w.id}:`, error);
    };

    workerPool.push(w);

    w.postMessage({ type: "id", id: i });
  }
}

async function dispatchNextPage() {
  if (pageQueue.length === 0) return;

  const freeWorker = workerPool.find((w) => !w.busy);
  if (!freeWorker) return;

  const pageIndex = pageQueue.shift();
  freeWorker.busy = true;
  activeWorkers++;

  const page = await pdfInstance.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );

  // Limpia el canvas para liberar memoria
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();

  freeWorker.postMessage({ type: "ocr", image: blob, pageIndex });
}

function updateProgress() {
  const percent = Math.round((processedPages / totalPages) * 100);
  progressBar.value = percent;
}

async function finalizePDF() {
  const pdfBytes = await pdfDoc.save();

  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  // Terminar todos los workers
  for (let i = 0; i < workerPool.length; i++) {
    workerPool[i].terminate();
  }
  workerPool = [];
  readyWorkers = 0;
  activeWorkers = 0;

  systemStatus.textContent =
    "OCR process completed! You can download the searchable PDF. 👍";
  document.getElementById("download-section").hidden = false;
  document.getElementById("download-btn").disabled = false;
  document.getElementById("download-btn").onclick = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "ocr-searchable.pdf";
    a.click();
  };
}
