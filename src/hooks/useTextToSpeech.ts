 import { useState, useCallback, useEffect } from "react";
 
 export function useTextToSpeech() {
   const [isSpeaking, setIsSpeaking] = useState(false);
   const [isSupported, setIsSupported] = useState(false);
 
   useEffect(() => {
     setIsSupported('speechSynthesis' in window);
   }, []);
 
   const speak = useCallback((text: string) => {
     if (!('speechSynthesis' in window)) return;
     
     // Cancel any ongoing speech
     window.speechSynthesis.cancel();
     
     // Strip markdown formatting for cleaner speech
     const cleanText = text
       .replace(/#{1,6}\s/g, '') // Remove headers
       .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
       .replace(/\*([^*]+)\*/g, '$1') // Remove italic
       .replace(/`([^`]+)`/g, '$1') // Remove inline code
       .replace(/```[\s\S]*?```/g, '') // Remove code blocks
       .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
       .replace(/[-*+]\s/g, '') // Remove list markers
       .trim();
     
     const utterance = new SpeechSynthesisUtterance(cleanText);
     
     // Try Myanmar, fallback to English
     utterance.lang = 'my-MM';
     
     // Get available voices and try to find Myanmar
     const voices = window.speechSynthesis.getVoices();
     const myanmarVoice = voices.find(v => v.lang.startsWith('my'));
     const englishVoice = voices.find(v => v.lang.startsWith('en'));
     
     if (myanmarVoice) {
       utterance.voice = myanmarVoice;
     } else if (englishVoice) {
       utterance.voice = englishVoice;
       utterance.lang = 'en-US';
     }
     
     utterance.rate = 0.9; // Slightly slower for clarity
     utterance.pitch = 1;
     
     utterance.onstart = () => setIsSpeaking(true);
     utterance.onend = () => setIsSpeaking(false);
     utterance.onerror = () => setIsSpeaking(false);
     
     window.speechSynthesis.speak(utterance);
   }, []);
 
   const stop = useCallback(() => {
     if ('speechSynthesis' in window) {
       window.speechSynthesis.cancel();
     }
     setIsSpeaking(false);
   }, []);
 
   const toggle = useCallback((text: string) => {
     if (isSpeaking) {
       stop();
     } else {
       speak(text);
     }
   }, [isSpeaking, speak, stop]);
 
   return { speak, stop, toggle, isSpeaking, isSupported };
 }