let lastCue = "";
let lastSpokenAt = 0;

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakCue(id: string, text: string, force = false): void {
  if (!canSpeak()) return;
  const now = Date.now();
  if (!force && (id === lastCue || now - lastSpokenAt < 8000)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.98;
  utterance.pitch = 1;
  const voices = synth.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  utterance.voice = voices.find((voice) => voice.localService && /natural|samantha|ava/i.test(voice.name))
    ?? voices.find((voice) => voice.localService)
    ?? voices[0]
    ?? null;
  synth.speak(utterance);
  lastCue = id;
  lastSpokenAt = now;
}

export function stopSpeech(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
  lastCue = "";
}
