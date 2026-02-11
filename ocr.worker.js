importScripts(
  "https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js",
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
);

let tesseractReady = false;
let worker;
function sendMessage(type, data = {}) {
  postMessage({ type, ...data });
}

async function initializeTesseract() {
  try {
    worker = await Tesseract.createWorker("eng");
    tesseractReady = true;
    sendMessage("ready", { message: "Tesseract.js is ready." });
  } catch (error) {
    sendMessage("error", {
      message: "Error initializing Tesseract.js: " + error.message,
    });
  }
}

initializeTesseract();

self.onmessage = async (event) => {
  const data = event.data;
  if (data.type === "process") {
    try {
      const file = data.file;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pdfInfo = {
        pageNum: pdf.getPageCount(),
        size: pdf.getPage(0).getSize(),
      };
      sendMessage("fileReceived", {
        message: "File received. Processing...",
        pdfInfo,
      });

      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = new OffscreenCanvas(viewport.width, viewport.height);
      console.log(viewport);
      const context = canvas.getContext("2d");
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;
      console.log("aquivoy");
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const resultado = await tesseractWorker.recognize(blob);
      const texto = resultado.data.text;
      console.log(texto);
      sendMessage("textOutput", texto);
    } catch (error) {
      sendMessage("error", {
        message: "Error processing PDF: " + error.message,
      });
    }
  }
};
