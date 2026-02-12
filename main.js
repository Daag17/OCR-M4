import * as pdfjsLib from "./libs/pdf.min.js";
import { PDFDocument, rgb } from "./libs/pdf-lib.min.js";
pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.js";

const uploadButton = document.querySelector('button[type="submit"]');
const worker = new Worker("./ocr.worker.js", { type: "module" });
const progressBar = document.getElementById("progress-bar");
const systemStatus = document.getElementById("system-status");
const scale = 2.5;

let initialized = false;
let pdfDoc;
let totalPages = 0;
let processedPages = 0;

worker.addEventListener("error", (error) => {
  console.error("ERROR EN WORKER:", error);
});

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
      worker.postMessage({ type: "process", file });
      const originalBuffer = await file.arrayBuffer();

      const bufferForPdfJs = originalBuffer.slice(0);
      const bufferForPdfLib = originalBuffer.slice(0);

      const pdf = await pdfjsLib.getDocument({ data: bufferForPdfJs }).promise;

      pdfDoc = await PDFDocument.load(bufferForPdfLib);

      totalPages = pdf.numPages;
      processedPages = 0;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);

        const viewport = page.getViewport({ scale: scale });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );

        worker.postMessage({ type: "ocr", image: blob, pageIndex: i - 1 });
      }
    }
  }
});

worker.onmessage = async (event) => {
  if (!initialized) {
    if (event.data.type === "ready") {
      initialized = true;
      systemStatus.hidden = false;
    } else if (event.data.type === "error") {
      console.error("Worker error:", event.data.message);
      alert("Error initializing OCR: " + event.data.message);
      systemStatus.hidden = true;
      systemStatus.textContent = "Error initializing OCR system.";
    }
  } else {
    if (event.data.type === "textOutput") {
      const { pageIndex, words } = event.data;

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

      if (processedPages === totalPages) {
        const pdfBytes = await pdfDoc.save();

        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "ocr-searchable.pdf";
        a.click();
      }
    }
  }
};

function showItems(idItem) {
  const item = document.getElementById(idItem);
  item.hidden = !item.hidden;
}
