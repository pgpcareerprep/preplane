export interface ProviderConfig {
  name: string;
  url: string;
  key: string;
  toolModel: string;
  toolFallbacks: readonly string[];
  synthesisModels: readonly string[];
  extraHeaders: Record<string, string>;
}
