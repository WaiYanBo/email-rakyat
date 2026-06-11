import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

export function getStaticPaths() {
  return [
    { params: { name: 'blank-invoice' } },
    { params: { name: 'blank-receipt' } },
  ];
}

export const GET: APIRoute = async ({ params }) => {
  const { name } = params;
  
  if (!name || (name !== 'blank-invoice' && name !== 'blank-receipt')) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const filePath = path.resolve(process.cwd(), 'public', 'templates', `${name}.pdf`);
    const fileBuffer = fs.readFileSync(filePath);
    
    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
