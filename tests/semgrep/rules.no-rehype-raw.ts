// ruleid: no-rehype-raw
import plugin from 'rehype-raw';

export const markdownHtmlPlugin = plugin;

export function okMarkdown() {
  // ok: no-rehype-raw
  return ['remarkGfm'];
}
