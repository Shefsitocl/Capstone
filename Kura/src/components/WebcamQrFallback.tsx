import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export interface ParsedChileanId {
  rut: string;
  rawText: string;
  isOfficialSidiv: boolean;
  serial?: string;
}

interface WebcamQrFallbackProps {
  onScanSuccess: (data: ParsedChileanId) => void;
  onClose?: () => void;
}

function validateRutMod11(rutRaw: string): boolean {
  const clean = rutRaw.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return dv === expectedDv;
}

function formatRut(rutRaw: string): string {
  const clean = rutRaw.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

export function parseChileanIdQr(rawQrText: string): ParsedChileanId | null {
  const trimmed = rawQrText.trim();

  // 1. Cédula de identidad real: URL oficial SIDIV del Registro Civil
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      const runParam = url.searchParams.get("RUN") || url.searchParams.get("run");
      if (runParam && validateRutMod11(runParam)) {
        return {
          rut: formatRut(runParam),
          rawText: trimmed,
          isOfficialSidiv: url.hostname.includes("registrocivil.cl"),
          serial: url.searchParams.get("serial") || undefined,
        };
      }
    }
  } catch {
    // Si no es una URL válida, continúa con la búsqueda directa de RUT
  }

  // 2. Respaldo: texto plano con RUT (ej. "12.345.678-9" o "12345678-9")
  const rutMatch = trimmed.match(/(\d{1,2}\.?\d{3}\.?\d{3}-?[0-9kK])/);
  if (rutMatch && validateRutMod11(rutMatch[1])) {
    return {
      rut: formatRut(rutMatch[1]),
      rawText: trimmed,
      isOfficialSidiv: false,
    };
  }

  return null;
}

export function WebcamQrFallback({ onScanSuccess, onClose }: WebcamQrFallbackProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onScanSuccessRef = useRef(onScanSuccess);
  const [error, setError] = useState<string | null>(null);
  const [hintMsg, setHintMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId: number | null = null;
    let isMounted = true;

    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (!isMounted || !videoRef.current) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream = mediaStream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);

        intervalId = window.setInterval(() => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.readyState < 2) return;

          const width = video.videoWidth;
          const height = video.videoHeight;
          if (!width || !height) return;

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;

          ctx.drawImage(video, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });

          if (code && code.data) {
            const parsed = parseChileanIdQr(code.data);
            if (parsed) {
              if (intervalId) window.clearInterval(intervalId);
              onScanSuccessRef.current(parsed);
            } else {
              setHintMsg("Se detectó un QR, pero no corresponde a una cédula chilena válida.");
            }
          }
        }, 250);
      } catch {
        if (isMounted) {
          setError("No se pudo encender la cámara. Verifica los permisos del navegador.");
        }
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (intervalId) window.clearInterval(intervalId);
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="rounded-xl border border-teal-200 bg-slate-50 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">
            Cámara Local · Escaneo de Cédula Real
          </span>
          {scanning && (
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">
              Buscando QR...
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Cerrar cámara
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-lg bg-slate-900">
          <video ref={videoRef} className="h-60 w-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-36 w-36 rounded-xl border-2 border-teal-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]" />
          </div>
        </div>
      )}

      {hintMsg && (
        <p className="mt-2 text-xs font-medium text-amber-700">{hintMsg}</p>
      )}

      <p className="mt-2 text-xs text-slate-500">
        Acerca el QR del reverso de tu cédula de identidad al recuadro (evitando reflejos de luz sobre el plástico).
      </p>
    </div>
  );
}