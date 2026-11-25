import type { ApiResponse } from '@/types';

export function ok<T>(data: T, message?: string, pagination?: ApiResponse<T>['pagination']): Response {
  const body: ApiResponse<T> = { success: true, data, message, pagination };
  return Response.json(body, { status: 200 });
}

export function created<T>(data: T, message?: string): Response {
  const body: ApiResponse<T> = { success: true, data, message };
  return Response.json(body, { status: 201 });
}

export function badRequest(error: string): Response {
  return Response.json({ success: false, error } satisfies ApiResponse, { status: 400 });
}

export function unauthorized(error = 'Unauthorized'): Response {
  return Response.json({ success: false, error } satisfies ApiResponse, { status: 401 });
}

export function forbidden(error = 'Forbidden'): Response {
  return Response.json({ success: false, error } satisfies ApiResponse, { status: 403 });
}

export function notFound(error = 'Not found'): Response {
  return Response.json({ success: false, error } satisfies ApiResponse, { status: 404 });
}

export function conflict(error: string): Response {
  return Response.json({ success: false, error } satisfies ApiResponse, { status: 409 });
}

export function serverError(error = 'Internal server error'): Response {
  return Response.json({ success: false, error } satisfies ApiResponse, { status: 500 });
}

export function validationError(issues: { path: string; message: string }[]): Response {
  return Response.json(
    { success: false, error: 'Validation failed', data: issues },
    { status: 422 }
  );
}
