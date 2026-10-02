export function badHtml(html: string) {
  // ruleid: no-dangerously-set-inner-html
  return { dangerouslySetInnerHTML: { __html: html } };
}

export function okText(text: string) {
  // ok: no-dangerously-set-inner-html
  return { children: text };
}
