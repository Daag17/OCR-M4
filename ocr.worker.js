import Tesseract from "./libs/tesseract.esm.min.js";

let tesseractReady = false;
let tesseractWorker;

let id = null;

async function initializeTesseract() {
  try {
    tesseractWorker = await Tesseract.createWorker("eng");
    tesseractReady = true;
    postMessage({ type: "ready" });
  } catch (error) {
    console.error("Error initializing Tesseract.js:", error);
  }
}

initializeTesseract();

self.onmessage = async (event) => {
  if (event.data.type === "id") {
    id = event.data.id;
    console.log(`Worker ${id} initialized.`);
  }
  if (event.data.type === "ocr") {
    let { image, pageIndex } = event.data;
    let result = await tesseractWorker.recognize(image);
    postMessage({
      type: "textOutput",
      pageIndex,
      words: result.data.words,
      workerId: id,
    });
    result = null; // Liberar memoria del resultado
    image = null; // Liberar memoria del blob de imagen
  }
};
