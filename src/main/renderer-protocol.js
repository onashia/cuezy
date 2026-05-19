import { resolve, sep } from 'path';

export const RENDERER_PROTOCOL = 'cuezy';
export const RENDERER_PROTOCOL_HOST = 'app';
export const RENDERER_ENTRY_URL = `${RENDERER_PROTOCOL}://${RENDERER_PROTOCOL_HOST}/index.html`;

export function resolveRendererProtocolPath(rendererRoot, requestUrl) {
  const root = resolve(rendererRoot);
  let url;
  let pathname;

  try {
    url = new URL(requestUrl);
    const rawPath = requestUrl.match(/^[^:]+:\/\/[^/?#]*([^?#]*)/)?.[1] || '/index.html';
    pathname = decodeURIComponent(rawPath || '/index.html');
  } catch {
    return null;
  }

  if (url.protocol !== `${RENDERER_PROTOCOL}:` || url.hostname !== RENDERER_PROTOCOL_HOST) {
    return null;
  }

  if (pathname.split('/').includes('..')) {
    return null;
  }

  const relativePath = pathname === '/' ? './index.html' : `.${pathname}`;
  const filePath = resolve(root, relativePath);
  return filePath === root || filePath.startsWith(`${root}${sep}`) ? filePath : null;
}
