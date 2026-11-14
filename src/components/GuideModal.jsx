import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import Modal from "./Modal.jsx";
import { createAvatar } from "../scene/avatar.js";
import { useLang } from "../i18n/LanguageContext.jsx";

// Гід ORI відповідає про весь проєкт. Вибрана точка (site) — лише додатковий
// контекст: про неї питають словами «ця локація». Розмова живе в App, тому
// не зникає, коли вікно закривають.
export default function GuideModal({
  world,
  site,
  messages,
  setMessages,
  compareIds = [],
  onAction,
  onClose,
}) {
  const { lang, tr } = useLang();
  const L = (uk, en) => (lang === "en" ? en : uk);
  const canvas = useRef(null),
    speaking = useRef(false),
    request = useRef(null),
    messagesEnd = useRef(null),
    speechId = useRef(0);
  const intro =
    L(
      "Вітаю! Я ОРІ — науковий гід ORBITAL. Відповідаю на запитання про весь проєкт: каталог земних аналогів, методику, джерела, клімат NASA POWER, карту й кандидатури. Відповідаю лише з даних проєкту, а якщо відповіді в них немає — так і скажу.",
      "Hello! I’m ORI, the ORBITAL science guide. Ask me about the whole project: the Earth analog catalog, methodology, sources, NASA POWER climate, the map and candidates. I answer only from the project’s data, and if it has no answer I’ll say so.",
    ) +
    (site
      ? L(
          `\n\nЗараз обрано «${site.name}» (${world.name}). Запитай «Чому ця локація — аналог?», і я розповім про неї.`,
          `\n\n“${site.name}” (${world.name}) is currently selected. Ask “Why is this location an analog?” and I’ll tell you about it.`,
        )
      : "");
  const shown = [{ role: "assistant", content: intro }, ...messages];
  const [input, setInput] = useState(""),
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
    const localText = L(
      "Гід ОРІ · відповіді з даних проєкту (без зовнішнього AI)",
      "ORI guide · answers from project data (no external AI)",
    );
    apiFetch("/api/status", { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        setReady(true);
        setLocalOnly(result.configured !== true);
        setStatus(
          result.configured && !result.local
            ? L(
                "AI підключено · відповіді лише з даних проєкту",
                "AI connected · answers grounded in project data only",
              )
            : localText,
        );
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setReady(true);
          setLocalOnly(true);
          setStatus(localText);
        }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);
  // Виконує автоматичні дії відповіді; повертає коментарі, якщо клієнт щось зауважив.
  function runAuto(actions = []) {
    return actions
      .filter((action) => action.auto)
      .map((action) => onAction?.(action))
      .filter(Boolean);
  }
  function addReply(text, actions = []) {
    const notes = runAuto(actions);
    setMessages((values) => [
      ...values,
      {
        role: "assistant",
        content: [text, ...notes].join("\n\n"),
        actions: actions.filter((action) => action.label),
      },
    ]);
    return text;
  }
  async function send(question) {
    if (!ready || busy || !question.trim()) return;
    const next = [...messages, { role: "user", content: question.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    request.current = new AbortController();
    try {
      if (localOnly) {
        const { guideReply } = await import("../../server/local-chat.mjs");
        const reply = guideReply(site ? world : null, site, next, lang, { compareIds });
        const text = addReply(reply.text, reply.actions);
        if (autoSpeak) speak(text);
        return;
      }
      const response = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(site ? { world: world.id, site: site.index } : {}),
          lang,
          compareIds,
          messages: next.slice(-8).map(({ role, content }) => ({ role, content })),
        }),
        signal: request.current.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(tr(result.error || "Не вдалося отримати відповідь"));
      addReply(result.text, result.actions);
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
  const suggestions = [
    [L("Що це за проєкт?", "What is this project?"), L("Що це за проєкт?", "What is this project?")],
    [L("Як користуватися?", "How do I use it?"), L("Як користуватися сайтом?", "How do I use this site?")],
    [L("Які є аналоги?", "Which analogs?"), L("Які є земні аналоги?", "Which Earth analogs are there?")],
    [L("Звідки дані?", "Data sources?"), L("Звідки дані?", "Where does the data come from?")],
    [L("✎ Нова кандидатура", "✎ New candidate"), L("Оформи кандидатуру", "Create candidate")],
    ...(site && world?.id === "earth"
      ? [[L("⇄ До порівняння", "⇄ To comparison"), L("Додай цю локацію до порівняння", "Add this location to comparison")]]
      : []),
    ...(site
      ? [
          [L("Чому ця локація?", "Why this location?"), L("Чому ця локація — аналог?", "Why is this location an analog?")],
          [L("Чого бракує?", "What’s missing?"), L("Яких даних бракує для цієї локації?", "What data is missing for this location?")],
        ]
      : []),
  ];
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
            {L("▶ Послухати вступ", "▶ Listen to the intro")}
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
            <span>
              {site
                ? `${L("Весь проєкт", "Whole project")} · ${L("обрано", "selected")}: ${world.name} / ${site.name}`
                : L("Весь проєкт ORBITAL", "Whole ORBITAL project")}
            </span>
            {messages.length > 0 && (
              <button
                className="text-button"
                onClick={() => {
                  stop();
                  setMessages([]);
                }}
              >
                {L("Нова розмова", "New chat")}
              </button>
            )}
          </div>
          <div className="chat-messages" aria-live="polite">
            {shown.map((message, index) => (
              <div key={index} className={"message " + message.role}>
                <span className="message-label">
                  {message.role === "user" ? tr("ТИ") : tr("ОРІ · ГІД")}
                </span>
                <span>{message.content}</span>
                {message.actions?.length > 0 && (
                  <span className="message-actions">
                    {message.actions.map((action, i) => (
                      <button
                        key={i}
                        className="chip-action"
                        onClick={() => {
                          const note = onAction?.(action);
                          if (note)
                            setMessages((values) => [
                              ...values,
                              { role: "assistant", content: note },
                            ]);
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </span>
                )}
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
            {suggestions.map(([label, question]) => (
              <button
                key={label}
                disabled={!ready || busy}
                onClick={() => send(question)}
              >
                {label}
              </button>
            ))}
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
              placeholder={L("Запитай про проєкт, аналоги, дані…", "Ask about the project, analogs, data…")}
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
