import { useEffect, useRef } from "react";
import { useLang } from "../i18n/LanguageContext.jsx";
export default function Modal({
  title,
  eyebrow,
  className = "",
  onClose,
  children,
}) {
  const { tr } = useLang();
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement,
      dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="modal-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
        <button className="close" onClick={onClose} aria-label={tr("Закрити")}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
