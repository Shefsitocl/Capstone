import { useEffect } from "react";

interface CheckinSuccessPopupProps {
  onClose: () => void;
  durationMs?: number;
}

export function CheckinSuccessPopup({
  onClose,
  durationMs = 4800,
}: CheckinSuccessPopupProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onClose();
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [onClose, durationMs]);

  return (
    <>
      <style>{`
        @keyframes kuraOverlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes kuraModalScaleIn {
          0% { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes kuraShutterTop {
          0% { transform: translateY(-102%); opacity: 1; }
          45% { transform: translateY(0%); opacity: 1; }
          72% { transform: translateY(0%); opacity: 1; }
          100% { transform: translateY(0%); opacity: 0; }
        }
        @keyframes kuraShutterBottom {
          0% { transform: translateY(102%); opacity: 1; }
          45% { transform: translateY(0%); opacity: 1; }
          72% { transform: translateY(0%); opacity: 1; }
          100% { transform: translateY(0%); opacity: 0; }
        }
        @keyframes kuraMessageReveal {
          0%, 62% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-live="assertive"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          backgroundColor: "rgba(15, 23, 42, 0.32)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          animation: "kuraOverlayIn 0.3s ease-out forwards",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "85%",
            maxWidth: "360px",
            minHeight: "340px",
            backgroundColor: "#FFFFFF",
            borderRadius: "24px",
            boxShadow: "0 12px 32px rgba(30, 64, 175, 0.12)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "36px 24px",
            textAlign: "center",
            animation: "kuraModalScaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          {/* Cortina superior del obturador (#BFDBFE) */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "50%",
              backgroundColor: "#BFDBFE",
              zIndex: 2,
              pointerEvents: "none",
              animation: "kuraShutterTop 1.35s cubic-bezier(0.4, 0, 0.2, 1) 0.15s forwards",
              transform: "translateY(-102%)",
            }}
          />

          {/* Cortina inferior del obturador (#1E40AF) */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "50%",
              backgroundColor: "#1E40AF",
              zIndex: 2,
              pointerEvents: "none",
              boxShadow: "0 -4px 16px rgba(30, 64, 175, 0.18)",
              animation: "kuraShutterBottom 1.35s cubic-bezier(0.4, 0, 0.2, 1) 0.15s forwards",
              transform: "translateY(102%)",
            }}
          />

          {/* Contenido final de confirmación sobre fondo blanco */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              animation: "kuraMessageReveal 1.65s ease-out forwards",
            }}
          >
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "9999px",
                border: "2.5px solid #1E40AF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "20px",
              }}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1E40AF"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h2
              style={{
                margin: "0 0 10px 0",
                fontSize: "26px",
                fontWeight: 700,
                lineHeight: 1.2,
                color: "#1E40AF",
                letterSpacing: "-0.02em",
              }}
            >
              ¡Gracias!
            </h2>

            <p
              style={{
                margin: "0 0 8px 0",
                fontSize: "18px",
                fontWeight: 600,
                lineHeight: 1.35,
                color: "#1E40AF",
              }}
            >
              Tu hora ha sido confirmada.
            </p>

            <p
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 400,
                lineHeight: 1.4,
                color: "#1E40AF",
              }}
            >
              Espera tu llamado.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}