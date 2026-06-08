// Client-side text extraction for PDF/DOCX/TXT and helper to call parse-jd edge fn.
import { supabase } from "@/integrations/supabase/client";
import * as pdfjsLib from "pdfjs-dist";
// Vite worker import — bundles the worker.
// @ts-expect-error — Vite ?url import not in pdfjs types
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker;

export type ParsedJDResult = {
  role: string;
  company: string;
  domain: string;
  seniority: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
  summary: string;
  yearsExperience?: string;
  location?: string;
  employmentType?: string;
  confidence: number;
};

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "txt") {
    return (await file.text()).trim();
  }

  if (ext === "pdf") {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const out: string[] = [];
    const maxPages = Math.min(pdf.numPages, 30);
    for (let p = 1; p <= maxPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const line = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
      out.push(line);
    }
    return out.join("\n").replace(/\s+/g, " ").trim();
  }

  if (ext === "docx") {
    try {
      const mammoth: any = await import("mammoth");
      const buf = await file.arrayBuffer();
      const fn = mammoth.extractRawText || mammoth.default?.extractRawText;
      const { value } = await fn({ arrayBuffer: buf });
      return (value || "").replace(/\s+/g, " ").trim();
    } catch (err) {
      console.error("mammoth load/extract failed", err);
      throw new Error("Could not read .docx file");
    }
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export async function parseJdViaAi(input: {
  text?: string;
  url?: string;
  role: string;
  company: string;
  domain?: string;
}): Promise<ParsedJDResult> {
  const { data, error } = await supabase.functions.invoke("parse-jd", {
    body: input,
  });
  if (error) throw new Error(error.message || "Failed to parse JD");
  if (!data?.parsed) throw new Error("Parser returned no result");
  return data.parsed as ParsedJDResult;
}
