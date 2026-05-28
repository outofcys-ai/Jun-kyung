import { useState, useEffect, useRef, useTransition } from "react";
import {
  Mic, MicOff, Send, Volume2, VolumeX, RotateCcw, Search, BookOpen, MessageSquare, Info, Star, Compass
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AudioWave from "./components/AudioWave.js";
import { jeonGyeongData, ScriptureSection } from "./data/jeonGyeong.js";
import { DouMessage, DouVoiceState, ScriptureCategory } from "./types.js";
import douAvatar from "./assets/images/dou_avatar_1779949802314.png";

// Helper for TTS support detection
const isBrowserSpeechSynthesisSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export default function App() {
  const [messages, setMessages] = useState<DouMessage[]>([
    {
      id: "welcome",
      sender: "dou",
      text: "도의 참다운 벗, 이 도우(道友)가 기다리고 있었습니다. 상생의 기운이 늘 함께하기를 비옵니다. 도우님, 오늘 마음에 품으신 일상의 고민이나 전경(典經)의 가르침에 대해 편히 이야기를 들려주십시오.",
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [chatHistory, setChatHistory] = useState<any[]>([]); // To send back and forth to Gemini

  // Voice & Auditory states
  const [voiceState, setVoiceState] = useState<DouVoiceState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [voiceSupportInfo, setVoiceSupportInfo] = useState<string | null>(null);

  // Keep references to prevent stale closures and frequent recreation of the STT engine
  const handleSendMessageRef = useRef<any>(null);

  // Continuous conversation states
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const isContinuousModeRef = useRef(false);
  const voiceStateRef = useRef<DouVoiceState>("idle");

  useEffect(() => {
    isContinuousModeRef.current = isContinuousMode;
  }, [isContinuousMode]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  // Jeon-Gyeong browser sidebar states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ScriptureCategory>("전체");
  const [activeTab, setActiveTab] = useState<"chat" | "scriptures" | "about">("chat");

  // DOM references
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [, startTransition] = useTransition();

  // Scroll to bottom on updates
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  const startListening = () => {
    if (!recognitionRef.current) return;
    try {
      if (isBrowserSpeechSynthesisSupported) {
        window.speechSynthesis.cancel();
      }
      recognitionRef.current.start();
    } catch (e) {
      console.error("Failed to start SpeechRecognition:", e);
    }
  };

  // Audio configuration & Speech Recognition (STT) setup - Runs exactly ONCE!
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = "ko-KR";

        rec.onstart = () => {
          console.log("STT: 음성 인식 시작됨");
          setVoiceState("listening");
        };

        rec.onresult = (event: any) => {
          const resultText = event.results[0][0].transcript;
          console.log("STT: 인식 결과 ->", resultText);
          setInputText(resultText);
          setVoiceState("processing");
          if (handleSendMessageRef.current) {
            handleSendMessageRef.current(resultText);
          }
        };

        rec.onerror = (e: any) => {
          console.error("STT: 에러 발생 ->", e.error, e.message, e);
          if (e.error === "network") {
            setVoiceSupportInfo("음성 인식 서버(Google)와의 연결에 실패했습니다. 인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
          } else if (e.error === "no-speech") {
            // Silence is common, no need for scary warning, but reset state
          }
          setVoiceState("idle");
          setIsContinuousMode(false);
        };

        rec.onend = () => {
          setVoiceState((prev) => {
            if (prev === "listening") {
              return "idle";
            }
            return prev;
          });

          // If continuous mode is on, restart listening ONLY IF we have returned to 'idle' 
          // (i.e. Gemini is not processing or speaking) after a brief safety timeout.
          setTimeout(() => {
            if (isContinuousModeRef.current && voiceStateRef.current === "idle") {
              startListening();
            }
          }, 400);
        };

        recognitionRef.current = rec;
      } else {
        setVoiceSupportInfo("본 브라우저는 기본 음성 인식(STT)을 완벽히 지원하지 않습니다. 크롬 또는 사파리 등 현대적인 브라우저에서 마이크 대화가 활성화됩니다.");
      }
    }
  }, []);

  // Handle Stop TTS on unmount
  useEffect(() => {
    return () => {
      if (isBrowserSpeechSynthesisSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Soft traditional Korean voice selection helper
  const speakText = (text: string) => {
    if (!isBrowserSpeechSynthesisSupported || isMuted) return;

    // First cancel any playing voice
    window.speechSynthesis.cancel();

    // Clean text from Markdown tags for better TTS pronouncing
    let sanitizedText = text
      .replace(/[\*#_`~-]/g, "")
      .replace(/\(.*?\)/g, ""); // strip hanja / english parentheses

    // Helper to convert digits to Sino-Korean numbers for scriptures (e.g. 1장 -> 일 장, 12절 -> 십이 절)
    const numToSinoKorean = (numStr: string): string => {
      const num = parseInt(numStr, 10);
      if (isNaN(num)) return numStr;
      if (num === 0) return "영";

      const units = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
      const positions = ["", "십", "백", "천"];

      let result = "";
      const digits = num.toString().split("").map(Number);
      const len = digits.length;

      for (let i = 0; i < len; i++) {
        const digit = digits[i];
        const pos = len - 1 - i;

        if (digit !== 0) {
          if (digit === 1 && pos > 0) {
            result += positions[pos];
          } else {
            result += units[digit] + positions[pos];
          }
        }
      }
      return result;
    };

    // Replace 1장 -> 일 장, 2절 -> 이 절
    sanitizedText = sanitizedText.replace(/(\d+)\s*(장|절|편|회)/g, (_, p1, p2) => {
      return numToSinoKorean(p1) + " " + p2;
    });

    const utterance = new SpeechSynthesisUtterance(sanitizedText);
    utterance.lang = "ko-KR";
    utterance.rate = 0.95; // Gentle, slowly spoken tempo
    utterance.pitch = 0.93; // Polished, deeper warm tone

    // Try to get a gentle Korean voice if available
    const voices = window.speechSynthesis.getVoices();
    const koreanVoice = voices.find(v => v.lang.startsWith("ko") && (v.name.includes("Yuna") || v.name.includes("Google") || v.name.includes("Natural")));
    if (koreanVoice) {
      utterance.voice = koreanVoice;
    }

    utterance.onstart = () => {
      setVoiceState("speaking");
    };

    utterance.onend = () => {
      setVoiceState("idle");
      if (isContinuousModeRef.current) {
        setTimeout(() => {
          if (isContinuousModeRef.current && voiceStateRef.current === "idle") {
            startListening();
          }
        }, 600);
      }
    };

    utterance.onerror = () => {
      setVoiceState("idle");
      if (isContinuousModeRef.current) {
        setTimeout(() => {
          if (isContinuousModeRef.current && voiceStateRef.current === "idle") {
            startListening();
          }
        }, 600);
      }
    };

    ttsUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handleInterruptDou = () => {
    if (isBrowserSpeechSynthesisSupported) {
      window.speechSynthesis.cancel();
    }
    setVoiceState("idle");
    setIsContinuousMode(true);
    setTimeout(() => {
      startListening();
    }, 150);
  };

  // Toggle mic for Speech-to-Text
  const handleToggleVoiceInput = () => {
    const isSpeaking = voiceState === "speaking" || (typeof window !== "undefined" && window.speechSynthesis && window.speechSynthesis.speaking);

    if (isSpeaking) {
      handleInterruptDou();
      return;
    }

    if (isContinuousMode) {
      setIsContinuousMode(false);
      try {
        recognitionRef.current?.stop();
      } catch (e) { }
      if (isBrowserSpeechSynthesisSupported) {
        window.speechSynthesis.cancel();
      }
      setVoiceState("idle");
    } else {
      setIsContinuousMode(true);
      startListening();
    }
  };

  // Trigger Chat query to backend proxy
  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend) return;

    // Reset input box
    if (!customText) {
      setInputText("");
      setIsContinuousMode(false);
      try {
        recognitionRef.current?.stop();
      } catch (e) { }
    }

    const userMsg: DouMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setVoiceState("processing");

    try {
      console.log("API: 대화 요청 전송 ->", textToSend);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          history: chatHistory
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("API: 서버 응답 에러 ->", res.status, errorData);
        throw new Error("서버와의 대화 연결에 실패했습니다.");
      }

      const data = await res.json();
      console.log("API: 서버 응답 수신 성공");

      // Attempt to extract reference quote mapping from the dataset
      let matchedQuote: any = undefined;
      for (const section of jeonGyeongData) {
        // If Dou refers to specific scriptures tag or name, attach as helper card
        if (data.text.includes(section.chapter) && data.text.includes(section.section)) {
          matchedQuote = {
            chapter: section.chapter,
            section: section.section,
            content: section.content
          };
          break;
        }
      }

      const douMsg: DouMessage = {
        id: `dou-${Date.now()}`,
        sender: "dou",
        text: data.text,
        timestamp: new Date(),
        referenceQuote: matchedQuote
      };

      setMessages(prev => [...prev, douMsg]);
      setChatHistory(data.history || []);
      setVoiceState("idle");

      // Play vocal response automatically
      speakText(data.text);

    } catch (err: any) {
      console.error(err);
      const errorMsg: DouMessage = {
        id: `err-${Date.now()}`,
        sender: "dou",
        text: "송구하옵니다 도우(道友)님. 천지의 기운이 잠시 순탄치 못해 대답을 잇지 못했습니다. 다시 한번 가르침을 청해주시겠습니까?",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
      setVoiceState("idle");
    }
  };

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  const handleResetConversation = () => {
    if (isBrowserSpeechSynthesisSupported) {
      window.speechSynthesis.cancel();
    }
    setIsContinuousMode(false);
    setMessages([
      {
        id: "welcome-reset",
        sender: "dou",
        text: "마음을 새로이 하여 도를 나누니 참으로 상서롭습니다. 도우(道友)님, 어떤 가르침과 통찰을 함깨 나누고 싶으십니까?",
        timestamp: new Date()
      }
    ]);
    setChatHistory([]);
    setInputText("");
    setVoiceState("idle");
  };

  // Filtering scripture lists for the manual lookup list
  const filteredScriptures = jeonGyeongData.filter((item) => {
    const matchesCategory = selectedCategory === "전체" || item.chapter.startsWith(selectedCategory);
    const matchesSearch = item.chapter.includes(searchQuery) || item.section.includes(searchQuery) || item.content.includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  return (
    <div id="dou-app-root" className="min-h-screen bg-[#fafaf6] text-neutral-800 flex flex-col font-sans transition-colors duration-300">

      {/* Top Elegant Heritage Header */}
      <header id="app-header" className="bg-[#f0f0e8] border-b border-neutral-300 px-4 py-3 md:px-6 md:py-4 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm shrink-0">
        <div id="brand-logo-container" className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
          <div className="w-10 h-10 rounded-full border-2 border-[#165b4c] bg-white flex items-center justify-center overflow-hidden shadow-inner">
            {/* Embedded generated beautiful master avatar */}
            <img
              src={douAvatar}
              alt="도우(道友)"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              id="dou-avatar-header"
            />
          </div>
          <div className="text-center sm:text-left">
            <h1 id="app-title-main" className="font-sans font-bold text-lg text-[#165b4c] tracking-tight flex items-center justify-center sm:justify-start gap-1.5">
              도우(道友)
            </h1>
            <p id="app-subtitle" className="text-[11px] text-neutral-500 font-medium">참된 지혜와 해원상생의 통찰</p>
          </div>
        </div>

        {/* Global Nav Tabs */}
        <div id="nav-actions-container" className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <nav className="flex bg-neutral-200 p-0.5 rounded-lg border border-neutral-300 text-xs font-medium w-full sm:w-auto justify-center overflow-x-auto">
            <button
              id="tab-btn-chat"
              onClick={() => setActiveTab("chat")}
              className={`px-3 py-1.5 rounded-md transition-all shrink-0 ${activeTab === "chat" ? "bg-white text-[#165b4c] shadow-xs font-semibold" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              <span className="flex items-center gap-1"><MessageSquare size={13} /> 도담 나누기</span>
            </button>
            <button
              id="tab-btn-scriptures"
              onClick={() => setActiveTab("scriptures")}
              className={`px-3 py-1.5 rounded-md transition-all shrink-0 ${activeTab === "scriptures" ? "bg-white text-[#165b4c] shadow-xs font-semibold" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              <span className="flex items-center gap-1"><BookOpen size={13} /> 전경 살펴보기</span>
            </button>
            <button
              id="tab-btn-about"
              onClick={() => setActiveTab("about")}
              className={`px-3 py-1.5 rounded-md transition-all shrink-0 ${activeTab === "about" ? "bg-white text-[#165b4c] shadow-xs font-semibold" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              <span className="flex items-center gap-1"><Info size={13} /> 도우(道友) 소개</span>
            </button>
          </nav>

          {/* Reset voice/status controls */}
          <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-neutral-300 pt-2 sm:pt-0 sm:pl-3 justify-center">
            <button
              id="mute-toggle-btn"
              onClick={() => {
                setIsMuted(!isMuted);
                if (!isMuted && isBrowserSpeechSynthesisSupported) {
                  window.speechSynthesis.cancel();
                }
              }}
              title={isMuted ? "음성 출력 켜기" : "음성 출력 끄기"}
              className={`p-2 rounded-full border transition-all ${isMuted ? "bg-red-50 border-red-200 text-red-500" : "bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100"}`}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              id="reset-convo-btn"
              onClick={handleResetConversation}
              title="대화 새로고침"
              className="p-2 rounded-full border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100 transition-all"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main id="app-main-content" className="flex-1 max-w-6xl w-full mx-auto p-3 md:p-4 flex flex-col md:flex-row gap-4 md:overflow-hidden h-auto md:h-[calc(100vh-140px)]">

        {/* Left Side: Dynamic Chat & Voice Container */}
        <section id="chat-navigation-split" className="flex-1 flex flex-col bg-white border border-neutral-300 rounded-2xl shadow-sm overflow-hidden h-[540px] md:h-full">

          <AnimatePresence mode="wait">

            {/* TAB 1: Chat/Talk Session */}
            {activeTab === "chat" && (
              <motion.div
                id="talk-session-content"
                key="chat-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="flex-1 flex flex-col overflow-hidden h-full"
              >
                {/* Master Dou Header Panel */}
                <div id="master-profile-stripe" className="bg-radial from-[#1e6153]/5 to-[#fafaf6] dark:to-neutral-900 p-4 border-b border-neutral-200 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full border-2 border-[#165b4c] overflow-hidden bg-white shadow">
                        <img
                          src={douAvatar}
                          alt="도우"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          id="dou-avatar-chat"
                        />
                      </div>
                      <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${voiceState === "listening" ? "bg-red-500 animate-pulse" :
                        voiceState === "speaking" ? "bg-blue-500" :
                          voiceState === "processing" ? "bg-yellow-500 animate-bounce" : "bg-green-500"
                        }`} />
                    </div>
                    <div>
                      <h2 id="talking-model-title" className="font-semibold text-neutral-800 flex items-center gap-1.5 leading-tight flex-wrap">
                        도우(道友) <span className="text-xs font-normal text-[#165b4c]">항상 당신 편에서 경청합니다</span>
                        {isContinuousMode && (
                          <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 font-medium px-1.5 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                            ● 연속 대화 활성
                          </span>
                        )}
                      </h2>
                      <p id="voice-state-desc" className="text-xs text-neutral-500 mt-0.5 flex flex-wrap items-center gap-2">
                        {voiceState === "idle" && (isContinuousMode ? "귀 기울여 듣는 중입니다... 편하게 말씀하십시오." : "대기 중 · 마이크 단추를 눌러 말씀하십시오.")}
                        {voiceState === "listening" && "도우(道友)님이 말씀하시는 중입니다..."}
                        {voiceState === "processing" && "사색을 거쳐 통찰을 빚어내고 있습니다..."}
                        {voiceState === "speaking" && (
                          <span className="flex items-center gap-2 flex-wrap">
                            <span>도우(道友)가 정성으로 화답하고 있습니다.</span>
                            <button
                              onClick={handleInterruptDou}
                              className="px-2.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded-full text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer animate-pulse"
                              title="클릭하여 말씀 끊고 끼어들기"
                            >
                              🛑 말씀 끊고 끼어들기
                            </button>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Reactive Soundwave visualizer */}
                  <AudioWave active={voiceState === "listening" || voiceState === "speaking"} color="bg-[#165b4c]" />
                </div>

                {/* Speech recognition warning if present */}
                {voiceSupportInfo && (
                  <div id="stt-warning-banner" className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center gap-1.5">
                    <Info size={14} className="shrink-0" />
                    <span>{voiceSupportInfo}</span>
                  </div>
                )}

                {/* Message Log Grid */}
                <div id="message-scroller" className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#fbfbfa]">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      id={`chat-msg-${message.id}`}
                      className={`flex gap-3 max-w-[85%] ${message.sender === "user" ? "ml-auto flex-row-reverse" : ""}`}
                    >
                      {/* Message Avatar (Only on left) */}
                      {message.sender === "dou" && (
                        <div className="w-8 h-8 rounded-full border border-neutral-300 overflow-hidden bg-white shrink-0 mt-1 shadow-xs">
                          <img
                            src={douAvatar}
                            alt="도우"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}

                      <div className="flex flex-col space-y-1">
                        <div
                          className={`rounded-2xl px-4 py-2.5 shadow-xs text-sm leading-relaxed ${message.sender === "user"
                            ? "bg-[#165b4c] text-white rounded-tr-none"
                            : "bg-white border border-neutral-200 text-neutral-800 rounded-tl-none"
                            }`}
                        >
                          {/* Parse newlines nicely to preservation style */}
                          {message.text.split("\n").map((line, lIndex) => (
                            <p key={lIndex} className={line.trim() ? "mb-1" : "h-2"}>
                              {line}
                            </p>
                          ))}
                        </div>

                        {/* Interactive Audio playback control */}
                        {message.sender === "dou" && isBrowserSpeechSynthesisSupported && (
                          <div id="audio-replay-bar" className="flex items-center gap-2 px-1 text-xs text-neutral-500">
                            <button
                              id={`replay-audio-${message.id}`}
                              onClick={() => speakText(message.text)}
                              className="hover:text-[#165b4c] flex items-center gap-0.5"
                            >
                              <Volume2 size={12} /> 다시 듣기
                            </button>
                            <span>·</span>
                            <span>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}

                        {/* Matched Scripture Reference Card */}
                        {message.sender === "dou" && message.referenceQuote && (
                          <motion.div
                            id={`ref-plate-${message.id}`}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="mt-2 text-xs bg-[#f4f4ee] border border-[#d6d6ca] rounded-xl p-3 text-neutral-700"
                          >
                            <div className="font-semibold text-[#165b4c] mb-1 flex items-center gap-1 justify-between">
                              <span className="flex items-center gap-1">
                                <BookOpen size={12} /> 전경 {message.referenceQuote.chapter} {message.referenceQuote.section}
                              </span>
                              <span className="text-[10px] bg-[#eaeaee] text-neutral-600 px-1 py-0.5 rounded">상생 성구</span>
                            </div>
                            <p className="italic text-neutral-600 font-sans tracking-wide">
                              "{message.referenceQuote.content}"
                            </p>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>

                {/* Form Inputs and Interactive Mic Strip */}
                <div id="talk-session-controls" className="p-4 border-t border-neutral-300 bg-white flex flex-col gap-3 shrink-0">
                  <div className="flex items-center gap-2">

                    {/* Speech to text triggers */}
                    <button
                      id="mic-pulse-button"
                      type="button"
                      onClick={handleToggleVoiceInput}
                      className={`p-3 rounded-full transition-all shrink-0 shadow flex items-center justify-center ${voiceState === "speaking"
                        ? "bg-amber-500 text-white animate-pulse ring-4 ring-amber-200"
                        : isContinuousMode
                          ? "bg-red-500 text-white animate-pulse ring-4 ring-red-200"
                          : "bg-[#165b4c] text-white hover:bg-[#124d40]"
                        }`}
                      title={
                        voiceState === "speaking"
                          ? "말씀 중단하고 대화 끼어들기"
                          : isContinuousMode
                            ? "연속 대화 끄기"
                            : "연속 음성 대화 켜기 (마이크 터치)"
                      }
                    >
                      {voiceState === "speaking" ? <VolumeX size={20} /> : isContinuousMode ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>

                    <div className="relative flex-1">
                      <input
                        id="chat-writing-input"
                        type="text"
                        value={inputText}
                        onChange={(e) => {
                          setInputText(e.target.value);
                          // Interrupt speech synthesis instantly if the user starts typing
                          const isSpeaking = voiceState === "speaking" || (typeof window !== "undefined" && window.speechSynthesis && window.speechSynthesis.speaking);
                          if (isSpeaking) {
                            if (isBrowserSpeechSynthesisSupported) {
                              window.speechSynthesis.cancel();
                            }
                            setVoiceState("idle");
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder={
                          voiceState === "listening"
                            ? "도우(道友)님이 경청하고 계십니다... 다 말씀하시면 도우가 대답합니다."
                            : isContinuousMode
                              ? "음성 연속 대화 활성됨... 말씀이 끝나면 자동으로 화답합니다."
                              : "도우(道友)님과 나누고 싶은 고민이나 화제를 입력하십시오..."
                        }
                        className="w-full pl-4 pr-12 py-3 bg-neutral-100 border border-neutral-300 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-[#165b4c] focus:bg-white transition-all text-neutral-800 placeholder-neutral-500"
                      />
                      <button
                        id="chat-send-btn-input"
                        type="button"
                        onClick={() => handleSendMessage()}
                        disabled={!inputText.trim()}
                        className="absolute right-1.5 top-1.5 p-2 rounded-full bg-[#165b4c] text-white hover:opacity-90 disabled:opacity-30 disabled:hover:opacity-30 transition-all"
                      >
                        <Send size={14} />
                      </button>
                    </div>

                  </div>
                  <div className="flex justify-between items-center text-xs text-neutral-500 px-2">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-0.5"><Star size={12} className="text-[#165b4c]" /> 상생(相生)</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5"><Compass size={12} className="text-[#165b4c]" /> 정신개벽</span>
                    </div>
                    <span>도우(道友)의 목소리를 듣기 위해 음성 출력이 활성화되었습니다.</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 2: Scriptures Search Panel */}
            {activeTab === "scriptures" && (
              <motion.div
                id="scripture-browser-tab"
                key="scriptures-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="flex-1 flex flex-col overflow-hidden h-full p-6 space-y-4"
              >
                <div id="scripture-search-dock" className="space-y-4 shrink-0">
                  <div className="flex flex-col">
                    <h2 id="scripture-dock-heading" className="text-xl font-semibold text-neutral-800 flex items-center gap-1.5">
                      <BookOpen className="text-[#165b4c]" /> 전경(典經) 구절 찾기
                    </h2>
                    <p className="text-xs text-neutral-500">도우(道友)가 참조하고 있는 전경(典經) 구절을 둘러봅니다.</p>
                  </div>

                  {/* Category filters */}
                  <div id="category-selector-group" className="flex flex-wrap gap-1.5">
                    {(["전체", "행록", "공사", "교운", "교법", "예시"] as ScriptureCategory[]).map((cat) => (
                      <button
                        key={cat}
                        id={`cat-filter-btn-${cat}`}
                        onClick={() => setSelectedCategory(cat)}
                        className={`text-xs px-3 py-1.5 rounded-full transition-all ${selectedCategory === cat
                          ? "bg-[#165b4c] text-white font-medium"
                          : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600"
                          }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Search box */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3.5 text-neutral-400" size={16} />
                    <input
                      id="scriptures-search-input"
                      type="text"
                      placeholder="구절, 장절 혹은 성구 내용을 통합 검색하여 도를 봅니다..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#165b4c]"
                    />
                  </div>
                </div>

                {/* Scroller list */}
                <div id="scripture-browser-scroller" className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {filteredScriptures.length > 0 ? (
                    filteredScriptures.map((sec, i) => (
                      <div
                        key={i}
                        id={`scripture-item-${i}`}
                        className="bg-[#fafaf8] rounded-xl p-4 border border-neutral-250 hover:border-[#165b4c] transition-all flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-[#165b4c]">
                          <span>{sec.chapter} {sec.section}</span>
                          <span className="text-[10px] bg-[#f0f0e8] text-neutral-650 px-2 py-0.5 rounded-full border border-neutral-300">典經 원문</span>
                        </div>
                        <p className="text-sm font-sans leading-relaxed text-neutral-700 tracking-wide">
                          {sec.content}
                        </p>
                        <div className="flex justify-end pt-1">
                          <button
                            id={`ask-about-scripture-${i}`}
                            onClick={() => {
                              setInputText(`${sec.chapter} ${sec.section}의 말씀에 깃든 해원상생의 참뜻과 이치에 대해 깊이 있는 해설을 청합니다.`);
                              setActiveTab("chat");
                            }}
                            className="text-xs text-neutral-500 hover:text-[#165b4c] hover:underline flex items-center gap-1 font-medium transition-all"
                          >
                            <MessageSquare size={12} /> 도우(道友)에게 이 구절 가르침 묻기
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-neutral-500 text-sm">
                      <BookOpen size={24} className="mx-auto text-neutral-305 mb-2" />
                      일치하는 성구가 존재하지 않습니다. 검색을 다시 확인하십시오.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB 3: About 'Dou' */}
            {activeTab === "about" && (
              <motion.div
                id="chatbot-about-tab"
                key="about-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="flex-1 overflow-y-auto p-6 space-y-6"
              >
                <div className="flex flex-col items-center text-center space-y-4 py-4 max-w-xl mx-auto">
                  <div className="w-20 h-20 rounded-full border-4 border-[#165b4c] bg-white shadow-md overflow-hidden">
                    <img
                      src={douAvatar}
                      alt="도우"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <h2 id="about-chatbot-title" className="text-2xl font-semibold text-neutral-800">전경 토론,  도우(道友)</h2>
                    <p className="text-sm text-[#165b4c] mt-1 italic font-medium">"도(道)를 함께 닦아나가는 동반자이자 벗"</p>
                  </div>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    도우(道友)는 대순진리회 전경(典經)의 깊은 교리와 강증산 상제님, 조정산 도주님의 성스러운 삶의 행로를 음성 및 문자로 나누는 현대적 도담 인터페이스입니다.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto text-sm">
                  <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-300">
                    <h3 className="font-semibold text-neutral-800 mb-2 flex items-center gap-1.5 text-[#165b4c]">
                      <Star size={14} /> 해원상생 (解冤相生)
                    </h3>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      척과 원한을 풀고 서로 잘 사는 원리입니다. 도우는 일상의 곤경이나 사회적 사안에 대해서 항상 타협과 조화, 그리고 호생의 덕에 관한 해결책을 제시합니다.
                    </p>
                  </div>
                  <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-300">
                    <h3 className="font-semibold text-neutral-800 mb-2 flex items-center gap-1.5 text-[#165b4c]">
                      <BookOpen size={14} /> 전경(典經) 수록
                    </h3>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      상제의 탄강부터 천지공사의 결정, 수부 예식, 예시 등 전경에 수록된 세부 장절과 실화기록이 이앱에 탑재되었습니다.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-[#f4f4ee] rounded-xl border border-[#d6d6ca] max-w-3xl mx-auto text-xs text-neutral-600">
                  <p className="font-semibold text-[#165b4c] mb-1">💡 활용 도움말</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>"남을 잘 되게 하는 공부에 대해 설명해줘" 라고 대화를 건네보세요.</li>
                    <li>"요즘 인간관계 때문에 마음이 힘들어" 귀를 기부하고 도우와 깊게 고민을 토론할 수 있습니다.</li>
                    <li>우측 하단의 전경 목록이나 브라우저에서 '도우에게 이 구절 가르침 묻기'를 클릭해 전경 공부를 바로 시작할 수 있습니다.</li>
                  </ul>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

        </section>

        {/* Right Side: Scripture Peek Sidebar */}
        <section id="sidebar-browse-pane" className="w-full md:w-80 flex flex-col bg-white border border-neutral-300 rounded-2xl shadow-sm overflow-hidden h-[450px] md:h-full shrink-0">
          <div className="p-4 bg-[#f4f4ee] border-b border-neutral-200 shrink-0">
            <h2 className="font-semibold text-neutral-800 text-sm flex items-center gap-1.5">
              <BookOpen size={14} className="text-[#165b4c]" /> 도우 대화 가이드 (典經)
            </h2>
            <p className="text-[11px] text-neutral-500">대화 중 도우가 참고하는 전경구절 가이드를 클릭해 보세요.</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {jeonGyeongData.slice(0, 14).map((sec, i) => (
              <button
                key={i}
                id={`sidebar-shortcut-sec-${i}`}
                onClick={() => {
                  setInputText(`전경 ${sec.chapter} ${sec.section}의 말씀에 깃든 해해와 통찰에 대해 가르쳐 주십시오.`);
                  setActiveTab("chat");
                  speakText(`${sec.chapter} ${sec.section} 말씀을 토론하고 싶으시군요. 좋은 마음가짐이십니다.`);
                }}
                className="w-full text-left bg-neutral-50 hover:bg-neutral-100 p-3 rounded-lg border border-neutral-200 transition-all text-xs flex flex-col gap-1.5 cursor-pointer hover:border-[#165b4c]"
              >
                <div className="flex items-center justify-between text-[#165b4c] font-semibold">
                  <span>{sec.chapter} {sec.section}</span>
                  <span className="text-[10px] text-neutral-400">대화 시작하기</span>
                </div>
                <p className="text-neutral-600 line-clamp-2">
                  {sec.content}
                </p>
              </button>
            ))}
          </div>

          <div className="p-3 bg-neutral-100 border-t border-neutral-200 text-center shrink-0">
            <button
              id="expand-scriptures-pane-btn"
              onClick={() => setActiveTab("scriptures")}
              className="text-xs text-[#165b4c] font-semibold hover:underline flex items-center gap-1 justify-center mx-auto"
            >
              전체 전경(典經) 가이드북 열람하기 &rarr;
            </button>
          </div>
        </section>

      </main>

      {/* Decorative footer */}
      <footer id="app-footer-bar" className="bg-[#f0f0e8] border-t border-neutral-300 py-3 text-center text-xs text-neutral-500">
        <p>© 2026 도우(道友) 전경 대화록. 상생(相生)의 마음으로 평화가 깃들기를 축원합니다.</p>
      </footer>
    </div>
  );
}
