import { resolve, sep } from 'path';

export const RENDERER_PROTOCOL = 'cuezy';
export const RENDERER_PROTOCOL_HOST = 'app';
export const RENDERER_ENTRY_URL = `${RENDERER_PROTOCOL}://${RENDERER_PROTOCOL_HOST}/index.html`;

export function resolveRendererProtocolPath(rendererRoot, requestUrl) {
  try {
    const root = resolve(rendererRoot);
    const url = new URL(requestUrl);
    const rawPath = requestUrl.match(/^[^:]+:\/\/[^/?#]*([^?#]*)/)?.[1] || '/index.html';
    const pathname = decodeURIComponent(rawPath || '/index.html');

    if (url.protocol !== `${RENDERER_PROTOCOL}:` || url.hostname !== RENDERER_PROTOCOL_HOST) {
      return null;
    }

    const safePathname = pathname.replace(/\\/g, '/');

    if (safePathname.includes('\0') || safePathname.split('/').includes('..')) {
      return null;
    }

    const relativePath = safePathname === '/' ? './index.html' : `.${safePathname}`;
    const filePath = resolve(root, relativePath);
    return filePath === root || filePath.startsWith(`${root}${sep}`) ? filePath : null;
  } catch {
    return null;
  }
}
