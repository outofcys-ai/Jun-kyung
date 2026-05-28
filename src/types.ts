export interface DouMessage {
  id: string;
  sender: "user" | "dou";
  text: string;
  timestamp: Date;
  referenceQuote?: {
    chapter: string;
    section: string;
    content: string;
  };
}

export type DouVoiceState = "idle" | "listening" | "processing" | "speaking";
export type ScriptureCategory = "전체" | "행록" | "공사" | "교운" | "교법" | "예시";
