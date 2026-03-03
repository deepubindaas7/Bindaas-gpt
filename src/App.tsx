/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Send, Bot, User, Sparkles, Loader2, Trash2, AlertCircle, RefreshCw, Mic, MicOff, Camera, CameraOff, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isError?: boolean;
  image?: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Namaste! Main hoon Deepu Bindaas. Kaise ho aap? Kuch bhi pucho, main bindaas jawab doonga! 😎',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  
  // Voice State
  const [isListening, setIsListening] = useState(false);
  const [isMicAvailable, setIsMicAvailable] = useState(true);
  const recognitionRef = useRef<any>(null);

  // Camera State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraAvailable, setIsCameraAvailable] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const modelVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [videoState, setVideoState] = useState<'silent' | 'think' | 'speak'>('silent');
  const [videoError, setVideoError] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speakText = (text: string) => {
    if (!window.speechSynthesis) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'hi-IN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setVideoState('speak');
    };

    utterance.onend = () => {
      setVideoState('silent');
    };

    utterance.onerror = () => {
      setVideoState('silent');
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    if (!process.env.GEMINI_API_KEY) {
      setApiKeyMissing(true);
    }
  }, [messages]);

  useEffect(() => {
    // Update video state based on loading/listening
    if (isLoading || isListening) {
      setVideoState('think');
      setVideoError(false);
    } else if (videoState === 'think') {
      setVideoState('silent');
      setVideoError(false);
    }
  }, [isLoading, isListening]);

  useEffect(() => {
    // Initialize Speech Recognition once
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'hi-IN';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setIsMicAvailable(false);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setIsMicAvailable(false);
    }

    // Cleanup
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Explicitly play video when state changes to ensure it works in all browsers
  useEffect(() => {
    if (modelVideoRef.current && !videoError) {
      modelVideoRef.current.load();
      modelVideoRef.current.play().catch(err => {
        console.warn("Video play failed:", err);
      });
    }
  }, [videoState, videoError]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      setIsCameraActive(false);
      setCapturedImage(null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsCameraActive(true);
          setIsCameraAvailable(true);
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setIsCameraAvailable(false);
        alert("Camera access nahi mila. Settings me jaake permission check karein.");
      }
    }
  };

  const captureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
      }
    }
  };

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() && !capturedImage && !isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
      image: capturedImage || undefined
    };

    if (!textOverride) {
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setCapturedImage(null);
    }
    
    setIsLoading(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key missing.");

      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3-flash-preview";
      
      const parts: any[] = [{ text: textToSend || "Is image ko dekho aur bindaas jawab do!" }];
      
      if (capturedImage) {
        parts.push({
          inlineData: {
            data: capturedImage.split(',')[1],
            mimeType: "image/jpeg"
          }
        });
      }

      const response = await ai.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: "You are 'Deepu Bindaas', a friendly, cool, and helpful AI assistant. You MUST always answer in Hindi. Your tone should be casual, 'bindaas' (carefree/cool), and very friendly. Use Hinglish where it feels natural. Use emojis. \n\nCRITICAL PERSONALITY DETAIL: If anyone asks who made you or who is your creator, you MUST say: 'Mujhe Deepu bhai ne banaya hai aur mai Deepu Bindaas hu'. \n\nIf you see an image from the camera, describe it or answer questions about it in your bindaas style.",
          temperature: 0.8,
        },
      });

      const aiResponse: Message = {
        role: 'assistant',
        content: response.text || 'Maaf karna, mujhse koi jawab nahi mila. Phir se try karo!',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiResponse]);
      
      // Speak the response
      if (response.text) {
        speakText(response.text);
      }
    } catch (error: any) {
      console.error('Deepu Bindaas Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Arre yaar, locha ho gaya: "${error.message}". Phir se try karo! 😅`,
          timestamp: new Date(),
          isError: true
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: 'Chat clear ho gaya! Ab naye sire se bindaas baatein karte hain. Kya haal chaal? 👋',
      timestamp: new Date(),
    }]);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-slate-200 font-sans overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.2)] bg-slate-800">
            <img 
              src={`${import.meta.env.BASE_URL}logo.png`} 
              alt="Deepu Bindaas Logo" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // Fallback if logo.png is missing
                (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/deepu/100/100';
              }}
            />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-yellow-300 bg-clip-text text-transparent">
              Deepu Bindaas
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-yellow-400" /> Online & Bindaas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {apiKeyMissing && (
            <div className="hidden md:flex items-center gap-1 text-red-400 text-[10px] bg-red-400/10 px-2 py-1 rounded border border-red-400/20">
              <AlertCircle className="w-3 h-3" /> API Key Missing
            </div>
          )}
          <button
            onClick={clearChat}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-red-400"
            title="Clear Chat"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar relative flex flex-col">
        {/* Animated Model Display */}
        <div className="flex justify-center mb-4 sticky top-0 z-10 py-2">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-48 h-64 md:w-56 md:h-72 bg-slate-900 rounded-3xl overflow-hidden border-4 border-orange-500/20 shadow-2xl shadow-orange-500/10 relative"
          >
            {!videoError ? (
              <video 
                ref={modelVideoRef}
                key={videoState}
                src={`${import.meta.env.BASE_URL}${videoState}.mp4`} 
                autoPlay 
                loop 
                muted 
                playsInline
                className="w-full h-full object-cover"
                onError={() => {
                  setVideoError(true);
                }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-slate-950 p-6 text-center">
                <motion.div
                  animate={videoState === 'think' ? { 
                    scale: [1, 1.1, 1],
                    rotate: [0, 5, -5, 0]
                  } : videoState === 'speak' ? {
                    scale: [1, 1.05, 1],
                    y: [0, -5, 0]
                  } : {
                    scale: [1, 1.02, 1]
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-tr from-orange-500 to-yellow-400 flex items-center justify-center shadow-2xl shadow-orange-500/40 mb-4 border-2 border-orange-400/50"
                >
                  <img 
                    src={`${import.meta.env.BASE_URL}logo.png`} 
                    alt="Deepu" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      // If logo missing, show the Bot icon as before
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <Bot className="w-12 h-12 text-slate-900 absolute" />
                </motion.div>
                <div className="space-y-1">
                  <h3 className="text-orange-400 font-bold text-sm tracking-tight">Deepu Bindaas</h3>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    {videoState === 'think' ? 'Deepu soch raha hai...' : 
                     videoState === 'speak' ? 'Deepu bol raha hai...' : 
                     'Deepu haazir hai!'}
                  </p>
                </div>
                
                {/* Visualizer for 'speak' state */}
                {videoState === 'speak' && (
                  <div className="flex gap-1 mt-4 h-4 items-end">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ height: [4, 16, 4] }}
                        transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                        className="w-1 bg-orange-500 rounded-full"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
              <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest flex items-center gap-2">
                {videoState === 'think' && <Loader2 className="w-3 h-3 animate-spin" />}
                {videoState === 'speak' && <Sparkles className="w-3 h-3 animate-pulse" />}
                {videoState}
              </span>
            </div>
          </motion.div>
        </div>

        <div className="flex-1 space-y-6">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex w-full gap-3",
                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                msg.role === 'user' ? "bg-indigo-600" : "bg-slate-800 border border-slate-700"
              )}>
                {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5 text-orange-400" />}
              </div>
              
              <div className={cn(
                "max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 shadow-sm relative group",
                msg.role === 'user' 
                  ? "bg-indigo-600 text-white rounded-tr-none" 
                  : msg.isError 
                    ? "bg-red-900/20 border border-red-500/30 text-red-200 rounded-tl-none"
                    : "bg-slate-800/80 border border-slate-700 rounded-tl-none"
              )}>
                {msg.image && (
                  <img src={msg.image} alt="Captured" className="w-full max-w-xs rounded-lg mb-2 border border-white/10" />
                )}
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
                
                {msg.isError && (
                  <button 
                    onClick={() => handleSend(messages[idx-1]?.content)}
                    className="mt-2 flex items-center gap-1 text-[10px] bg-red-500/20 hover:bg-red-500/40 px-2 py-1 rounded transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                )}

                <div className={cn(
                  "text-[10px] mt-1 opacity-50",
                  msg.role === 'user' ? "text-right" : "text-left"
                )}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Bot className="w-5 h-5 text-orange-400 animate-pulse" />
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
              <span className="text-sm text-slate-400">Deepu soch raha hai...</span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Camera Preview */}
        {isCameraActive && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed bottom-24 right-6 w-48 h-36 bg-slate-900 rounded-xl border-2 border-orange-500 overflow-hidden shadow-2xl z-30"
          >
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute top-1 right-1 flex gap-1">
              <button onClick={toggleCamera} className="p-1 bg-black/50 rounded-full text-white hover:bg-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={captureFrame}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-orange-500 text-white text-[10px] rounded-full font-bold shadow-lg"
            >
              Capture
            </button>
          </motion.div>
        )}
      </main>

      {/* Input Area */}
      <footer className="p-4 md:p-6 bg-slate-900/80 backdrop-blur-md border-t border-slate-800 shrink-0">
        <div className="max-w-4xl mx-auto space-y-3">
          {capturedImage && (
            <div className="relative inline-block">
              <img src={capturedImage} alt="Preview" className="h-20 rounded-lg border-2 border-orange-500" />
              <button 
                onClick={() => setCapturedImage(null)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          
          <div className="relative flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={apiKeyMissing ? "API Key missing!" : isListening ? "Bolte rahiye..." : "Deepu se kuch pucho..."}
                disabled={apiKeyMissing}
                className={cn(
                  "w-full bg-slate-800 border border-slate-700 rounded-full py-3 pl-6 pr-14 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all text-slate-100 placeholder:text-slate-500",
                  (apiKeyMissing || isListening) && "opacity-70"
                )}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  onClick={toggleListening}
                  className={cn(
                    "p-2 rounded-full transition-all",
                    isListening ? "bg-red-500 text-white animate-pulse" : 
                    !isMicAvailable ? "text-slate-600 cursor-not-allowed" : "text-slate-400 hover:text-orange-400 hover:bg-slate-700"
                  )}
                  title={!isMicAvailable ? "Microphone not available" : "Voice Chat"}
                  disabled={!isMicAvailable}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  onClick={toggleCamera}
                  className={cn(
                    "p-2 rounded-full transition-all",
                    isCameraActive ? "bg-orange-500 text-white" : 
                    !isCameraAvailable ? "text-slate-600 cursor-not-allowed" : "text-slate-400 hover:text-orange-400 hover:bg-slate-700"
                  )}
                  title={!isCameraAvailable ? "Camera not available" : "Camera Chat"}
                >
                  {isCameraActive ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                </button>
              </div>
            </div>
            
            <button
              onClick={() => handleSend()}
              disabled={(!input.trim() && !capturedImage) || isLoading || apiKeyMissing}
              className={cn(
                "p-3 rounded-full transition-all shrink-0",
                (input.trim() || capturedImage) && !isLoading && !apiKeyMissing
                  ? "bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/30" 
                  : "bg-slate-700 text-slate-500 cursor-not-allowed"
              )}
            >
              <Send className="w-6 h-6" />
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-slate-500 mt-3">
          Deepu Bindaas AI - Hamesha Hindi me, hamesha bindaas!
        </p>
      </footer>

      <canvas ref={canvasRef} className="hidden" />
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>
    </div>
  );
}
