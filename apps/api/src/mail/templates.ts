function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function actionEmail(input: { heading: string; body: string; actionLabel: string; url: string }) {
  const text = `${input.heading}\n\n${input.body}\n\n${input.actionLabel}: ${input.url}\n\nIf you did not expect this email you can ignore it.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#18181b">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(input.heading)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escapeHtml(input.body)}</p>
<p><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">${escapeHtml(input.actionLabel)}</a></p>
<p style="font-size:12px;color:#71717a;margin-top:24px">If you did not expect this email you can ignore it.</p></div>`;
  return { text, html };
}
