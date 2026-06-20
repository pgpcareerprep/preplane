export function isMentorCoverageQuery(message: string): boolean {
  const text = message.toLowerCase();
  return /\bmentors?\b/.test(text) &&
    /\b(ongoing|active|open|process|lmp)\b/.test(text) &&
    /\b(don'?t have|doesn'?t have|without|not aligned|unassigned|need|missing|yet)\b/.test(text);
}

export function shouldPrefetchRag(message: string): boolean {
  return /\b(similar|semantic|precedent|example|historical|previous|past|like this|related|recommend|best match|strong fit)\b/i.test(message);
}

export function isPocProgressReportQuery(message: string): boolean {
  const text = message.toLowerCase();
  const mentionsPocs = /\b(pocs?|prep\s+pocs?)\b/.test(text);
  const progressReport = /\b(progress report|progress update|progress summary|performance report|status report|daily progress)\b/.test(text);
  const allPocsReport = /\b(report|summary)\b/.test(text) && /\b(all|every|each)\b/.test(text) && mentionsPocs;
  return mentionsPocs && (progressReport || allPocsReport);
}

/** POC mentioned explicitly or via "poc wise" / "by poc" phrasing. */
function mentionsPocScope(text: string): boolean {
  return /\b(pocs?|prep\s+pocs?)\b/.test(text) ||
    /\bpoc\s+wise\b/.test(text) ||
    /\b(by|per|each)\s+poc\b/.test(text) ||
    /\bconversion\s+by\s+poc\b/.test(text);
}

/** Follow-ups like "conversion and performance percentage poc wise" (no exact "conversion rate" phrase). */
export function isPocConversionMetricsQuery(message: string): boolean {
  const text = message.toLowerCase();
  if (!mentionsPocScope(text)) return false;
  return /\b(conversion|converted|convert|performance|percentage|percent|%)\b/.test(text);
}

export function isPocWorkloadQuery(message: string): boolean {
  const text = message.toLowerCase();
  if (isPocProgressReportQuery(message)) return true;
  if (isPocConversionMetricsQuery(message)) return true;
  return mentionsPocScope(text) &&
    /\b(workload|active load|capacity|max threshold|conversion rate)\b/.test(text);
}

export function isConversionReportQuery(message: string): boolean {
  const text = message.toLowerCase();
  const mentionsConversion = /\b(conversion|converted|convert)\b/.test(text);
  const mentionsLmp = /\blmp(s)?\b/.test(text);
  const mentionsStudents = /\b(student|students|placement|placed)\b/.test(text);
  const reportIntent = /\b(report|summary|dashboard|overview|breakdown|analytics|create|generate|show me|show)\b/.test(text);
  const pocConversionBreakdown =
    mentionsConversion &&
    reportIntent &&
    (/\b(pocs?|by poc|per poc|poc wise|each poc)\b/.test(text) || /\bbreak down\b.*\bpoc\b/.test(text));
  const lmpConversion = mentionsLmp && mentionsConversion;
  const studentPlacementConversion =
    mentionsStudents &&
    (/\b(place|placement|placed)\b/.test(text) || /\bstudent(s)?\s+(place|placement)\b/.test(text)) &&
    mentionsConversion;
  const combinedReport = lmpConversion && studentPlacementConversion && reportIntent;
  const dualMetricReport = lmpConversion && studentPlacementConversion;
  const conversionReportPhrase = /\b(conversion report|conversion summary|conversion dashboard)\b/.test(text);
  return combinedReport || dualMetricReport || conversionReportPhrase || pocConversionBreakdown;
}

/** Export / download the previous answer as PDF (skip full AI tool loop). */
export function isCopilotPdfExportQuery(message: string): boolean {
  const text = message.toLowerCase().trim();
  if (!text) return false;
  const wantsPdf = /\b(pdf|\.pdf)\b/.test(text);
  const exportVerb = /\b(create|generate|make|export|download|save|get|give me|prepare)\b/.test(text);
  const docNoun = /\b(pdf|report|document|doc|file|this|above|previous|last answer|conversation|chat)\b/.test(text);
  if (wantsPdf && exportVerb) return true;
  if (/\bdownload\b/.test(text) && /\b(pdf|report)\b/.test(text)) return true;
  if (/\bexport\b/.test(text) && /\b(pdf|report|this)\b/.test(text)) return true;
  return exportVerb && docNoun && /\b(pdf|download|export|save)\b/.test(text);
}

export function isConversionCountQuery(message: string): boolean {
  if (isConversionReportQuery(message)) return false;
  const text = message.toLowerCase();
  return /\b(how many|count|total|number of|tell me how many)\b/.test(text) &&
    /\b(converted|conversions?|placed|offer received)\b/.test(text);
}
