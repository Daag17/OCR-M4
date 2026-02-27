import * as pdfjsLib from "./libs/pdf.min.js";
import { PDFDocument } from "./libs/pdf-lib.min.js";
import { setState, getState } from "./state.js";

/**
 * Configuración de pdf.js
 * El worker de pdf.js debe declararse explícitamente.
 */
pdfjsLib.GlobalWorkerOptions.workerSrc = "./libs/pdf.worker.min.js";

/**
 * Escala usada para renderizar páginas a imagen.
 * Debe mantenerse consistente con la conversión de coordenadas al insertar texto.
 */
const RENDER_SCALE = 3;

/**
 * Estado interno del engine.
 * No debe mezclarse con el estado global de la app.
 */
let workerPool = [];
let workerCount = 0;

let pageQueue = [];
let totalPages = 0;
let processedPages = 0;

let readyWorkers = 0;
let activeWorkers = 0;

let pdfDoc; // PDF-lib instance (editable)
let pdfInstance; // pdf.js instance (rendering)

/* ======================================================
   API PÚBLICA
====================================================== */

/**
 * Punto de entrada del motor OCR.
 * Recibe el archivo, prepara las estructuras internas
 * y arranca el procesamiento en paralelo.
 */
export async function processPDF(file) {
  try {
    resetInternalState();

    setState({
      status: "processing",
      progress: 0,
      processedPages: 0,
      startTime: Date.now(),
    });

    const originalBuffer = await file.arrayBuffer();

    // Clonamos el buffer porque pdf.js y pdf-lib lo consumen internamente.
    const bufferForPdfJs = originalBuffer.slice(0);
    const bufferForPdfLib = originalBuffer.slice(0);

    pdfInstance = await pdfjsLib.getDocument({ data: bufferForPdfJs }).promise;
    pdfDoc = await PDFDocument.load(bufferForPdfLib);

    totalPages = pdfInstance.numPages;
    pageQueue = Array.from({ length: totalPages }, (_, i) => i);

    createWorkerPool();

    if (window.gtag) {
      gtag("event", "ocr_started", {
        pages: totalPages,
      });
    }
  } catch (error) {
    console.error("OCR Engine error:", error);

    setState({
      status: "error",
      error: "Error processing PDF",
    });

    cleanupWorkers();
  }
}

/* ======================================================
   WORKER POOL
====================================================== */

/**
 * Determina cuántos workers crear según el hardware.
 * Limitamos a 4 para evitar saturar el CPU.
 */
function calculateWorkerCount() {
  const cores = navigator.hardwareConcurrency || 2;

  if (cores <= 2) return 1;
  if (cores <= 4) return 2;
  if (cores <= 8) return 3;
  return 4;
}

/**
 * Crea el pool de workers y registra sus listeners.
 */
function createWorkerPool() {
  workerCount = calculateWorkerCount();

  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker("./ocr.worker.js", { type: "module" });

    worker.busy = false;
    worker.id = i;

    worker.addEventListener("message", handleWorkerMessage);

    worker.onerror = (err) => {
      console.error("Worker error:", err);
    };

    workerPool.push(worker);

    // Informamos al worker su id interno
    worker.postMessage({ type: "id", id: i });
  }
}

/* ======================================================
   MENSAJES DEL WORKER
====================================================== */

/**
 * Maneja todos los mensajes provenientes de los workers.
 * Aquí se orquesta el flujo completo.
 */
async function handleWorkerMessage(event) {
  const { type } = event.data;

  if (type === "ready") {
    readyWorkers++;

    // Cuando todos estén listos, comenzamos a despachar páginas.
    if (readyWorkers === workerCount) {
      for (let i = 0; i < workerCount; i++) {
        dispatchNextPage();
      }
    }

    return;
  }

  if (type === "textOutput") {
    await handleOCRResult(event.data);
  }
}

/**
 * Procesa el resultado OCR de una página.
 */
