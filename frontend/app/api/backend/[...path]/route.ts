import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://backend:8000';

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const subpath = params.path ? params.path.join('/') : '';
  const search = request.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/v1/${subpath}${search}`;

  try {
    const res = await fetch(targetUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json, audio/*',
      },
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('audio/')) {
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, {
        status: res.status,
        headers: {
          'Content-Type': contentType,
          'Content-Length': buffer.byteLength.toString(),
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  const subpath = params.path ? params.path.join('/') : '';
  const search = request.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/v1/${subpath}${search}`;
  const contentType = request.headers.get('content-type') || '';

  try {
    let fetchOptions: RequestInit = {
      method: 'POST',
    };

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      fetchOptions.body = formData;
    } else if (contentType.includes('application/json')) {
      const body = await request.json();
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify(body);
    } else {
      const arrayBuffer = await request.arrayBuffer();
      fetchOptions.headers = contentType ? { 'Content-Type': contentType } : undefined;
      fetchOptions.body = arrayBuffer;
    }

    const res = await fetch(targetUrl, fetchOptions);
    const resContentType = res.headers.get('content-type') || '';

    if (resContentType.includes('audio/')) {
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, {
        status: res.status,
        headers: {
          'Content-Type': resContentType,
          'Content-Length': buffer.byteLength.toString(),
        },
      });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
