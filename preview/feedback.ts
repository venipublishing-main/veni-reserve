export function feedbackTemplate(version: string, fields: { task: string; expected: string; actual: string; device: string }) {
  return `My Playground — Feedback Preview\nBuild: ${version}\nTask: ${fields.task}\nExpected: ${fields.expected}\nActual: ${fields.actual}\nDevice/browser: ${fields.device}\n\nCopied manually; not submitted. Use fictional examples; omit private data.`;
}
