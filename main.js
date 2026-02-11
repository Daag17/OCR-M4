const uploadButton = document.querySelector('button[type="submit"]');

const worker = new Worker("ocr.worker.js");

const progressBar = document.getElementById("progress-bar");

let initialized = false;

const systemStatus = document.getElementById("system-status");

uploadButton.addEventListener("click", (event) => {
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
      worker.postMessage({ type: "process", file });
    }
  }
});

function showItems(idItem) {
  const item = document.getElementById(idItem);
  item.hidden = !item.hidden;
}

worker.onmessage = (event) => {
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
    switch (event.data.type) {
      case "fileReceived":
        systemStatus.textContent = "File received. Processing...";
        console.log(event.data.pdfInfo);
        break;
      case "textOutput":
        const ocrResult = document.getElementById("ocr-result");
        ocrResult.value = event.data.text;
        showItems("download-section");
        break;
    }
  }
};
