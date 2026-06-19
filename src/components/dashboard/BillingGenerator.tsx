import React, { useState, useEffect } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { supabase } from '../../lib/supabase';
import { toWords } from 'number-to-words';

export interface ClientData {
  id: string; // Used as client_id in supabase
  clientNo?: string | number; // Assigned client number
  name: string;
  ic: string;
  address: string;
  payments?: (string | number | null)[];
}

interface BillingGeneratorProps {
  clientData: ClientData;
  onSuccess?: () => void;
}

export const BillingGenerator: React.FC<BillingGeneratorProps> = ({ clientData, onSuccess }) => {
  const [documentType, setDocumentType] = useState<'invoice' | 'receipt'>('invoice');
  const [items, setItems] = useState<{ description: string; qty: string; unitPrice: string; paymentDetails: string; date: string; amount: string }[]>([{ description: '', qty: '', unitPrice: '', paymentDetails: '', date: '', amount: '' }]);
  const [deposit, setDeposit] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  // Removed billing_records fetch since payments come from clientData

  const getPaymentOrdinalString = (index: number, count: number) => {
    const num = count + index + 1;
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return num + "st Payment";
    if (j === 2 && k !== 12) return num + "nd Payment";
    if (j === 3 && k !== 13) return num + "rd Payment";
    return num + "th Payment";
  };

  useEffect(() => {
    if (documentType === 'receipt') {
      const pastPayments = clientData.payments ? clientData.payments.filter(p => p !== null && p !== '' && p !== undefined && p !== 0 && p !== '0') : [];

      const populatedItems = pastPayments.map((amt, index) => ({
        description: '',
        qty: '',
        unitPrice: '',
        paymentDetails: getPaymentOrdinalString(index, 0),
        date: '',
        amount: String(amt).replace(/,/g, '')
      }));

      // Add one blank item for the new payment
      populatedItems.push({
        description: '',
        qty: '',
        unitPrice: '',
        paymentDetails: getPaymentOrdinalString(populatedItems.length, 0),
        date: '',
        amount: ''
      });

      setItems(populatedItems);
    } else {
      setItems([{ description: '', qty: '', unitPrice: '', paymentDetails: '', date: '', amount: '' }]);
    }
  }, [documentType, clientData.payments]);

  const addItem = () => {
    if (items.length < 6) {
      const nextPayment = getPaymentOrdinalString(items.length, 0);
      setItems([...items, { description: '', qty: '', unitPrice: '', paymentDetails: documentType === 'receipt' ? nextPayment : '', date: '', amount: '' }]);
    }
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: 'description' | 'qty' | 'unitPrice' | 'paymentDetails' | 'date' | 'amount', value: string) => {
    const newItems = [...items];
    newItems[index][field] = value;

    if (documentType === 'invoice' && (field === 'qty' || field === 'unitPrice')) {
      const q = Number(newItems[index].qty) || 0;
      const u = Number(newItems[index].unitPrice) || 0;
      if (newItems[index].qty || newItems[index].unitPrice) {
        newItems[index].amount = (q * u).toFixed(2);
      } else {
        newItems[index].amount = '';
      }
    }

    setItems(newItems);
  };

  const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const total = subtotal - (Number(deposit) || 0);

  const generateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasAnyItem = items.some(item => item.description || item.amount || item.qty || item.unitPrice || item.paymentDetails || item.date);
    if (!hasAnyItem) {
      setStatusMessage({ type: 'error', text: 'Please add at least one item detail.' });
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

      let invoiceCount = 1;
      if (documentType === 'invoice') {
        const { data: existingInvoices, error: countError } = await supabase
          .from('billing_records')
          .select('id')
          .eq('client_id', clientData.id)
          .eq('document_type', 'invoice')
          .is('deleted_at', null);
        
        if (countError) {
          console.error('Error fetching existing invoices count:', countError);
        } else if (existingInvoices) {
          invoiceCount = existingInvoices.length + 1;
        }
      }

      const clientNoVal = clientData.clientNo !== undefined && clientData.clientNo !== null && clientData.clientNo !== '' ? clientData.clientNo : '0';
      const refNumber = documentType === 'invoice'
        ? `INV-TER-${clientNoVal}-${invoiceCount} Invoices`
        : `RCP-TER-${String(clientNoVal).padStart(4, '0')}`;

      // Date formatted as DD/MM/YYYY
      const date = new Date().toLocaleDateString('en-GB');

      // Set PDF Metadata to overwrite template name in browser tab title
      pdfDoc.setTitle(refNumber);
      pdfDoc.setAuthor('Team Email Rakyat');
      pdfDoc.setSubject(`${documentType === 'invoice' ? 'Invoice' : 'Receipt'} for ${clientData.name}`);

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
        qtyStartX: 448, qtyStartY: 566.2, qtyLineHeight: 9.6,
        unitPriceStartX: 472, unitPriceStartY: 566.2, unitPriceLineHeight: 9.6,
      };

      const receiptCoords = {
        nameX: 71.25, nameY: 602.48,
        icX: 116, icY: 588.48,
        addressX: 116, addressY: 575.48,
        refNumberX: 457.3, refNumberY: 588.68,
        dateX: 457.3, dateY: 548.88,
        descStartX: 71.25, descStartY: 496, descLineHeight: 11,
        amountStartX: 467, amountStartY: 496, amountLineHeight: 11,
        subtotalX: 0, subtotalY: 0, // Unused
        depositX: 0, depositY: 0, // Unused
        totalX: 467, totalY: 407.499,
        totalWordsX: 0, totalWordsY: 0, // Unused
        refNumberBottomX: 71.25, refNumberBottomY: 393, // Put a placeholder Y for bottom ref number
        paymentDetailsStartX: 335, paymentDetailsStartY: 496, paymentDetailsLineHeight: 11,
        itemDateStartX: 405, itemDateStartY: 496, itemDateLineHeight: 11,
      };

      const coords = documentType === 'invoice' ? invoiceCoords : receiptCoords;
      const invoiceFontSize = 5.5; // Adjust invoice font size
      const receiptFontSize = 8.5; // Adjust receipt font size

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
        qty: { font: customFont, color: rgb(0, 0, 0), size: invoiceFontSize },
        unitPrice: { font: customFont, color: rgb(0, 0, 0), size: invoiceFontSize },
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
        paymentDetails: { font: customFont, color: rgb(0, 0, 0), size: receiptFontSize },
        itemDate: { font: customFont, color: rgb(0, 0, 0), size: receiptFontSize },
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
        if (item.description) {
          firstPage.drawText(`${item.description}`, { x: coords.descStartX, y: currentDescY, ...styles.desc });
        }
        if (item.amount) {
          firstPage.drawText(formatCurrency(item.amount), { x: coords.amountStartX, y: currentAmountY, ...styles.amount });
        }
        if (documentType === 'invoice') {
          const currentQtyY = (coords as typeof invoiceCoords).qtyStartY - (index * (coords as typeof invoiceCoords).qtyLineHeight);
          const currentUnitPriceY = (coords as typeof invoiceCoords).unitPriceStartY - (index * (coords as typeof invoiceCoords).unitPriceLineHeight);
          if (item.qty) firstPage.drawText(`${item.qty}`, { x: (coords as typeof invoiceCoords).qtyStartX, y: currentQtyY, ...invoiceStyles.qty });
          if (item.unitPrice) firstPage.drawText(formatCurrency(item.unitPrice), { x: (coords as typeof invoiceCoords).unitPriceStartX, y: currentUnitPriceY, ...invoiceStyles.unitPrice });
        } else {
          const currentPaymentY = (coords as typeof receiptCoords).paymentDetailsStartY - (index * (coords as typeof receiptCoords).paymentDetailsLineHeight);
          const currentDateY = (coords as typeof receiptCoords).itemDateStartY - (index * (coords as typeof receiptCoords).itemDateLineHeight);
          if (item.paymentDetails) firstPage.drawText(`${item.paymentDetails}`, { x: (coords as typeof receiptCoords).paymentDetailsStartX, y: currentPaymentY, ...receiptStyles.paymentDetails });

          let printDate = item.date;
          if (item.date && item.date.includes('-') && item.date.split('-')[0].length === 4) {
            const [year, month, day] = item.date.split('-');
            printDate = `${day}/${month}/${year}`;
          }
          if (item.date) firstPage.drawText(`${printDate}`, { x: (coords as typeof receiptCoords).itemDateStartX, y: currentDateY, ...receiptStyles.itemDate });
        }
      });

      if (documentType === 'invoice') {
        firstPage.drawText(formatCurrency(subtotal), { x: coords.subtotalX, y: coords.subtotalY, ...styles.subtotal });
        firstPage.drawText(deposit ? formatCurrency(deposit) : `RM0`, { x: coords.depositX, y: coords.depositY, ...styles.deposit });

        // Generate total in words for Invoice only
        const integerPart = Math.floor(total);
        const decimalPart = Math.round((total - integerPart) * 100);

        const toTitleCase = (str: string) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

        let rawWords = integerPart === 0 ? 'Zero' : toTitleCase(toWords(integerPart).replace(/,/g, '').replace(/-/g, ' '));
        let totalWordsStr = rawWords.replace(/(.*(?:Hundred|Thousand|Million|Billion))\s+(.+)/i, '$1 and $2');
        if (decimalPart > 0) {
          const decimalWords = toTitleCase(toWords(decimalPart).replace(/,/g, '').replace(/-/g, ' '));
          totalWordsStr += ` and ${decimalWords} Cents`;
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

      // 6. Upload to Supabase Storage
      const docCategory = documentType === 'invoice' ? 'Invoices' : 'Receipts';
      
      // Sanitize client name for the folder path
      const safeClientName = clientData.name.replace(/[\/\\?%*:|"<>]/g, '').trim() || 'N_A';
      const clientFolder = `${clientNoVal} ${safeClientName}`;

      // Target path: e.g. "Finance/billing_documents/Invoices/151 Testing A/INV-TER-151-2 Invoices.pdf"
      const filePath = `Finance/billing_documents/${docCategory}/${clientFolder}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('company_drive')
        .upload(filePath, blob, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Failed to upload to Supabase Storage');
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('company_drive')
        .getPublicUrl(filePath);

      const fileUrl = publicUrlData.publicUrl;

      // 7. Insert to Supabase database
      const { error: dbError } = await supabase
        .from('billing_records')
        .insert([
          {
            client_id: clientData.id,
            document_type: documentType,
            ref_number: refNumber,
            amount: total,
            drive_url: fileUrl,
          }
        ]);

      if (dbError) {
        console.error('Supabase insert error:', dbError);
        throw new Error(`Upload succeeded, but failed to save record to database: ${dbError.message} (Code: ${dbError.code})`);
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
              <div key={index} className="flex flex-col sm:flex-row gap-2 items-start w-full bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl border border-slate-100 sm:border-none mb-2 sm:mb-0">
                {documentType === 'invoice' ? (
                  <div className="w-full grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:flex-[4.5]">
                    <div className="col-span-2 sm:flex-[2]">
                      <input
                        type="text"
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 sm:flex-1">
                      <input
                        type="number"
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm"
                        placeholder="Qty"
                        value={item.qty}
                        onChange={(e) => updateItem(index, 'qty', e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 sm:flex-[1.5]">
                      <input
                        type="number"
                        step="0.01"
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm"
                        placeholder="Unit Price"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-full grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:flex-[3]">
                    <div className="col-span-2 sm:flex-1">
                      <input
                        type="text"
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 sm:flex-1">
                      <input
                        type="text"
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm"
                        placeholder="Payment Details"
                        value={item.paymentDetails}
                        onChange={(e) => updateItem(index, 'paymentDetails', e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 sm:flex-1">
                      <input
                        type="date"
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm"
                        placeholder="Date"
                        value={item.date}
                        onChange={(e) => updateItem(index, 'date', e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="w-full sm:w-auto flex items-center sm:items-start gap-2 mt-1 sm:mt-0 sm:flex-[1.5]">
                  <div className="flex-1 sm:w-full">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={`w-full px-2 py-2 border border-gray-300 rounded-lg outline-none transition text-sm ${documentType === 'invoice' ? 'bg-gray-100 cursor-not-allowed' : 'focus:ring-blue-500 focus:border-blue-500'}`}
                      placeholder="Amount (RM)"
                      value={item.amount}
                      onChange={(e) => updateItem(index, 'amount', e.target.value)}
                      readOnly={documentType === 'invoice'}
                    />
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-2 sm:p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 sm:mt-0.5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
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
