import type { APIRoute } from 'astro';
import { google } from 'googleapis';
import { Readable } from 'stream';

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    let fileBuffer: Buffer;
    let fileName: string;
    let documentType: string | null = null;
    let mimeType: string = 'application/pdf';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      documentType = body.documentType;
      fileName = body.fileName;
      mimeType = body.mimeType || 'application/pdf';
      const base64Data = body.file.replace(/^data:.*?;base64,/, '');
      fileBuffer = Buffer.from(base64Data, 'base64');
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      documentType = formData.get('documentType') as string | null;
      
      if (!file) throw new Error('Missing file');
      fileName = file.name;
      mimeType = file.type;
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else {
      throw new Error('Unsupported content type');
    }

    if (!fileBuffer || !documentType) {
      return new Response(JSON.stringify({ error: 'Missing file or documentType' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (documentType !== 'invoice' && documentType !== 'receipt') {
      return new Response(JSON.stringify({ error: 'Invalid documentType' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const parentFolderId =
      documentType === 'invoice'
        ? process.env.GOOGLE_DRIVE_INVOICE_FOLDER_ID
        : process.env.GOOGLE_DRIVE_RECEIPT_FOLDER_ID;

    if (!parentFolderId) {
      return new Response(
        JSON.stringify({ error: `Missing environment variable for ${documentType} folder ID` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    // Replace \\n or \n properly to ensure the private key has correct line breaks
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Google Service Account credentials' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Google Auth
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // Determine current "Month Year" (e.g., "July 2026")
    const now = new Date();
    const monthYear = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Check if subfolder exists
    const q = `name='${monthYear}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    let targetFolderId: string | null | undefined = null;

    if (res.data.files && res.data.files.length > 0) {
      // Subfolder exists
      targetFolderId = res.data.files[0].id;
    } else {
      // Subfolder does NOT exist, create it
      const folderMetadata = {
        name: monthYear,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      };
      const folderRes = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id',
      });
      targetFolderId = folderRes.data.id;
    }

    if (!targetFolderId) {
      throw new Error('Failed to determine or create target folder');
    }

    // Convert Buffer to Node.js Readable stream
    const stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);

    // Upload the file
    const fileMetadata = {
      name: fileName,
      parents: [targetFolderId],
    };
    const media = {
      mimeType: mimeType,
      body: stream,
    };

    const uploadRes = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    return new Response(
      JSON.stringify({ success: true, fileId: uploadRes.data.id, webViewLink: uploadRes.data.webViewLink }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Drive upload error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
