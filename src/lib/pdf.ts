import * as pdfjs from 'pdfjs-dist';

// Use a reliable CDN for the worker that matches the version
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ 
      data: arrayBuffer,
      useSystemFonts: true,
      isEvalSupported: false
    });
    
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => {
          // In newer versions of PDF.js, items can be TextItem or TextMarkedContent
          // We only want TextItem which has the 'str' property
          return 'str' in item ? item.str : '';
        })
        .join(' ');
      
      fullText += pageText + '\n';
    }

    const cleanedText = fullText.replace(/\s+/g, ' ').trim();
    console.log('Extracted text length:', cleanedText.length);
    return cleanedText;
  } catch (error) {
    console.error("Error in extractTextFromPdf:", error);
    throw error;
  }
}
