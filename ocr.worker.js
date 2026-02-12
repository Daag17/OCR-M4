import Tesseract from "./libs/tesseract.esm.min.js";

let tesseractReady = false;
let tesseractWorker;

function sendMessage(type, data = {}) {
  postMessage({ type, ...data });
}

async function initializeTesseract() {
  try {
    tesseractWorker = await Tesseract.createWorker("eng");
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
  if (event.data.type === "ocr") {
    const { image, pageIndex } = event.data;
    const result = await tesseractWorker.recognize(image);
    postMessage({ type: "textOutput", pageIndex, words: result.data.words });
  }
};
