import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import Modal from "./Modal.jsx";
import { createAvatar } from "../scene/avatar.js";
import { useLang } from "../i18n/LanguageContext.jsx";
export default function GuideModal({ world, site, onClose }) {
  const { lang, tr } = useLang();
  const canvas = useRef(null),
    speaking = useRef(false),
    request = useRef(null),
    messagesEnd = useRef(null),
    speechId = useRef(0);
  const intro = lang === "en"
    ? `Hello! I’m ORI. Let’s explore “${site.name}”.\n\n${site.science?.summary || site.description}\n\n${site.science?.limit || world.desc}`
    : `Вітаю! Я ОРІ. Досліджуємо локацію «${site.name}».\n\n${site.science?.summary || site.description}\n\n${site.science?.limit || world.desc}`;
  const [messages, setMessages] = useState([
      { role: "assistant", content: intro },
    ]),
    [input, setInput] = useState(""),
    [ready, setReady] = useState(false),
    [localOnly, setLocalOnly] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(tr("Перевірка підключення AI…")),
    [voiceStatus, setVoiceStatus] = useState(tr("Озвучення голосом браузера")),
    [autoSpeak, setAutoSpeak] = useState(true),
    [speechActive, setSpeechActive] = useState(false);
  function stop() {
    speechId.current++;
    window.speechSynthesis?.cancel();
    speaking.current = false;
    setSpeechActive(false);
  }
  function speak(text) {
    stop();
    const synth = window.speechSynthesis;
    const voice = synth
      ?.getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith(lang));
    if (!voice) {
      setVoiceStatus(
        tr(lang === "en"
          ? "An English browser voice is unavailable. The story is available in the chat."
          : "Український голос браузера недоступний. Розповідь є в чаті."),
      );
      return;
    }
    const id = speechId.current,
      utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = lang === "en" ? "en-US" : "uk-UA";
    utterance.rate = 0.95;
    utterance.onstart = () => {
      if (id !== speechId.current) return;
      speaking.current = true;
      setSpeechActive(true);
      setVoiceStatus(tr("ОРІ розповідає…"));
    };
    utterance.onend = () => {
      if (id !== speechId.current) return;
      speaking.current = false;
      setSpeechActive(false);
      setVoiceStatus(tr("Розповідь завершено"));
    };
    utterance.onerror = () => {
      if (id !== speechId.current) return;
      speaking.current = false;
      setSpeechActive(false);
      setVoiceStatus(tr("Озвучення зараз недоступне"));
    };
    synth.speak(utterance);
  }
  useEffect(() => {
    let cleanup;
    try {
      cleanup = createAvatar(canvas.current, () => speaking.current);
    } catch {
      setVoiceStatus(
        tr("3D-аватар недоступний у цьому браузері. Розповідь є в чаті."),
      );
    }
    return () => {
      cleanup?.();
      speechId.current++;
      window.speechSynthesis?.cancel();
      request.current?.abort();
    };
  }, [tr]);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/api/status", { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        setReady(true);
        setLocalOnly(result.configured !== true);
        setStatus(
          result.configured
            ? result.local
              ? tr("Гід ОРІ · відповіді з даних локації (без зовнішнього AI)")
              : tr("AI підключено · відповіді з контекстом локації")
            : tr("Гід ОРІ · відповіді з даних локації (без зовнішнього AI)"),
        );
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setReady(true);
          setLocalOnly(true);
          setStatus(tr("Гід ОРІ · відповіді з даних локації (без зовнішнього AI)"));
        }
      });
    return () => controller.abort();
  }, [tr]);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);
  async function send(question) {
    if (!ready || busy || !question.trim()) return;
    const next = [...messages, { role: "user", content: question.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    request.current = new AbortController();
    try {
      if (localOnly) {
        const { localAnswer } = await import("../../server/local-chat.mjs");
        const text = localAnswer(world, site, next, lang);
        setMessages((values) => [...values, { role: "assistant", content: text }]);
        if (autoSpeak) speak(text);
        return;
      }
      const response = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          world: world.id,
          site: site.index,
          lang,
          messages: next.slice(-8),
        }),
        signal: request.current.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(tr(result.error || "Не вдалося отримати відповідь"));
      setMessages((values) => [
        ...values,
        { role: "assistant", content: result.text },
      ]);
      if (autoSpeak) speak(result.text);
    } catch (error) {
      if (error.name !== "AbortError")
        setMessages((values) => [
          ...values,
          { role: "assistant", content: tr(error.message) },
        ]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={tr("Запитай ОРІ")}
      eyebrow={tr("ORBITAL · НАУКОВИЙ ГІД")}
      className="guide-modal"
      onClose={onClose}
    >
      <div className="guide-layout">
        <div className="avatar-column">
          <div className="avatar-stage">
            <canvas id="avatarCanvas" ref={canvas} aria-label={tr("3D-гід ОРІ")} />
            <span className="avatar-tag">
              <i />
              {tr("ОРІ · твій гід")}
            </span>
          </div>
          <button className="action" onClick={() => speak(intro)}>
            {tr("▶ Послухати про локацію")}
          </button>
          {speechActive && (
            <button className="text-button" onClick={stop}>
              {tr("■ Зупинити")}
            </button>
          )}
          <p className="mini-note">{voiceStatus}</p>
        </div>
        <div className="chat-column">
          <div className="chat-context">
            {world.name} / {site.name}
          </div>
          <div className="chat-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div key={index} className={"message " + message.role}>
                <span className="message-label">
                  {message.role === "user" ? tr("ТИ") : tr("ОРІ · ГІД")}
                </span>
                <span>{message.content}</span>
                {message.role === "assistant" && (
                  <button onClick={() => speak(message.content)}>
                    {tr("▷ Озвучити")}
                  </button>
                )}
              </div>
            ))}
            {busy && <p className="mini-note">{tr("ОРІ обмірковує запитання…")}</p>}
            <div ref={messagesEnd} />
          </div>
          <div className="suggestions">
            <button
              disabled={!ready || busy}
              onClick={() => send(lang === "en" ? "Which features of this location make it an analog?" : "Які саме ознаки цієї локації є аналогами?")}
            >
              {tr("Яка аналогія?")}
            </button>
            <button
              disabled={!ready || busy}
              onClick={() => send(lang === "en" ? "What data is missing to assess this location?" : "Яких даних бракує для оцінки цієї локації?")}
            >
              {tr("Чого бракує?")}
            </button>
          </div>
          <p className="mini-note" role="status">
            {status}
          </p>
          <form
            id="chatForm"
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
          >
            <input
              id="chatInput"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={!ready || busy}
              maxLength={1200}
              required
              placeholder={tr("Запитай про цю локацію…")}
              aria-label={tr("Запитання гіду")}
            />
            <button
              id="sendChat"
              disabled={!ready || busy}
              aria-label={tr("Надіслати")}
            >
              ↑
            </button>
          </form>
          <label className="voice-setting">
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(event) => setAutoSpeak(event.target.checked)}
            />
            {tr("Озвучувати відповіді")}
          </label>
        </div>
      </div>
    </Modal>
  );
}
