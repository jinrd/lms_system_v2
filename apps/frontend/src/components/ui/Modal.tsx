import { X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";

import { useFocusContainment } from "../../hooks/useFocusContainment";

type ModalProps = {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
};

export function Modal({ title, description, children, onClose }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  useFocusContainment(dialogRef, true);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        close();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);

    };
  }, []);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>

          <button
            type="button"
            className="icon-button"
            aria-label="닫기"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>

        <div className="dialog__body">{children}</div>
      </section>
    </div>
  );
}
