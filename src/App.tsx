/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { FileText, Play, Pause, SkipForward, SkipBack, Upload, Volume2, Loader2, Trash2, Headphones, Bookmark, BookmarkPlus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { extractTextFromPdf } from './lib/pdf';
import { generateSpeech, chunkText } from './lib/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string>('');
  const [chunks, setChunks] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<{ index: number; text: string }[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (uploadedFile && uploadedFile.type === 'application/pdf') {
      setFile(uploadedFile);
      setIsExtracting(true);
      try {
        const extractedText = await extractTextFromPdf(uploadedFile);
        if (!extractedText) {
          alert("Não foi possível encontrar texto neste PDF. Ele pode ser uma imagem ou estar protegido.");
          setFile(null);
          return;
        }
        setText(extractedText);
        const textChunks = chunkText(extractedText, 800);
        setChunks(textChunks);
        setCurrentChunkIndex(0);
      } catch (error) {
        console.error("Error extracting text:", error);
        alert("Erro ao ler o PDF. Verifique se o arquivo não está protegido.");
      } finally {
        setIsExtracting(false);
      }
    }
  };

  const [voice, setVoice] = useState<'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'>('Kore');

  const playCurrentChunk = async () => {
    if (currentChunkIndex >= chunks.length) {
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'undefined') {
      setIsLoading(false);
      alert("Chave de API do Gemini não configurada. Se você estiver usando o Netlify, adicione GEMINI_API_KEY às variáveis de ambiente.");
      return;
    }

    const audio = await generateSpeech(chunks[currentChunkIndex], voice);
    setIsLoading(false);

    if (audio) {
      // Clean up previous URL to prevent memory leaks
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      
      setAudioUrl(audio);
      if (audioRef.current) {
        audioRef.current.src = audio;
        audioRef.current.load(); // Ensure the new source is loaded
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (err) {
          console.error("Playback failed:", err);
          setIsPlaying(false);
        }
      }
    } else {
      setIsPlaying(false);
      alert("Erro ao gerar áudio. Verifique sua conexão ou tente novamente.");
    }
  };

  const togglePlay = async () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (audioUrl && audioRef.current) {
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (err) {
          console.error("Playback failed:", err);
          playCurrentChunk();
        }
      } else {
        playCurrentChunk();
      }
    }
  };

  const handleNext = () => {
    if (currentChunkIndex < chunks.length - 1) {
      setCurrentChunkIndex(prev => prev + 1);
      setAudioUrl(null);
    }
  };

  const handlePrev = () => {
    if (currentChunkIndex > 0) {
      setCurrentChunkIndex(prev => prev - 1);
      setAudioUrl(null);
    }
  };

  useEffect(() => {
    if (isPlaying && !audioUrl) {
      playCurrentChunk();
    }
  }, [currentChunkIndex]);

  const onAudioEnded = () => {
    if (currentChunkIndex < chunks.length - 1) {
      handleNext();
    } else {
      setIsPlaying(false);
    }
  };

  const reset = () => {
    setFile(null);
    setText('');
    setChunks([]);
    setCurrentChunkIndex(0);
    setIsPlaying(false);
    setAudioUrl(null);
    setBookmarks([]);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  };

  const toggleBookmark = () => {
    const exists = bookmarks.find(b => b.index === currentChunkIndex);
    if (exists) {
      setBookmarks(bookmarks.filter(b => b.index !== currentChunkIndex));
    } else {
      const snippet = chunks[currentChunkIndex].substring(0, 60) + "...";
      setBookmarks([...bookmarks, { index: currentChunkIndex, text: snippet }]);
    }
  };

  const isBookmarked = bookmarks.some(b => b.index === currentChunkIndex);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-zinc-950 selection:bg-emerald-500/30">
      <audio ref={audioRef} onEnded={onAudioEnded} hidden />

      <header className="w-full max-w-2xl mb-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Headphones className="text-zinc-950 w-6 h-6" />
          </div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">VozPDF</h1>
        </div>
        {file && (
          <button 
            onClick={reset}
            className="p-2 rounded-full hover:bg-zinc-900 text-zinc-400 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </header>

      <main className="w-full max-w-2xl flex flex-col items-center">
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <label className="group relative flex flex-col items-center justify-center w-full h-80 border-2 border-dashed border-zinc-800 rounded-3xl cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/[0.02] transition-all duration-300">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <div className="w-16 h-16 mb-6 rounded-2xl bg-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Upload className="w-8 h-8 text-zinc-400 group-hover:text-emerald-500" />
                  </div>
                  <p className="mb-2 text-xl font-display font-medium text-zinc-200">Carregar PDF</p>
                  <p className="text-sm text-zinc-500">Toque para selecionar ou arraste aqui</p>
                </div>
                <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
              </label>
            </motion.div>
          ) : (
            <motion.div
              key="reader"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full space-y-8"
            >
              {/* PDF Info Card */}
              <div className="p-6 rounded-3xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <FileText className="text-emerald-500 w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-zinc-100 font-medium truncate">{file.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-zinc-500 text-sm">
                      {isExtracting ? 'Extraindo texto...' : `${chunks.length} partes prontas`}
                    </p>
                    <span className="text-zinc-700">•</span>
                    <select 
                      value={voice}
                      onChange={(e) => {
                        setVoice(e.target.value as any);
                        setAudioUrl(null); // Force regenerate audio with new voice
                      }}
                      className="bg-transparent text-emerald-500 text-sm font-medium focus:outline-none cursor-pointer hover:text-emerald-400 transition-colors"
                    >
                      <option value="Kore">Voz: Kore</option>
                      <option value="Puck">Voz: Puck</option>
                      <option value="Charon">Voz: Charon</option>
                      <option value="Fenrir">Voz: Fenrir</option>
                      <option value="Zephyr">Voz: Zephyr</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Text Preview */}
              <div className="relative h-64 rounded-3xl bg-zinc-900/30 border border-zinc-800 overflow-hidden">
                <div className="absolute inset-0 p-6 overflow-y-auto scrollbar-hide">
                  <div className="text-zinc-400 leading-relaxed text-lg italic">
                    {isExtracting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processando documento...
                      </span>
                    ) : chunks.length > 0 ? (
                      chunks[currentChunkIndex]
                    ) : (
                      "Nenhum texto extraído deste documento."
                    )}
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-zinc-950/80 to-transparent pointer-events-none" />
              </div>

              {/* Controls */}
              <div className="flex flex-col items-center gap-8">
                <div className="flex items-center gap-6">
                  <button 
                    onClick={handlePrev}
                    disabled={currentChunkIndex === 0 || isLoading}
                    className="p-4 rounded-full bg-zinc-900 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <SkipBack className="w-6 h-6" />
                  </button>

                  <div className="relative">
                    <button 
                      onClick={togglePlay}
                      disabled={isExtracting || chunks.length === 0 || isLoading}
                      className={cn(
                        "w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300",
                        isPlaying 
                          ? "bg-zinc-100 text-zinc-950 scale-110" 
                          : "bg-emerald-500 text-zinc-950 hover:scale-105 shadow-emerald-500/20"
                      )}
                    >
                      {isLoading ? (
                        <Loader2 className="w-8 h-8 animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="w-8 h-8 fill-current" />
                      ) : (
                        <Play className="w-8 h-8 fill-current ml-1" />
                      )}
                    </button>
                    
                    <button 
                      onClick={toggleBookmark}
                      className={cn(
                        "absolute -top-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center border-2 border-zinc-950 transition-all duration-300",
                        isBookmarked ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                      )}
                    >
                      {isBookmarked ? <Bookmark className="w-5 h-5 fill-current" /> : <BookmarkPlus className="w-5 h-5" />}
                    </button>
                  </div>

                  <button 
                    onClick={handleNext}
                    disabled={currentChunkIndex === chunks.length - 1 || isLoading}
                    className="p-4 rounded-full bg-zinc-900 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <SkipForward className="w-6 h-6" />
                  </button>
                </div>

                <div className="w-full space-y-2">
                  <div className="flex justify-between text-xs font-mono text-zinc-500 uppercase tracking-widest">
                    <span>Progresso</span>
                    <span>{currentChunkIndex + 1} / {chunks.length}</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-emerald-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${((currentChunkIndex + 1) / chunks.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Bookmarks List */}
              {bookmarks.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full space-y-4 pt-4 border-t border-zinc-900"
                >
                  <h3 className="text-sm font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <Bookmark className="w-4 h-4" /> Marcadores
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {bookmarks.map((b) => (
                      <button
                        key={b.index}
                        onClick={() => {
                          setCurrentChunkIndex(b.index);
                          setAudioUrl(null);
                        }}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-2xl border transition-all text-left group",
                          currentChunkIndex === b.index 
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                            : "bg-zinc-900/30 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-mono opacity-50">#{b.index + 1}</span>
                          <p className="text-sm truncate">{b.text}</p>
                        </div>
                        <X 
                          className="w-4 h-4 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setBookmarks(bookmarks.filter(bm => bm.index !== b.index));
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-auto py-8 text-zinc-600 text-xs font-mono uppercase tracking-widest">
        Powered by Gemini AI & PDF.js
      </footer>
    </div>
  );
}