async function handleOCRResult({ pageIndex, words, workerId }) {
  const pages = pdfDoc.getPages();
  const page = pages[pageIndex];

  const { height } = page.getSize();

  // Insertamos texto invisible para hacer el PDF searchable.
  words.forEach((word) => {
    const { x0, y0, x1, y1 } = word.bbox;

    const pdfX = x0 / RENDER_SCALE;
    const pdfY = height - y1 / RENDER_SCALE;
    const fontSize = ((y1 - y0) / RENDER_SCALE) * 0.85;

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

  // Si ya no quedan páginas pendientes y no hay workers activos,
  // entonces realmente terminamos.
  if (pageQueue.length === 0 && activeWorkers === 0) {
    await finalizePDF();
    return;
  }

  // Reinicio preventivo cada 40 páginas
  if (processedPages % 40 === 0) {
    restartWorkerPool();
  } else {
    dispatchNextPage();
  }
}

/* ======================================================
   DISPATCH DE PÁGINAS
====================================================== */

/**
 * Asigna la siguiente página disponible a un worker libre.
 */
async function dispatchNextPage() {
  if (pageQueue.length === 0) return;

  const freeWorker = workerPool.find((w) => !w.busy);
  if (!freeWorker) return;

  const pageIndex = pageQueue.shift();
  freeWorker.busy = true;
  activeWorkers++;

  const page = await pdfInstance.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  // Aplicar preprocesamiento antes de enviar al worker
  preprocessCanvas(context, canvas.width, canvas.height);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );

  // Liberación de memoria
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();

  freeWorker.postMessage({ type: "ocr", image: blob, pageIndex });
}

/* ======================================================
   Preprocesamiento de imagen
====================================================== */

function preprocessCanvas(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  let min = 255;
  let max = 0;

  // Paso 1: convertir a grayscale y detectar rango dinámico
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    data[i] = data[i + 1] = data[i + 2] = gray;

    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }

  // Paso 2: normalización de contraste
  const range = max - min || 1;

  for (let i = 0; i < data.length; i += 4) {
    let normalized = ((data[i] - min) / range) * 255;

    // Paso 3: threshold suave (no agresivo)
    if (normalized > 200) normalized = 255;
    if (normalized < 40) normalized = 0;

    data[i] = data[i + 1] = data[i + 2] = normalized;
  }

  context.putImageData(imageData, 0, 0);
}

/* ======================================================
   PROGRESO Y FINALIZACIÓN
====================================================== */

/**
 * Actualiza el estado global con el progreso actual.
 */
function updateProgress() {
  const now = Date.now();
  const elapsed = now - getState().startTime;

  const percent = Math.round((processedPages / totalPages) * 100);

  let eta = null;

  if (processedPages > 0) {
    const avgTimePerPage = elapsed / processedPages;
    const remainingPages = totalPages - processedPages;
    eta = Math.round((avgTimePerPage * remainingPages) / 1000);
  }

  setState({
    progress: percent,
    processedPages,
    elapsedTime: Math.round(elapsed / 1000),
    eta,
  });
}

/**
 * Guarda el PDF final y expone la URL de descarga.
 */
async function finalizePDF() {
  const pdfBytes = await pdfDoc.save();

  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  setState({
    status: "completed",
    downloadUrl: url,
  });

  cleanupWorkers();

  if (window.gtag) {
    gtag("event", "ocr_completed", {
      pages: totalPages,
      duration: Math.round((Date.now() - getState().startTime) / 1000),
    });
  }
}

/* ======================================================
   UTILIDADES INTERNAS
====================================================== */

/**
 * Reinicia completamente el pool de workers.
 * Esto ayuda a prevenir memory leaks de Tesseract.
 */
function restartWorkerPool() {
  cleanupWorkers();
  readyWorkers = 0;
  activeWorkers = 0;
  createWorkerPool();
}

/**
 * Termina todos los workers activos.
 */
function cleanupWorkers() {
  workerPool.forEach((w) => w.terminate());
  workerPool = [];
  readyWorkers = 0;
  activeWorkers = 0;
}

/**
 * Limpia el estado interno antes de iniciar un nuevo proceso.
 */
function resetInternalState() {
  workerPool = [];
  workerCount = 0;

  pageQueue = [];
  totalPages = 0;
  processedPages = 0;

  readyWorkers = 0;
  activeWorkers = 0;

  pdfDoc = null;
  pdfInstance = null;
}
