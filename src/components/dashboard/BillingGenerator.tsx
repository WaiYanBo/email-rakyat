import React, { useState } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { supabase } from '../../lib/supabase';
import { toWords } from 'number-to-words';

// Define the interface for client data
export interface ClientData {
  id: string; // Used as client_id in supabase
  name: string;
  ic: string;
  address: string;
}

interface BillingGeneratorProps {
  clientData: ClientData;
  onSuccess?: () => void;
}

export const BillingGenerator: React.FC<BillingGeneratorProps> = ({ clientData, onSuccess }) => {
  const [documentType, setDocumentType] = useState<'invoice' | 'receipt'>('invoice');
  const [items, setItems] = useState<{ description: string; amount: string }[]>([{ description: '', amount: '' }]);
  const [deposit, setDeposit] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const addItem = () => {
    if (items.length < 6) {
      setItems([...items, { description: '', amount: '' }]);
    }
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: 'description' | 'amount', value: string) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const total = subtotal - (Number(deposit) || 0);

  const generateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.some(item => !item.description || !item.amount)) {
      setStatusMessage({ type: 'error', text: 'Please fill in description and amount for all items.' });
      return;
    }

    setIsGenerating(true);
    setStatusMessage(null);

    try {
      // 1. Determine template path using our bulletproof API route
      const templateFilename = documentType === 'invoice' ? 'blank-invoice' : 'blank-receipt';
      const fetchUrl = `/api/templates/${templateFilename}?t=${Date.now()}`;

      // 2. Fetch the template
      const templateBytes = await fetch(fetchUrl).then(async (res) => {
        if (!res.ok) throw new Error(`Failed to fetch ${fetchUrl} (Status: ${res.status})`);
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 500) {
          throw new Error(`DEBUG: Fetched ${fetchUrl} but received an empty or corrupted file (${buffer.byteLength} bytes).`);
        }
        return buffer;
      });

      // 3. Load PDF
      const pdfDoc = await PDFDocument.load(templateBytes);
      pdfDoc.registerFontkit(fontkit);

      // Load custom fonts (Verdana Regular and Bold)
      const fontUrlRegular = `/fonts/verdana.ttf?t=${Date.now()}`;
      const fontBytesRegular = await fetch(fontUrlRegular).then(async (res) => {
        if (!res.ok) throw new Error(`Failed to fetch regular font`);
        return await res.arrayBuffer();
      });
      const customFont = await pdfDoc.embedFont(fontBytesRegular);

      const fontUrlBold = `/fonts/verdanab.ttf?t=${Date.now()}`;
      const fontBytesBold = await fetch(fontUrlBold).then(async (res) => {
        if (!res.ok) throw new Error(`Failed to fetch bold font`);
        return await res.arrayBuffer();
      });
      const customFontBold = await pdfDoc.embedFont(fontBytesBold);

      const pages = pdfDoc.getPages();
      const firstPage = pages[0];

      // Generate Reference Number
      const timestampId = Date.now().toString().slice(-4);
      const prefix = documentType === 'invoice' ? 'INV-TER' : 'RCP-TER';
      const refNumber = `${prefix}-${timestampId}`;

      // Date formatted as DD/MM/YYYY
      const date = new Date().toLocaleDateString('en-GB');

      // 4. Stamp data using coordinates (Variables left easily tweakable)
      // NOTE: Adjust these coordinates based on the actual blank PDF template layout.
      // pdf-lib's origin (0, 0) is at the bottom-left corner of the page.
      const invoiceCoords = {
        nameX: 67.8, nameY: 614,
        icX: 93, icY: 604.4,
        addressX: 93, addressY: 595,
        refNumberX: 462, refNumberY: 623.6,
        dateX: 462, dateY: 595,
        descStartX: 67.8, descStartY: 566.2, descLineHeight: 9.6,
        amountStartX: 513, amountStartY: 566.2, amountLineHeight: 9.6,
        subtotalX: 513, subtotalY: 491.9,
        depositX: 513, depositY: 482.3,
        totalX: 513, totalY: 472.7,
        totalWordsX: 150, totalWordsY: 472.7,
        refNumberBottomX: 0, refNumberBottomY: 0, // Unused for invoice
      };

      const receiptCoords = {
        nameX: 71.25, nameY: 602.48,
        icX: 116, icY: 588.48,
        addressX: 116, addressY: 575.48,
        refNumberX: 457.3, refNumberY: 588.68,
        dateX: 457.3, dateY: 548.88,
        descStartX: 71.25, descStartY: 496, descLineHeight: 11,
        amountStartX: 465, amountStartY: 496, amountLineHeight: 11,
        subtotalX: 0, subtotalY: 0, // Unused
        depositX: 0, depositY: 0, // Unused
        totalX: 465, totalY: 407.499,
        totalWordsX: 0, totalWordsY: 0, // Unused
        refNumberBottomX: 71.25, refNumberBottomY: 393, // Put a placeholder Y for bottom ref number
      };

      const coords = documentType === 'invoice' ? invoiceCoords : receiptCoords;
      const invoiceFontSize = 5.5; // Adjust invoice font size
      const receiptFontSize = 8.5; // Adjust receipt font size

      // === STYLING CONFIGURATION ===
      // You can manually change the font and color for each item here!
      // 'font': Choose between 'customFont' (Normal) or 'customFontBold' (Bold)
      // 'color': Use rgb(0,0,0) for Black, rgb(1,0,0) for Red, rgb(1,1,1) for White, etc.
      const invoiceStyles = {
        name: { font: customFontBold, color: rgb(0, 0, 0), size: 6.5 },
        ic: { font: customFont, color: rgb(0, 0, 0), size: invoiceFontSize },
        address: { font: customFont, color: rgb(0, 0, 0), size: invoiceFontSize },
        refNumber: { font: customFontBold, color: rgb(0, 0, 0), size: invoiceFontSize }, // Example: Bold ref number
        date: { font: customFont, color: rgb(0, 0, 0), size: invoiceFontSize },
        desc: { font: customFont, color: rgb(0, 0, 0), size: invoiceFontSize },
        amount: { font: customFont, color: rgb(0, 0, 0), size: invoiceFontSize },
        subtotal: { font: customFont, color: rgb(0, 0, 0), size: invoiceFontSize },
        deposit: { font: customFont, color: rgb(1, 0, 0), size: invoiceFontSize },       // Example: Red deposit
        total: { font: customFontBold, color: rgb(0, 0, 0), size: invoiceFontSize },     // Example: Bold total
        totalWords: { font: customFontBold, color: rgb(0, 0, 0), size: invoiceFontSize },
        refNumberBottom: { font: customFontBold, color: rgb(0, 0, 0), size: invoiceFontSize },
      };

      const receiptStyles = {
        name: { font: customFontBold, color: rgb(0, 0, 0), size: receiptFontSize },
        ic: { font: customFont, color: rgb(0, 0, 0), size: receiptFontSize },
        address: { font: customFont, color: rgb(0, 0, 0), size: receiptFontSize },
        refNumber: { font: customFontBold, color: rgb(0, 0, 0), size: receiptFontSize }, // Example: Bold ref number
        date: { font: customFont, color: rgb(0, 0, 0), size: receiptFontSize },
        desc: { font: customFont, color: rgb(0, 0, 0), size: receiptFontSize },
        amount: { font: customFont, color: rgb(0, 0, 0), size: receiptFontSize },
        subtotal: { font: customFont, color: rgb(0, 0, 0), size: receiptFontSize }, // Unused
        deposit: { font: customFont, color: rgb(1, 0, 0), size: receiptFontSize },  // Unused
        total: { font: customFontBold, color: rgb(224 / 255, 27 / 255, 132 / 255), size: receiptFontSize }, // Example: Bold total
        totalWords: { font: customFontBold, color: rgb(0, 0, 0), size: receiptFontSize }, // Unused
        refNumberBottom: { font: customFontBold, color: rgb(0, 0, 0), size: receiptFontSize },
      };

      const styles = documentType === 'invoice' ? invoiceStyles : receiptStyles;

      firstPage.drawText(`${clientData.name}`, { x: coords.nameX, y: coords.nameY, ...styles.name });
      firstPage.drawText(`${clientData.ic}`, { x: coords.icX, y: coords.icY, ...styles.ic });
      firstPage.drawText(`${clientData.address}`, { x: coords.addressX, y: coords.addressY, ...styles.address });

      firstPage.drawText(`${refNumber}`, { x: coords.refNumberX, y: coords.refNumberY, ...styles.refNumber });
      firstPage.drawText(`${date}`, { x: coords.dateX, y: coords.dateY, ...styles.date });

      const formatCurrency = (val: number | string) => {
        const num = Number(val || 0);
        return `RM${num.toFixed(2)}`;
      };

      items.forEach((item, index) => {
        const currentDescY = coords.descStartY - (index * coords.descLineHeight);
        const currentAmountY = coords.amountStartY - (index * coords.amountLineHeight);
        firstPage.drawText(`${item.description}`, { x: coords.descStartX, y: currentDescY, ...styles.desc });
        if (item.amount) {
          firstPage.drawText(formatCurrency(item.amount), { x: coords.amountStartX, y: currentAmountY, ...styles.amount });
        }
      });

      if (documentType === 'invoice') {
        firstPage.drawText(formatCurrency(subtotal), { x: coords.subtotalX, y: coords.subtotalY, ...styles.subtotal });
        firstPage.drawText(deposit ? formatCurrency(deposit) : `RM0`, { x: coords.depositX, y: coords.depositY, ...styles.deposit });

        // Generate total in words for Invoice only
        const integerPart = Math.floor(total);
        const decimalPart = Math.round((total - integerPart) * 100);

        const toTitleCase = (str: string) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

        let totalWordsStr = integerPart === 0 ? 'Zero' : toTitleCase(toWords(integerPart).replace(/,/g, '').replace(/-/g, ' '));
        if (decimalPart > 0) {
          const decimalWords = toTitleCase(toWords(decimalPart).replace(/,/g, '').replace(/-/g, ' '));
          totalWordsStr += ` And ${decimalWords} Cents`;
        }
        totalWordsStr += ' Only';

        firstPage.drawText(totalWordsStr, { x: coords.totalWordsX, y: coords.totalWordsY, ...styles.totalWords });
      } else {
        // Receipt drawings
        firstPage.drawText(`This Receipt Acknowledges Full Settlement of ${refNumber}`, { x: coords.refNumberBottomX, y: coords.refNumberBottomY, ...styles.refNumberBottom });
      }

      firstPage.drawText(formatCurrency(total), { x: coords.totalX, y: coords.totalY, ...styles.total });

      // 5. Save document and download
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const fileName = `${refNumber}.pdf`;

      // Trigger local view (open in new tab)
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank'; // Open in new tab instead of downloading
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Delay revoking the URL so the new tab has time to load the PDF
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);

      // 6. Upload to backend
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
      });

      const uploadRes = await fetch('/api/drive-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: base64data,
          fileName: fileName,
          documentType: documentType,
          mimeType: 'application/pdf'
        }),
      });

      const resData = await uploadRes.json();

      if (!uploadRes.ok) {
        throw new Error(resData.error || 'Failed to upload to Google Drive');
      }

      // 7. Insert to Supabase on 200 OK
      const { error: dbError } = await supabase
        .from('billing_records')
        .insert([
          {
            client_id: clientData.id,
            document_type: documentType,
            ref_number: refNumber,
            amount: total,
            drive_url: resData.webViewLink || null,
          }
        ]);

      if (dbError) {
        console.error('Supabase insert error:', dbError);
        throw new Error('Upload succeeded, but failed to save record to database.');
      }

      setStatusMessage({ type: 'success', text: `${documentType.charAt(0).toUpperCase() + documentType.slice(1)} generated and uploaded successfully!` });

      // Reset form amounts/desc
      setItems([{ description: '', amount: '' }]);
      setDeposit('');

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: err.message || 'An error occurred during generation.' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md max-w-xl mx-auto text-gray-800">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 border-b pb-2">Generate Billing Document</h2>

      {statusMessage && (
        <div className={`p-4 mb-6 rounded-lg ${statusMessage.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {statusMessage.text}
        </div>
      )}

      <form onSubmit={generateDocument} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Document Type</label>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${documentType === 'invoice' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              onClick={() => setDocumentType('invoice')}
            >
              Invoice
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${documentType === 'receipt' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              onClick={() => setDocumentType('receipt')}
            >
              Receipt
            </button>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-700">Items (Max 6)</label>
            {items.length < 6 && (
              <button
                type="button"
                onClick={addItem}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add Item
              </button>
            )}
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="flex gap-3 items-start">
                <div className="flex-1">
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    required
                  />
                </div>
                <div className="w-1/3">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="Amount (RM)"
                    value={item.amount}
                    onChange={(e) => updateItem(index, 'amount', e.target.value)}
                    required
                  />
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="mt-2 text-red-500 hover:text-red-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 mt-4">
          {documentType === 'invoice' && (
            <>
              <div className="flex justify-end items-center mb-2">
                <span className="text-sm text-gray-600 mr-4">Subtotal:</span>
                <span className="font-medium w-24 text-right">RM{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-end items-center mb-2">
                <label htmlFor="deposit" className="text-sm text-gray-600 mr-4">Deposit:</label>
                <input
                  id="deposit"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-24 px-2 py-1 border border-gray-300 rounded text-right focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="0.00"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="flex justify-end items-center font-bold text-lg">
            <span className="mr-4">Total:</span>
            <span className="w-24 text-right">RM{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 mt-6">
          <p className="text-sm text-gray-500 mb-4">
            Generating for client: <span className="font-semibold text-gray-700">{clientData.name}</span> (IC: {clientData.ic})
          </p>
          <button
            type="submit"
            disabled={isGenerating}
            className={`w-full py-3 px-4 rounded-lg text-white font-medium shadow transition ${isGenerating ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {isGenerating ? 'Processing...' : `Generate ${documentType === 'invoice' ? 'Invoice' : 'Receipt'}`}
          </button>
        </div>
      </form>
    </div>
  );
};
